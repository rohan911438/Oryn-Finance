const logger = require('../config/logger');
const sorobanService = require('./sorobanService');

const MAX_ATTEMPTS = parseInt(process.env.TX_RETRY_ATTEMPTS || '4', 10);
const BACKOFF_MS    = parseInt(process.env.TX_RETRY_BACKOFF_MS || '2000', 10);

/**
 * Lightweight in-process retry queue for Soroban submissions.
 * Production deployments can swap this for Redis-backed Bull workers;
 * the public API surface stays the same.
 *
 * Issue #23: enhanced with
 *   - Trade model status updates (pending → confirmed | failed)
 *   - WebSocket notifications to the owning wallet on each outcome
 */
class TransactionRetryQueue {
  constructor() {
    this.isEnabled       = true;
    this.recentFailures  = [];
    this.recentSuccesses = [];
    this._io             = null; // injected after server starts
  }

  /**
   * Inject the Socket.io server instance so the queue can push real-time
   * notifications to connected clients.
   *
   * @param {import('socket.io').Server} io
   */
  injectIo(io) {
    this._io = io;
  }

  /**
   * Schedule background retries with exponential backoff.
   *
   * @param {{ signedXDR: string, txHash: string, tradeId?: string, walletAddress?: string }} options
   */
  enqueue({ signedXDR, txHash, tradeId, walletAddress }) {
    const jobId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const job = {
      jobId,
      signedXDR,
      txHash,
      tradeId:       tradeId       || null,
      walletAddress: walletAddress || null,
      attempt:       0,
    };

    setImmediate(() => this._processJob(job));

    logger.info('Transaction enqueued for retry', { jobId, tradeId, attempt: 0 });

    return { queued: true, jobId };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  async _processJob(job) {
    try {
      const result = await sorobanService.submitSignedTransaction(job.signedXDR);
      await this._handleSuccess(job, result);
    } catch (error) {
      job.attempt += 1;

      logger.warn('Transaction submit attempt failed', {
        jobId:   job.jobId,
        attempt: job.attempt,
        message: error.message,
      });

      if (job.attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_MS * Math.pow(2, job.attempt - 1);
        setTimeout(() => this._processJob(job), delay);
      } else {
        await this._handleExhausted(job, error);
      }
    }
  }

  async _handleSuccess(job, result) {
    // Update Trade document if we have a tradeId
    if (job.tradeId) {
      try {
        const { Trade } = require('../models');
        await Trade.findOneAndUpdate(
          { tradeId: job.tradeId },
          {
            status: 'confirmed',
            'txDetails.stellarTxHash': result?.hash || job.txHash || null,
            confirmedAt: new Date(),
          }
        );
      } catch (dbErr) {
        logger.warn('Could not update Trade on retry success (non-DB mode?)', { error: dbErr.message });
      }
    }

    // Notify the owning wallet via WebSocket
    this._notify(job.walletAddress, {
      event:   'tx:confirmed',
      jobId:   job.jobId,
      tradeId: job.tradeId,
      txHash:  result?.hash || job.txHash || null,
      message: 'Your transaction was confirmed after retry.',
    });

    this.recentSuccesses.unshift({
      jobId:       job.jobId,
      txHash:      result?.hash || job.txHash || null,
      tradeId:     job.tradeId,
      recoveredAt: new Date().toISOString(),
    });
    this.recentSuccesses = this.recentSuccesses.slice(0, 50);

    logger.info('Background transaction retry succeeded', {
      jobId:  job.jobId,
      txHash: result?.hash || null,
    });
  }

  async _handleExhausted(job, error) {
    // Mark Trade as permanently failed
    if (job.tradeId) {
      try {
        const { Trade } = require('../models');
        await Trade.findOneAndUpdate(
          { tradeId: job.tradeId },
          {
            status:     'failed',
            failReason: `Retries exhausted after ${job.attempt} attempts: ${error.message}`,
          }
        );
      } catch (dbErr) {
        logger.warn('Could not update Trade on retry exhaustion (non-DB mode?)', { error: dbErr.message });
      }
    }

    // Notify user of permanent failure
    this._notify(job.walletAddress, {
      event:   'tx:failed',
      jobId:   job.jobId,
      tradeId: job.tradeId,
      message: `Transaction failed after ${job.attempt} retry attempts. Please try again.`,
      error:   error.message,
    });

    this.recentFailures.unshift({
      jobId:    job.jobId,
      txHash:   job.txHash || null,
      tradeId:  job.tradeId,
      attempts: job.attempt,
      message:  error.message,
      failedAt: new Date().toISOString(),
    });
    this.recentFailures = this.recentFailures.slice(0, 100);

    logger.error('Background transaction retries exhausted', {
      jobId:    job.jobId,
      attempts: job.attempt,
      error:    error.message,
    });
  }

  /**
   * Emit a real-time notification to a wallet's socket room.
   * Clients join a room named after their wallet address on connect.
   */
  _notify(walletAddress, payload) {
    if (!walletAddress) return;

    if (this._io) {
      this._io.to(walletAddress.toLowerCase()).emit('notification', payload);
    } else {
      logger.warn('TransactionRetryQueue: Socket.io not injected — skipping real-time notification', {
        event: payload.event,
      });
    }
  }

  getRecoverySnapshot() {
    return {
      queueEnabled:     this.isEnabled,
      maxAttempts:      MAX_ATTEMPTS,
      backoffMs:        BACKOFF_MS,
      recentFailures:   this.recentFailures,
      recentRecoveries: this.recentSuccesses,
    };
  }
}

module.exports = new TransactionRetryQueue();

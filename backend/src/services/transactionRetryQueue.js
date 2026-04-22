const logger = require('../config/logger');
const sorobanService = require('./sorobanService');

const MAX_ATTEMPTS = parseInt(process.env.TX_RETRY_ATTEMPTS || '4', 10);
const BACKOFF_MS = parseInt(process.env.TX_RETRY_BACKOFF_MS || '2000', 10);

/**
 * Lightweight in-process retry queue for Soroban submissions.
 * Production deployments can swap this for Redis-backed Bull workers; the API surface stays the same.
 */
class TransactionRetryQueue {
  constructor() {
    this.isEnabled = true;
    this.recentFailures = [];
    this.recentSuccesses = [];
  }

  /**
   * Schedule background retries with exponential backoff.
   */
  enqueue({ signedXDR, txHash }) {
    const jobId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const job = {
      jobId,
      signedXDR,
      txHash,
      attempt: 0
    };

    setImmediate(() => this.processJob(job));

    return {
      queued: true,
      jobId
    };
  }

  async processJob(job) {
    try {
      const result = await sorobanService.submitSignedTransaction(job.signedXDR);
      this.recordSuccess(job, result);
    } catch (error) {
      job.attempt += 1;

      logger.warn('Transaction submit attempt failed', {
        jobId: job.jobId,
        attempt: job.attempt,
        message: error.message
      });

      if (job.attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_MS * Math.pow(2, job.attempt - 1);
        setTimeout(() => this.processJob(job), delay);
      } else {
        this.recordFailure(job, error);
      }
    }
  }

  recordSuccess(job, result) {
    this.recentSuccesses.unshift({
      jobId: job.jobId,
      txHash: result?.hash || job.txHash || null,
      recoveredAt: new Date().toISOString()
    });
    this.recentSuccesses = this.recentSuccesses.slice(0, 50);

    logger.info('Background transaction retry succeeded', {
      jobId: job.jobId,
      txHash: result?.hash || null
    });
  }

  recordFailure(job, error) {
    this.recentFailures.unshift({
      jobId: job.jobId,
      txHash: job.txHash || null,
      attempts: job.attempt,
      message: error.message,
      failedAt: new Date().toISOString()
    });
    this.recentFailures = this.recentFailures.slice(0, 100);

    logger.error('Background transaction retries exhausted', {
      jobId: job.jobId,
      attempts: job.attempt,
      error: error.message
    });
  }

  getRecoverySnapshot() {
    return {
      queueEnabled: this.isEnabled,
      maxAttempts: MAX_ATTEMPTS,
      backoffMs: BACKOFF_MS,
      recentFailures: this.recentFailures,
      recentRecoveries: this.recentSuccesses
    };
  }
}

module.exports = new TransactionRetryQueue();

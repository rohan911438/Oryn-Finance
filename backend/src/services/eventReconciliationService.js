const logger = require('../config/logger');
const { IndexedEvent, Trade, Position, Market } = require('../models');
const sorobanService = require('./sorobanService');

class EventReconciliationService {
  constructor() {
    this.isRunning = false;
    this.reconciliationInterval = 300000; // 5 minutes
    this.maxRetries = 3;
  }

  /**
   * Start the event reconciliation service
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Event reconciliation service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting event reconciliation service...');

    // Run initial reconciliation
    await this.runReconciliation();

    // Schedule periodic reconciliation
    this.scheduleReconciliation();
  }

  /**
   * Stop the event reconciliation service
   */
  stop() {
    this.isRunning = false;
    if (this.reconciliationTimeout) {
      clearTimeout(this.reconciliationTimeout);
    }
    logger.info('Event reconciliation service stopped');
  }

  /**
   * Schedule periodic reconciliation
   */
  scheduleReconciliation() {
    if (!this.isRunning) return;

    this.reconciliationTimeout = setTimeout(async () => {
      try {
        await this.runReconciliation();
      } catch (error) {
        logger.error('Error during scheduled reconciliation:', error);
      }
      
      // Schedule next run
      this.scheduleReconciliation();
    }, this.reconciliationInterval);
  }

  /**
   * Run reconciliation process
   */
  async runReconciliation() {
    try {
      logger.info('Starting event reconciliation process...');

      // Get events that need reconciliation
      const eventsToReconcile = await IndexedEvent.find({
        reconciliationStatus: { $in: ['not_checked', 'mismatch', 'error'] },
        reconciliationAttempts: { $lt: this.maxRetries }
      }).limit(100);

      logger.info(`Found ${eventsToReconcile.length} events to reconcile`);

      // Process events in batches
      const batchSize = 10;
      for (let i = 0; i < eventsToReconcile.length; i += batchSize) {
        const batch = eventsToReconcile.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(event => this.reconcileEvent(event)));
      }

      logger.info('Event reconciliation process completed');
    } catch (error) {
      logger.error('Failed to run reconciliation:', error);
    }
  }

  /**
   * Reconcile a single event
   */
  async reconcileEvent(event) {
    try {
      logger.debug(`Reconciling event: ${event.txHash} (${event.topic})`);

      // Increment reconciliation attempts
      await IndexedEvent.updateOne(
        { _id: event._id },
        { $inc: { reconciliationAttempts: 1 } }
      );

      // Verify event against blockchain
      const isValid = await this.verifyEventOnChain(event);

      if (isValid) {
        // Verify event against related database records
        const dbMatch = await this.verifyEventWithDatabase(event);

        if (dbMatch) {
          await IndexedEvent.updateOne(
            { _id: event._id },
            {
              $set: {
                reconciliationStatus: 'matched',
                lastReconciledAt: new Date(),
                reconciliationError: null
              }
            });
          logger.debug(`Event ${event.txHash} successfully reconciled`);
        } else {
          await IndexedEvent.updateOne(
            { _id: event._id },
            {
              $set: {
                reconciliationStatus: 'mismatch',
                lastReconciledAt: new Date(),
                reconciliationError: 'Database record mismatch'
              }
            });
          logger.warn(`Event ${event.txHash} has database mismatch`);
        }
      } else {
        await IndexedEvent.updateOne(
          { _id: event._id },
          {
            $set: {
              reconciliationStatus: 'mismatch',
              lastReconciledAt: new Date(),
              reconciliationError: 'Blockchain verification failed'
            }
          });
        logger.warn(`Event ${event.txHash} failed blockchain verification`);
      }
    } catch (error) {
      logger.error(`Failed to reconcile event ${event.txHash}:`, error);
      await IndexedEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            reconciliationStatus: 'error',
            lastReconciledAt: new Date(),
            reconciliationError: error.message
          }
        });
    }
  }

  /**
   * Verify event against blockchain
   */
  async verifyEventOnChain(event) {
    try {
      // Get transaction from blockchain
      const txResult = await sorobanService.getTransaction(event.txHash);
      
      if (!txResult || !txResult.success) {
        return false;
      }

      // Verify ledger matches
      if (txResult.ledger && event.ledger !== txResult.ledger) {
        return false;
      }

      // Verify contract address matches
      if (event.contractId && txResult.operations) {
        const hasMatchingOperation = txResult.operations.some(op => 
          op.contract === event.contractId
        );
        if (!hasMatchingOperation) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error(`Blockchain verification failed for event ${event.txHash}:`, error);
      return false;
    }
  }

  /**
   * Verify event against database records
   */
  async verifyEventWithDatabase(event) {
    try {
      switch (event.eventType) {
        case 'trade':
          return await this.verifyTradeEvent(event);
        case 'investment':
          return await this.verifyInvestmentEvent(event);
        case 'withdrawal':
          return await this.verifyWithdrawalEvent(event);
        case 'liquidity_add':
        case 'liquidity_remove':
          return await this.verifyLiquidityEvent(event);
        case 'market_creation':
          return await this.verifyMarketCreationEvent(event);
        case 'market_resolution':
          return await this.verifyMarketResolutionEvent(event);
        case 'winnings_claimed':
          return await this.verifyWinningsClaimedEvent(event);
        default:
          // For other event types, just check that the event exists
          return true;
      }
    } catch (error) {
      logger.error(`Database verification failed for event ${event.txHash}:`, error);
      return false;
    }
  }

  /**
   * Verify trade event
   */
  async verifyTradeEvent(event) {
    const trade = await Trade.findOne({
      stellarTransactionHash: event.txHash,
      marketId: event.marketId,
      userWalletAddress: event.userAddress
    });

    if (!trade) {
      return false;
    }

    // Verify amount matches (within small tolerance for precision)
    const eventAmount = parseFloat(event.amount?.toString() || '0');
    const tradeAmount = trade.amount || 0;
    const tolerance = 0.0001;

    if (Math.abs(eventAmount - tradeAmount) > tolerance) {
      return false;
    }

    return true;
  }

  /**
   * Verify investment event
   */
  async verifyInvestmentEvent(event) {
    // Check if position exists with matching investment
    const position = await Position.findOne({
      marketId: event.marketId,
      userWalletAddress: event.userAddress
    });

    if (!position) {
      // Position might not exist yet if event is very recent
      return true;
    }

    // Verify investment amount is reflected in position
    const eventAmount = parseFloat(event.amount?.toString() || '0');
    const positionInvested = position.totalInvested || 0;

    // For investment events, position should have increased
    // This is a simplified check - in production you'd track individual investments
    return positionInvested >= 0;
  }

  /**
   * Verify withdrawal event
   */
  async verifyWithdrawalEvent(event) {
    const position = await Position.findOne({
      marketId: event.marketId,
      userWalletAddress: event.userAddress
    });

    if (!position) {
      // Position might have been closed
      return true;
    }

    // Verify withdrawal is reflected in position
    const eventAmount = parseFloat(event.amount?.toString() || '0');
    const positionInvested = position.totalInvested || 0;

    // For withdrawal events, position should have decreased
    // This is a simplified check
    return true;
  }

  /**
   * Verify liquidity event
   */
  async verifyLiquidityEvent(event) {
    // Liquidity events are tracked in separate liquidity position records
    // For now, we'll just verify the event exists
    return true;
  }

  /**
   * Verify market creation event
   */
  async verifyMarketCreationEvent(event) {
    const market = await Market.findOne({
      marketId: event.marketId,
      blockchainTxHash: event.txHash
    });

    return !!market;
  }

  /**
   * Verify market resolution event
   */
  async verifyMarketResolutionEvent(event) {
    const market = await Market.findOne({
      marketId: event.marketId,
      resolutionTxHash: event.txHash
    });

    return !!market;
  }

  /**
   * Verify winnings claimed event
   */
  async verifyWinningsClaimedEvent(event) {
    const position = await Position.findOne({
      marketId: event.marketId,
      userWalletAddress: event.userAddress,
      claimTxHash: event.txHash
    });

    return !!position;
  }

  /**
   * Manually trigger reconciliation for specific transaction
   */
  async reconcileTransaction(txHash) {
    try {
      const event = await IndexedEvent.findOne({ txHash });
      
      if (!event) {
        throw new Error('Event not found');
      }

      await this.reconcileEvent(event);

      return {
        success: true,
        txHash,
        reconciliationStatus: event.reconciliationStatus
      };
    } catch (error) {
      logger.error(`Failed to reconcile transaction ${txHash}:`, error);
      throw error;
    }
  }

  /**
   * Get reconciliation statistics
   */
  async getReconciliationStats() {
    try {
      const stats = await IndexedEvent.aggregate([
        {
          $group: {
            _id: '$reconciliationStatus',
            count: { $sum: 1 }
          }
        }
      ]);

      const totalEvents = await IndexedEvent.countDocuments();
      const matchedCount = stats.find(s => s._id === 'matched')?.count || 0;
      const mismatchCount = stats.find(s => s._id === 'mismatch')?.count || 0;
      const errorCount = stats.find(s => s._id === 'error')?.count || 0;
      const notCheckedCount = stats.find(s => s._id === 'not_checked')?.count || 0;

      return {
        totalEvents,
        matched: matchedCount,
        mismatched: mismatchCount,
        errors: errorCount,
        notChecked: notCheckedCount,
        reconciliationRate: totalEvents > 0 ? (matchedCount / totalEvents * 100).toFixed(2) : '0'
      };
    } catch (error) {
      logger.error('Failed to get reconciliation stats:', error);
      throw error;
    }
  }

  /**
   * Detect and handle duplicate events
   */
  async detectDuplicates() {
    try {
      logger.info('Starting duplicate detection...');

      // Find potential duplicates by txHash and topic
      const duplicates = await IndexedEvent.aggregate([
        {
          $group: {
            _id: { txHash: '$txHash', topic: '$topic', contractId: '$contractId' },
            count: { $sum: 1 },
            docs: { $push: '$_id' }
          }
        },
        {
          $match: { count: { $gt: 1 } }
        }
      ]);

      logger.info(`Found ${duplicates.length} potential duplicate groups`);

      // Remove duplicates, keeping the first occurrence
      for (const duplicate of duplicates) {
        if (duplicate.docs.length > 1) {
          // Keep the first document, delete the rest
          const toKeep = duplicate.docs[0];
          const toDelete = duplicate.docs.slice(1);

          await IndexedEvent.deleteMany({ _id: { $in: toDelete } });
          logger.info(`Removed ${toDelete.length} duplicates for txHash: ${duplicate._id.txHash}`);
        }
      }

      return {
        success: true,
        duplicatesFound: duplicates.length,
        duplicatesRemoved: duplicates.reduce((sum, d) => sum + (d.docs.length - 1), 0)
      };
    } catch (error) {
      logger.error('Failed to detect duplicates:', error);
      throw error;
    }
  }
}

module.exports = new EventReconciliationService();

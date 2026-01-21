const cron = require('node-cron');
const logger = require('../config/logger');
const { Market, Trade, Position, User } = require('../models');
const stellarService = require('./stellarService');
const sorobanService = require('./sorobanService');
const oracleService = require('./oracleService');
const websocketHandler = require('./websocketHandler');

class BackgroundJobs {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      logger.warn('Background jobs already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting background jobs...');

    // Index Stellar transactions every 30 seconds
    this.jobs.set('stellarIndexing', cron.schedule('*/30 * * * * *', async () => {
      await this.indexStellarTransactions();
    }, { scheduled: false }));

    // Check for expired markets every hour
    this.jobs.set('expiredMarkets', cron.schedule('0 * * * *', async () => {
      await this.processExpiredMarkets();
    }, { scheduled: false }));

    // Update market statistics every 10 minutes
    this.jobs.set('marketStats', cron.schedule('*/10 * * * *', async () => {
      await this.updateMarketStatistics();
    }, { scheduled: false }));

    // Update leaderboards every 5 minutes
    this.jobs.set('leaderboards', cron.schedule('*/5 * * * *', async () => {
      await this.updateLeaderboards();
    }, { scheduled: false }));

    // Clean up old data daily at 2 AM
    this.jobs.set('cleanup', cron.schedule('0 2 * * *', async () => {
      await this.cleanupOldData();
    }, { scheduled: false }));

    // Check pending trades every minute
    this.jobs.set('pendingTrades', cron.schedule('* * * * *', async () => {
      await this.processPendingTrades();
    }, { scheduled: false }));

    // Update user reputation scores every 6 hours
    this.jobs.set('userReputation', cron.schedule('0 */6 * * *', async () => {
      await this.updateUserReputationScores();
    }, { scheduled: false }));

    // Start all jobs
    this.jobs.forEach(job => job.start());
    
    logger.info(`Started ${this.jobs.size} background jobs`);
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('Background jobs not running');
      return;
    }

    logger.info('Stopping background jobs...');
    
    this.jobs.forEach(job => job.destroy());
    this.jobs.clear();
    this.isRunning = false;
    
    logger.info('Background jobs stopped');
  }

  // Index new Stellar transactions
  async indexStellarTransactions() {
    try {
      const startTime = Date.now();
      
      // Get the last processed ledger
      let lastProcessedLedger = await this.getLastProcessedLedger();
      
      // Get latest ledger from Stellar
      const networkStatus = await stellarService.getNetworkStatus();
      const currentLedger = networkStatus.latestLedger?.sequence;
      
      if (!currentLedger || currentLedger <= lastProcessedLedger) {
        return; // No new ledgers to process
      }

      let processedTransactions = 0;
      
      // Process ledgers in batches
      for (let ledger = lastProcessedLedger + 1; ledger <= currentLedger; ledger += 10) {
        const endLedger = Math.min(ledger + 9, currentLedger);
        
        try {
          // Get transactions for these ledgers
          // This would involve querying Stellar Horizon for transactions
          // related to Oryn markets (by memo or account)
          
          // For now, just simulate processing
          await new Promise(resolve => setTimeout(resolve, 100));
          
          processedTransactions += 5; // Simulated count
        } catch (error) {
          logger.error(`Failed to process ledger range ${ledger}-${endLedger}:`, error);
        }
      }

      // Update last processed ledger
      await this.setLastProcessedLedger(currentLedger);
      
      const duration = Date.now() - startTime;
      logger.info('Stellar transaction indexing completed', {
        processedTransactions,
        ledgerRange: `${lastProcessedLedger + 1}-${currentLedger}`,
        duration: `${duration}ms`
      });
    } catch (error) {
      logger.error('Stellar transaction indexing failed:', error);
    }
  }

  // Process expired markets for resolution
  async processExpiredMarkets() {
    try {
      const expiredMarkets = await Market.findExpiredMarkets();
      
      for (const market of expiredMarkets) {
        try {
          await this.processMarketExpiration(market);
        } catch (error) {
          logger.error(`Failed to process expired market ${market.marketId}:`, error);
        }
      }
      
      if (expiredMarkets.length > 0) {
        logger.info('Processed expired markets', {
          count: expiredMarkets.length
        });
      }
    } catch (error) {
      logger.error('Failed to process expired markets:', error);
    }
  }

  async processMarketExpiration(market) {
    if (market.status !== 'active') return;
    
    // Try to resolve via oracle
    let resolved = false;
    
    if (market.oracleSource && market.oracleSource !== 'manual') {
      try {
        const oracleResult = await oracleService.resolveMarket(market);
        if (oracleResult) {
          market.resolve(oracleResult.outcome, 'oracle', oracleResult.transactionHash);
          await market.save();
          resolved = true;
          
          logger.oracle('Market auto-resolved', {
            marketId: market.marketId,
            outcome: oracleResult.outcome,
            source: market.oracleSource
          });
        }
      } catch (error) {
        logger.error(`Oracle resolution failed for market ${market.marketId}:`, error);
      }
    }
    
    if (!resolved) {
      // Mark as expired for manual resolution
      market.status = 'expired';
      await market.save();
      
      // Notify market creator and participants
      websocketHandler.sendUserNotification(market.creatorWalletAddress, {
        type: 'market_expired',
        marketId: market.marketId,
        title: 'Market Expired',
        message: `Your market "${market.question}" has expired and needs manual resolution.`
      });
      
      logger.info('Market marked as expired', {
        marketId: market.marketId
      });
    }
  }

  // Update market statistics
  async updateMarketStatistics() {
    try {
      const activeMarkets = await Market.find({ status: 'active' });
      
      for (const market of activeMarkets) {
        // Update unique traders count
        const uniqueTraders = await Trade.distinct('userWalletAddress', {
          marketId: market.marketId,
          status: 'confirmed'
        });
        
        market.statistics.uniqueTraders = uniqueTraders.length;
        
        // Update token stakes
        const positions = await Position.aggregate([
          { $match: { marketId: market.marketId, status: 'active' } },
          {
            $group: {
              _id: '$tokenType',
              totalStake: { $sum: '$totalCostBasis' }
            }
          }
        ]);
        
        positions.forEach(pos => {
          if (pos._id === 'yes') {
            market.statistics.yesTotalStake = pos.totalStake;
          } else {
            market.statistics.noTotalStake = pos.totalStake;
          }
        });
        
        await market.save();
      }
      
      logger.info('Market statistics updated', {
        marketsUpdated: activeMarkets.length
      });
    } catch (error) {
      logger.error('Failed to update market statistics:', error);
    }
  }

  // Update leaderboards
  async updateLeaderboards() {
    try {
      // Get top traders
      const topTraders = await User.findTopTraders(50, 'week');
      
      // Get top creators
      const topCreators = await User.aggregate([
        { $match: { 'statistics.marketsCreated': { $gt: 0 } } },
        {
          $addFields: {
            creatorScore: {
              $multiply: [
                '$statistics.marketsCreated',
                { $add: ['$statistics.winRate', 0.1] }
              ]
            }
          }
        },
        { $sort: { creatorScore: -1 } },
        { $limit: 50 }
      ]);
      
      // Get top markets
      const topMarkets = await Market.findTrendingMarkets(50);
      
      // Broadcast leaderboard update
      websocketHandler.broadcastLeaderboardUpdate({
        type: 'leaderboard_update',
        data: {
          topTraders: topTraders.slice(0, 10),
          topCreators: topCreators.slice(0, 10),
          topMarkets: topMarkets.slice(0, 10)
        }
      });
      
      logger.info('Leaderboards updated and broadcast');
    } catch (error) {
      logger.error('Failed to update leaderboards:', error);
    }
  }

  // Clean up old data
  async cleanupOldData() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      
      // Archive old resolved markets
      const oldMarkets = await Market.updateMany(
        {
          status: 'resolved',
          resolvedAt: { $lt: ninetyDaysAgo }
        },
        {
          $set: { archived: true }
        }
      );
      
      // Clean up failed trades
      const failedTrades = await Trade.deleteMany({
        status: 'failed',
        timestamp: { $lt: thirtyDaysAgo }
      });
      
      // Clean up old price history data
      await Market.updateMany(
        {},
        {
          $push: {
            'statistics.priceHistory': {
              $each: [],
              $slice: -1000 // Keep only last 1000 points
            }
          }
        }
      );
      
      logger.info('Data cleanup completed', {
        archivedMarkets: oldMarkets.modifiedCount,
        deletedFailedTrades: failedTrades.deletedCount
      });
    } catch (error) {
      logger.error('Failed to clean up old data:', error);
    }
  }

  // Process pending trades
  async processPendingTrades() {
    try {
      const pendingTrades = await Trade.getPendingTrades();
      
      for (const trade of pendingTrades) {
        try {
          // Check transaction status on Stellar
          if (trade.stellarTransactionHash) {
            const txStatus = await this.checkTransactionStatus(trade.stellarTransactionHash);
            
            if (txStatus.successful) {
              trade.confirm(txStatus.ledger);
              await trade.save();
              
              // Notify user of successful trade
              websocketHandler.sendUserNotification(trade.userWalletAddress, {
                type: 'trade_confirmed',
                tradeId: trade.tradeId,
                title: 'Trade Confirmed',
                message: `Your ${trade.tradeType} order for ${trade.amount} ${trade.tokenType.toUpperCase()} tokens has been confirmed.`
              });
            } else if (txStatus.failed) {
              trade.fail('Transaction failed on Stellar network');
              await trade.save();
              
              // Notify user of failed trade
              websocketHandler.sendUserNotification(trade.userWalletAddress, {
                type: 'trade_failed',
                tradeId: trade.tradeId,
                title: 'Trade Failed',
                message: 'Your trade could not be completed. Please try again.'
              });
            }
          } else if (trade.timestamp < new Date(Date.now() - 5 * 60 * 1000)) {
            // Mark as failed if no transaction hash after 5 minutes
            trade.fail('Transaction timeout');
            await trade.save();
          }
        } catch (error) {
          logger.error(`Failed to process pending trade ${trade.tradeId}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to process pending trades:', error);
    }
  }

  // Update user reputation scores
  async updateUserReputationScores() {
    try {
      const users = await User.find({ isActive: true });
      
      for (const user of users) {
        let reputationChange = 0;
        
        // Base reputation on win rate
        if (user.statistics.totalPredictions > 5) {
          const winRateBonus = (user.statistics.winRate - 0.5) * 100; // -50 to +50
          reputationChange += winRateBonus;
        }
        
        // Bonus for volume
        const volumeBonus = Math.min(50, user.statistics.totalVolume / 1000);
        reputationChange += volumeBonus;
        
        // Bonus for market creation
        const creatorBonus = user.statistics.marketsCreated * 10;
        reputationChange += creatorBonus;
        
        // Apply reputation change
        if (Math.abs(reputationChange) > 1) {
          user.updateReputationScore(reputationChange, 'periodic_update');
          await user.save();
        }
      }
      
      logger.info('User reputation scores updated', {
        usersUpdated: users.length
      });
    } catch (error) {
      logger.error('Failed to update user reputation scores:', error);
    }
  }

  // Helper methods
  async getLastProcessedLedger() {
    // In a real implementation, store this in database or Redis
    return parseInt(process.env.LAST_PROCESSED_LEDGER) || 0;
  }

  async setLastProcessedLedger(ledger) {
    // In a real implementation, store this in database or Redis
    process.env.LAST_PROCESSED_LEDGER = ledger.toString();
  }

  async checkTransactionStatus(txHash) {
    try {
      // Check transaction status on Stellar
      const transaction = await stellarService.server.transactions()
        .transaction(txHash)
        .call();
      
      return {
        successful: transaction.successful,
        failed: !transaction.successful,
        ledger: transaction.ledger
      };
    } catch (error) {
      return { successful: false, failed: false }; // Still pending
    }
  }
}

module.exports = new BackgroundJobs();
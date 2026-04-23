const { User, Trade, Position, Market, IndexedEvent } = require('../models');
const logger = require('../config/logger');

class AnalyticsController {
  static parseTimeframe(timeframe = '30d') {
    const now = new Date();
    switch (timeframe) {
      case '24h':
        return new Date(now - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now - 30 * 24 * 60 * 60 * 1000);
      case '1y':
        return new Date(now - 365 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now - 30 * 24 * 60 * 60 * 1000);
    }
  }

  static getDateFormatForTimeframe(timeframe = '30d', interval = 'day') {
    if (timeframe === '24h') {
      return interval === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d';
    }
    if (timeframe === '1y') {
      return '%Y-%m';
    }
    return '%Y-%m-%d';
  }

  // Get platform statistics
  static async getPlatformStats(req, res) {
    try {
      const { timeframe = '30d' } = req.query;
      const startDate = AnalyticsController.parseTimeframe(timeframe);

      const [
        totalUsers,
        totalMarkets,
        activeMarkets,
        totalTrades,
        totalVolume,
        marketCategories
      ] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: startDate } }),
        Market.countDocuments({ createdAt: { $gte: startDate } }),
        Market.countDocuments({ 
          status: 'active',
          createdAt: { $gte: startDate }
        }),
        Trade.countDocuments({ 
          status: 'confirmed',
          timestamp: { $gte: startDate }
        }),
        Trade.aggregate([
          { 
            $match: { 
              status: 'confirmed',
              timestamp: { $gte: startDate }
            } 
          },
          { 
            $group: { 
              _id: null, 
              total: { $sum: '$totalCost' } 
            } 
          }
        ]),
        Market.aggregate([
          { 
            $match: { 
              createdAt: { $gte: startDate }
            } 
          },
          { 
            $group: { 
              _id: '$category', 
              count: { $sum: 1 } 
            } 
          },
          { $sort: { count: -1 } }
        ])
      ]);

      const stats = {
        overview: {
          totalUsers,
          totalMarkets,
          activeMarkets,
          totalTrades,
          totalVolume: totalVolume[0]?.total || 0,
          averageTradeSize: totalTrades > 0 ? (totalVolume[0]?.total || 0) / totalTrades : 0
        },
        categories: marketCategories,
        timeframe
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Get platform stats failed:', error);
      throw error;
    }
  }

  // Get market trends
  static async getMarketTrends(req, res) {
    try {
      const {
        timeframe = '30d',
        category,
        interval = 'day'
      } = req.query;

      const startDate = AnalyticsController.parseTimeframe(timeframe);
      const dateFormat = AnalyticsController.getDateFormatForTimeframe(timeframe, interval);

      const matchCondition = {
        timestamp: { $gte: startDate },
        status: 'confirmed'
      };

      // Get trading volume trends
      const volumeTrends = await Trade.aggregate([
        { $match: matchCondition },
        {
          $group: {
            _id: {
              $dateToString: {
                format: dateFormat,
                date: '$timestamp'
              }
            },
            volume: { $sum: '$totalCost' },
            trades: { $sum: 1 },
            uniqueTraders: { $addToSet: '$userWalletAddress' }
          }
        },
        {
          $addFields: {
            uniqueTraders: { $size: '$uniqueTraders' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Get market creation trends
      const marketTrends = await Market.aggregate([
        { 
          $match: { 
            createdAt: { $gte: startDate },
            ...(category && { category })
          } 
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: dateFormat,
                date: '$createdAt'
              }
            },
            marketsCreated: { $sum: 1 },
            totalLiquidity: { $sum: '$liquidityPool.totalLiquidity' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      res.json({
        success: true,
        data: {
          volumeTrends,
          marketTrends,
          metadata: {
            timeframe,
            interval,
            category: category || 'all'
          }
        }
      });
    } catch (error) {
      logger.error('Get market trends failed:', error);
      throw error;
    }
  }

  // Get user activity metrics (simplified version)
  static async getUserActivity(req, res) {
    try {
      const { timeframe = '30d' } = req.query;
      const startDate = AnalyticsController.parseTimeframe(timeframe);

      const [newUsers, activeTraders] = await Promise.all([
        // New user registrations
        User.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt'
                }
              },
              newUsers: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]),

        // Active traders by day
        Trade.aggregate([
          { 
            $match: { 
              timestamp: { $gte: startDate },
              status: 'confirmed'
            } 
          },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$timestamp'
                  }
                }
              },
              activeTraders: { $addToSet: '$userWalletAddress' }
            }
          },
          {
            $addFields: {
              activeTraders: { $size: '$activeTraders' }
            }
          },
          { $sort: { '_id.date': 1 } }
        ])
      ]);

      res.json({
        success: true,
        data: {
          newUsers,
          activeTraders,
          timeframe
        }
      });
    } catch (error) {
      logger.error('Get user activity failed:', error);
      throw error;
    }
  }

  // Get detailed analytics for admin dashboard
  static async getDetailedAnalytics(req, res) {
    try {
      const { timeframe = '30d' } = req.query;
      const startDate = AnalyticsController.parseTimeframe(timeframe);

      const [platformMetrics, performanceMetrics] = await Promise.all([
        // Platform metrics
        Promise.all([
          Market.countDocuments(),
          User.countDocuments(),
          Trade.countDocuments({ status: 'confirmed' }),
          Position.countDocuments({ status: 'active' })
        ]),

        // Performance metrics (simplified)
        Trade.aggregate([
          { $match: { timestamp: { $gte: startDate } } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ])
      ]);

      const [totalMarkets, totalUsers, totalTrades, activePositions] = platformMetrics;

      res.json({
        success: true,
        data: {
          platform: {
            totalMarkets,
            totalUsers,
            totalTrades,
            activePositions
          },
          performance: performanceMetrics,
          timeframe
        }
      });
    } catch (error) {
      logger.error('Get detailed analytics failed:', error);
      throw error;
    }
  }

  static async getIndexedEvents(req, res) {
    try {
      const {
        contractName,
        topic,
        marketId,
        limit = 100
      } = req.query;

      const parsedLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
      const query = {};

      if (contractName) query.contractName = contractName;
      if (topic) query.topic = topic;
      if (marketId) query['payload.marketId'] = marketId;

      const events = await IndexedEvent.find(query)
        .sort({ ledger: -1, createdAt: -1 })
        .limit(parsedLimit)
        .lean();

      res.json({
        success: true,
        data: events,
        metadata: {
          total: events.length,
          filters: { contractName, topic, marketId }
        }
      });
    } catch (error) {
      logger.error('Get indexed events failed:', error);
      throw error;
    }
  }

  static async getPriceTrends(req, res) {
    try {
      const { timeframe = '30d', interval = 'day', marketId } = req.query;
      const startDate = AnalyticsController.parseTimeframe(timeframe);
      const dateFormat = AnalyticsController.getDateFormatForTimeframe(timeframe, interval);

      const match = {
        status: 'confirmed',
        timestamp: { $gte: startDate },
        ...(marketId ? { marketId } : {})
      };

      const grouped = await Trade.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              bucket: {
                $dateToString: {
                  format: dateFormat,
                  date: '$timestamp'
                }
              },
              tokenType: '$tokenType'
            },
            averagePrice: { $avg: '$price' },
            volume: { $sum: '$totalCost' },
            trades: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.bucket',
            tokenBuckets: {
              $push: {
                tokenType: '$_id.tokenType',
                averagePrice: '$averagePrice',
                volume: '$volume',
                trades: '$trades'
              }
            },
            totalVolume: { $sum: '$volume' },
            totalTrades: { $sum: '$trades' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const priceTrends = grouped.map((bucket) => {
        const yesData = bucket.tokenBuckets.find((entry) => entry.tokenType === 'yes');
        const noData = bucket.tokenBuckets.find((entry) => entry.tokenType === 'no');

        return {
          timestamp: bucket._id,
          yesPrice: yesData ? Number(yesData.averagePrice.toFixed(4)) : null,
          noPrice: noData ? Number(noData.averagePrice.toFixed(4)) : null,
          volume: bucket.totalVolume,
          trades: bucket.totalTrades
        };
      });

      res.json({
        success: true,
        data: {
          priceTrends,
          metadata: {
            timeframe,
            interval,
            marketId: marketId || 'all'
          }
        }
      });
    } catch (error) {
      logger.error('Get price trends failed:', error);
      throw error;
    }
  }

  static async getUserInsights(req, res) {
    try {
      const { walletAddress, timeframe = '30d' } = req.query;

      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'walletAddress query parameter is required'
        });
      }

      const normalizedWallet = walletAddress.toLowerCase();
      const startDate = AnalyticsController.parseTimeframe(timeframe);

      const [user, tradeSummary, pnlSummary, pnlTrend] = await Promise.all([
        User.findOne({ walletAddress: normalizedWallet }).lean(),
        Trade.aggregate([
          {
            $match: {
              userWalletAddress: normalizedWallet,
              status: 'confirmed',
              timestamp: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: null,
              totalTrades: { $sum: 1 },
              totalVolume: { $sum: '$totalCost' },
              buys: { $sum: { $cond: [{ $eq: ['$tradeType', 'buy'] }, 1, 0] } },
              sells: { $sum: { $cond: [{ $eq: ['$tradeType', 'sell'] }, 1, 0] } }
            }
          }
        ]),
        Position.aggregate([
          {
            $match: {
              userWalletAddress: normalizedWallet
            }
          },
          {
            $group: {
              _id: null,
              realizedPnL: { $sum: '$realizedPnL' },
              unrealizedPnL: { $sum: '$unrealizedPnL' }
            }
          }
        ]),
        Trade.aggregate([
          {
            $match: {
              userWalletAddress: normalizedWallet,
              status: 'confirmed',
              timestamp: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$timestamp'
                }
              },
              cashFlowPnL: {
                $sum: {
                  $cond: [
                    { $eq: ['$tradeType', 'sell'] },
                    '$totalCost',
                    { $multiply: ['$totalCost', -1] }
                  ]
                }
              }
            }
          },
          { $sort: { _id: 1 } }
        ])
      ]);

      let runningPnL = 0;
      const trend = pnlTrend.map((entry) => {
        runningPnL += entry.cashFlowPnL;
        return {
          timestamp: entry._id,
          cashFlowPnL: entry.cashFlowPnL,
          cumulativePnL: runningPnL
        };
      });

      const summary = tradeSummary[0] || { totalTrades: 0, totalVolume: 0, buys: 0, sells: 0 };
      const pnl = pnlSummary[0] || { realizedPnL: 0, unrealizedPnL: 0 };

      res.json({
        success: true,
        data: {
          walletAddress: normalizedWallet,
          timeframe,
          summary: {
            totalTrades: summary.totalTrades,
            totalVolume: summary.totalVolume,
            buys: summary.buys,
            sells: summary.sells,
            realizedPnL: pnl.realizedPnL,
            unrealizedPnL: pnl.unrealizedPnL,
            netPnL: pnl.realizedPnL + pnl.unrealizedPnL,
            reputationScore: user?.reputationScore || 0,
            successfulPredictions: user?.statistics?.successfulPredictions || 0,
            totalPredictions: user?.statistics?.totalPredictions || 0
          },
          trend
        }
      });
    } catch (error) {
      logger.error('Get user insights failed:', error);
      throw error;
    }
  }
}

module.exports = AnalyticsController;
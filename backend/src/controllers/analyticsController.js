const { User, Trade, Position, Market } = require('../models');
const logger = require('../config/logger');

class AnalyticsController {
  // Get platform statistics
  static async getPlatformStats(req, res) {
    try {
      const { timeframe = '30d' } = req.query;

      // Calculate date range
      const now = new Date();
      let startDate;
      
      switch (timeframe) {
        case '24h':
          startDate = new Date(now - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(now - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
      }

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

      const now = new Date();
      let startDate;
      let dateFormat;

      switch (timeframe) {
        case '24h':
          startDate = new Date(now - 24 * 60 * 60 * 1000);
          dateFormat = interval === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d';
          break;
        case '7d':
          startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
          dateFormat = '%Y-%m-%d';
          break;
        case '30d':
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
          dateFormat = '%Y-%m-%d';
          break;
        case '1y':
          startDate = new Date(now - 365 * 24 * 60 * 60 * 1000);
          dateFormat = '%Y-%m';
          break;
        default:
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
          dateFormat = '%Y-%m-%d';
      }

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

      const now = new Date();
      let startDate;
      
      switch (timeframe) {
        case '24h':
          startDate = new Date(now - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(now - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
      }

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

      const now = new Date();
      let startDate;
      
      switch (timeframe) {
        case '24h':
          startDate = new Date(now - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(now - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
      }

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
}

module.exports = AnalyticsController;
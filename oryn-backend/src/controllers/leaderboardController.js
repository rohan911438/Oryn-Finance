const { User, Trade, Position, Market } = require('../models');
const logger = require('../config/logger');

class LeaderboardController {
  // Get top traders by total volume
  static async getTopTraders(req, res) {
    try {
      const {
        timeframe = '30d',
        limit = 50
      } = req.query;

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

      const topTraders = await Trade.aggregate([
        {
          $match: {
            status: 'confirmed',
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$userWalletAddress',
            totalVolume: { $sum: '$totalCost' },
            totalTrades: { $sum: 1 },
            totalFees: { $sum: '$fees.total' },
            averageTradeSize: { $avg: '$totalCost' },
            winningTrades: {
              $sum: {
                $cond: [
                  { $gt: ['$totalCost', 0] }, // Simplified win condition
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: 'walletAddress',
            as: 'userInfo'
          }
        },
        {
          $addFields: {
            winRate: {
              $cond: [
                { $gt: ['$totalTrades', 0] },
                { $multiply: [{ $divide: ['$winningTrades', '$totalTrades'] }, 100] },
                0
              ]
            },
            user: { $arrayElemAt: ['$userInfo', 0] }
          }
        },
        {
          $project: {
            walletAddress: '$_id',
            username: { $ifNull: ['$user.username', { $concat: ['user_', { $substr: ['$_id', 0, 8] }] }] },
            avatarUrl: '$user.avatarUrl',
            totalVolume: 1,
            totalTrades: 1,
            averageTradeSize: 1,
            winRate: 1
          }
        },
        { $sort: { totalVolume: -1 } },
        { $limit: parseInt(limit) }
      ]);

      // Add rank to each trader
      const tradersWithRank = topTraders.map((trader, index) => ({
        ...trader,
        rank: index + 1
      }));

      res.json({
        success: true,
        data: tradersWithRank,
        metadata: {
          timeframe,
          totalResults: tradersWithRank.length
        }
      });
    } catch (error) {
      logger.error('Get top traders failed:', error);
      throw error;
    }
  }

  // Get top market creators
  static async getTopMarketCreators(req, res) {
    try {
      const {
        timeframe = '30d',
        limit = 50
      } = req.query;

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

      const topCreators = await Market.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$creatorAddress',
            marketsCreated: { $sum: 1 },
            totalVolume: { $sum: '$statistics.totalVolume' },
            avgResolutionTime: { $avg: '$resolutionTime' },
            resolvedMarkets: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'resolved'] },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: 'walletAddress',
            as: 'userInfo'
          }
        },
        {
          $addFields: {
            resolutionRate: {
              $cond: [
                { $gt: ['$marketsCreated', 0] },
                { $multiply: [{ $divide: ['$resolvedMarkets', '$marketsCreated'] }, 100] },
                0
              ]
            },
            user: { $arrayElemAt: ['$userInfo', 0] }
          }
        },
        {
          $project: {
            walletAddress: '$_id',
            username: { $ifNull: ['$user.username', { $concat: ['creator_', { $substr: ['$_id', 0, 8] }] }] },
            avatarUrl: '$user.avatarUrl',
            marketsCreated: 1,
            totalVolume: 1,
            resolutionRate: 1
          }
        },
        { $sort: { marketsCreated: -1, totalVolume: -1 } },
        { $limit: parseInt(limit) }
      ]);

      const creatorsWithRank = topCreators.map((creator, index) => ({
        ...creator,
        rank: index + 1
      }));

      res.json({
        success: true,
        data: creatorsWithRank,
        metadata: {
          timeframe,
          totalResults: creatorsWithRank.length
        }
      });
    } catch (error) {
      logger.error('Get top market creators failed:', error);
      throw error;
    }
  }

  // Get user's rank and position
  static async getUserRank(req, res) {
    try {
      const walletAddress = req.user.walletAddress;
      const {
        category = 'volume',
        timeframe = '30d'
      } = req.query;

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

      let aggregation;
      let sortField;

      if (category === 'volume') {
        sortField = 'totalVolume';
        aggregation = [
          {
            $match: {
              status: 'confirmed',
              timestamp: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: '$userWalletAddress',
              totalVolume: { $sum: '$totalCost' }
            }
          }
        ];
      } else if (category === 'markets') {
        sortField = 'marketsCreated';
        aggregation = [
          {
            $match: {
              createdAt: { $gte: startDate }
            }
          },
          {
            $group: {
              _id: '$creatorAddress',
              marketsCreated: { $sum: 1 }
            }
          }
        ];
      }

      const rankings = await (category === 'volume' ? Trade : Market).aggregate([
        ...aggregation,
        { $sort: { [sortField]: -1 } }
      ]);

      const userRankIndex = rankings.findIndex(item => item._id === walletAddress);
      const userRank = userRankIndex >= 0 ? userRankIndex + 1 : null;
      const userStats = userRankIndex >= 0 ? rankings[userRankIndex] : null;

      res.json({
        success: true,
        data: {
          rank: userRank,
          totalParticipants: rankings.length,
          stats: userStats,
          category,
          timeframe
        }
      });
    } catch (error) {
      logger.error('Get user rank failed:', error);
      throw error;
    }
  }
}

module.exports = LeaderboardController;
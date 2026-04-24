const { User, Trade, Position, Market } = require('../models');
const logger = require('../config/logger');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

class UserController {
  // Get current user profile
  static async getUserProfile(req, res) {
    try {
      const walletAddress = req.user.walletAddress;
      
      let user = await User.findOne({ walletAddress });
      
      // If user doesn't exist in database, create a basic profile
      if (!user) {
        user = new User({
          walletAddress,
          username: `user_${walletAddress.substring(0, 8)}`,
          joinedAt: new Date()
        });
        await user.save();
        
        logger.info('Created new user profile', { walletAddress });
      }

      // Get user statistics
      const [totalTrades, activePositions, totalVolume] = await Promise.all([
        Trade.countDocuments({ 
          userWalletAddress: walletAddress, 
          status: 'confirmed' 
        }),
        Position.countDocuments({ 
          userWalletAddress: walletAddress, 
          status: 'active' 
        }),
        Trade.aggregate([
          { 
            $match: { 
              userWalletAddress: walletAddress, 
              status: 'confirmed' 
            } 
          },
          { 
            $group: { 
              _id: null, 
              total: { $sum: '$totalCost' } 
            } 
          }
        ])
      ]);

      const userProfile = {
        ...user.toObject(),
        statistics: {
          totalTrades,
          activePositions,
          totalVolume: totalVolume[0]?.total || 0,
          winRate: user.statistics?.winRate || 0,
          totalPnL: user.statistics?.totalPnL || 0,
          rank: user.achievements?.globalRank || null
        }
      };

      res.json({
        success: true,
        data: userProfile
      });
    } catch (error) {
      logger.error('Get user profile failed:', error);
      throw error;
    }
  }

  // Update user profile
  static async updateUserProfile(req, res) {
    try {
      const walletAddress = req.user.walletAddress;
      const {
        username,
        bio,
        avatarUrl,
        preferences,
        socialLinks
      } = req.body;

      // Check if username is already taken (if provided)
      if (username) {
        const existingUser = await User.findOne({ 
          username: username.toLowerCase(),
          walletAddress: { $ne: walletAddress }
        });
        
        if (existingUser) {
          throw new ValidationError('Username is already taken');
        }
      }

      const updateData = {};
      if (username) updateData.username = username.toLowerCase();
      if (bio !== undefined) updateData.bio = bio;
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
      if (preferences) updateData.preferences = { ...updateData.preferences, ...preferences };
      if (socialLinks) updateData.socialLinks = { ...updateData.socialLinks, ...socialLinks };

      updateData.updatedAt = new Date();

      const user = await User.findOneAndUpdate(
        { walletAddress },
        { $set: updateData },
        { 
          new: true, 
          upsert: true,
          runValidators: true
        }
      );

      logger.info('User profile updated', { 
        walletAddress, 
        updatedFields: Object.keys(updateData) 
      });

      res.json({
        success: true,
        data: user,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      logger.error('Update user profile failed:', error);
      throw error;
    }
  }

  // Get user positions
  static async getUserPositions(req, res) {
    try {
      const walletAddress = req.user.walletAddress;
      const {
        status = 'active',
        marketId,
        page = 1,
        limit = 20
      } = req.query;

      const filter = {
        userWalletAddress: walletAddress
      };

      if (status) filter.status = status;
      if (marketId) filter.marketId = marketId;

      const skip = (page - 1) * limit;

      const [positions, total] = await Promise.all([
        Position.find(filter)
          .populate('marketId', 'question category status expiresAt')
          .sort({ lastUpdated: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Position.countDocuments(filter)
      ]);

      // Calculate current market prices for unrealized P&L
      const positionsWithCurrentPrices = await Promise.all(
        positions.map(async (position) => {
          try {
            // Get current market price (this would normally come from Stellar/Soroban)
            // For now, we'll use a placeholder calculation
            const currentPrice = 0.5; // This should be fetched from the market
            
            const unrealizedPnL = position.tokenType === 'yes' 
              ? (currentPrice - position.averageEntryPrice) * position.availableShares
              : (position.averageEntryPrice - currentPrice) * position.availableShares;

            return {
              ...position,
              currentPrice,
              unrealizedPnL,
              totalValue: position.availableShares * currentPrice
            };
          } catch (error) {
            logger.error('Failed to calculate position value:', error);
            return position;
          }
        })
      );

      res.json({
        success: true,
        data: positionsWithCurrentPrices,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get user positions failed:', error);
      throw error;
    }
  }

  // Get user by wallet address (public info only)
  static async getUserByAddress(req, res) {
    try {
      const { walletAddress } = req.params;

      const user = await User.findOne({ walletAddress }).lean();
      
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Return only public information
      const publicProfile = {
        walletAddress: user.walletAddress,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        joinedAt: user.joinedAt,
        statistics: {
          totalTrades: user.statistics?.totalTrades || 0,
          winRate: user.statistics?.winRate || 0,
          marketsCreated: user.statistics?.marketsCreated || 0
        },
        achievements: {
          badges: user.achievements?.badges || [],
          globalRank: user.achievements?.globalRank || null,
          level: user.achievements?.level || 1
        }
      };

      res.json({
        success: true,
        data: publicProfile
      });
    } catch (error) {
      logger.error('Get user by address failed:', error);
      throw error;
    }
  }

  // Get user trade statistics
  static async getUserStats(req, res) {
    try {
      const walletAddress = req.user.walletAddress;
      const {
        timeframe = '30d',
        marketId
      } = req.query;

      // Calculate date range based on timeframe
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

      const matchCondition = {
        userWalletAddress: walletAddress,
        status: 'confirmed',
        timestamp: { $gte: startDate }
      };

      if (marketId) {
        matchCondition.marketId = marketId;
      }

      // Aggregate trade statistics
      const [tradeStats, positionStats] = await Promise.all([
        Trade.aggregate([
          { $match: matchCondition },
          {
            $group: {
              _id: null,
              totalTrades: { $sum: 1 },
              totalVolume: { $sum: '$totalCost' },
              totalFees: { $sum: '$fees.total' },
              averageTradeSize: { $avg: '$totalCost' },
              buyTrades: {
                $sum: { $cond: [{ $eq: ['$tradeType', 'buy'] }, 1, 0] }
              },
              sellTrades: {
                $sum: { $cond: [{ $eq: ['$tradeType', 'sell'] }, 1, 0] }
              },
              yesTrades: {
                $sum: { $cond: [{ $eq: ['$tokenType', 'yes'] }, 1, 0] }
              },
              noTrades: {
                $sum: { $cond: [{ $eq: ['$tokenType', 'no'] }, 1, 0] }
              }
            }
          }
        ]),
        Position.aggregate([
          { 
            $match: { 
              userWalletAddress: walletAddress,
              ...(marketId && { marketId })
            } 
          },
          {
            $group: {
              _id: null,
              totalPositions: { $sum: 1 },
              activePositions: {
                $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
              },
              totalRealizedPnL: { $sum: '$realizedPnL' },
              totalUnrealizedPnL: { $sum: '$unrealizedPnL' }
            }
          }
        ])
      ]);

      const stats = {
        timeframe,
        trades: tradeStats[0] || {
          totalTrades: 0,
          totalVolume: 0,
          totalFees: 0,
          averageTradeSize: 0,
          buyTrades: 0,
          sellTrades: 0,
          yesTrades: 0,
          noTrades: 0
        },
        positions: positionStats[0] || {
          totalPositions: 0,
          activePositions: 0,
          totalRealizedPnL: 0,
          totalUnrealizedPnL: 0
        }
      };

      // Calculate additional metrics
      stats.netPnL = stats.positions.totalRealizedPnL + stats.positions.totalUnrealizedPnL;
      stats.roi = stats.trades.totalVolume > 0 ? (stats.netPnL / stats.trades.totalVolume) * 100 : 0;

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Get user stats failed:', error);
      throw error;
    }
  }

  // Get user's reputation details and leaderboard position
  static async getUserReputation(req, res) {
    try {
      const walletAddress = req.user.walletAddress;

      const user = await User.findOne({ walletAddress }).lean();
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const higherRankedCount = await User.countDocuments({
        reputationScore: { $gt: user.reputationScore || 0 },
        isActive: true
      });

      res.json({
        success: true,
        data: {
          walletAddress: user.walletAddress,
          reputationScore: user.reputationScore || 0,
          level: user.level || 'rookie',
          rank: higherRankedCount + 1,
          accuracy: {
            successfulPredictions: user.statistics?.successfulPredictions || 0,
            totalPredictions: user.statistics?.totalPredictions || 0,
            winRate: user.statistics?.winRate || 0
          },
          activity: {
            totalTrades: user.statistics?.totalTrades || 0,
            totalVolume: user.statistics?.totalVolume || 0
          },
          achievements: user.achievements || []
        }
      });
    } catch (error) {
      logger.error('Get user reputation failed:', error);
      throw error;
    }
  }

  // Get user's market creation history
  static async getUserMarkets(req, res) {
    try {
      const walletAddress = req.user.walletAddress;
      const {
        status,
        page = 1,
        limit = 20
      } = req.query;

      const filter = {
        creatorAddress: walletAddress
      };

      if (status) filter.status = status;

      const skip = (page - 1) * limit;

      const [markets, total] = await Promise.all([
        Market.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Market.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: markets,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get user markets failed:', error);
      throw error;
    }
  }
}

module.exports = UserController;
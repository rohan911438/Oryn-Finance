const { User, Trade, Position, Market } = require('../models');
const logger = require('../config/logger');
const stellarService = require('../services/stellarService');
const sorobanService = require('../services/sorobanService');
const { NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

class AdminController {
  // Get platform overview for admin dashboard
  static async getDashboard(req, res) {
    try {
      const now = new Date();
      const last24h = new Date(now - 24 * 60 * 60 * 1000);
      const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

      const [
        totalStats,
        recentStats,
        weeklyStats,
        systemHealth
      ] = await Promise.all([
        // Total platform statistics
        Promise.all([
          User.countDocuments(),
          Market.countDocuments(),
          Trade.countDocuments({ status: 'confirmed' }),
          Trade.aggregate([
            { $match: { status: 'confirmed' } },
            { $group: { _id: null, total: { $sum: '$totalCost' } } }
          ])
        ]),

        // Recent 24h statistics
        Promise.all([
          User.countDocuments({ createdAt: { $gte: last24h } }),
          Market.countDocuments({ createdAt: { $gte: last24h } }),
          Trade.countDocuments({ 
            status: 'confirmed', 
            timestamp: { $gte: last24h } 
          }),
          Trade.aggregate([
            { 
              $match: { 
                status: 'confirmed', 
                timestamp: { $gte: last24h } 
              } 
            },
            { $group: { _id: null, total: { $sum: '$totalCost' } } }
          ])
        ]),

        // Weekly statistics
        Promise.all([
          User.countDocuments({ createdAt: { $gte: last7d } }),
          Market.countDocuments({ createdAt: { $gte: last7d } }),
          Trade.countDocuments({ 
            status: 'confirmed', 
            timestamp: { $gte: last7d } 
          })
        ]),

        // System health checks
        Promise.all([
          stellarService.getNetworkStatus(),
          sorobanService.getHealth()
        ])
      ]);

      const [totalUsers, totalMarkets, totalTrades, totalVolumeAgg] = totalStats;
      const [newUsers24h, newMarkets24h, newTrades24h, volume24hAgg] = recentStats;
      const [newUsers7d, newMarkets7d, newTrades7d] = weeklyStats;
      const [stellarHealth, sorobanHealth] = systemHealth;

      const dashboard = {
        totals: {
          users: totalUsers,
          markets: totalMarkets,
          trades: totalTrades,
          volume: totalVolumeAgg[0]?.total || 0
        },
        last24h: {
          newUsers: newUsers24h,
          newMarkets: newMarkets24h,
          newTrades: newTrades24h,
          volume: volume24hAgg[0]?.total || 0
        },
        last7d: {
          newUsers: newUsers7d,
          newMarkets: newMarkets7d,
          newTrades: newTrades7d
        },
        systemHealth: {
          stellar: stellarHealth,
          soroban: sorobanHealth
        }
      };

      res.json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      logger.error('Get admin dashboard failed:', error);
      throw error;
    }
  }

  // Get all users with admin controls
  static async getAllUsers(req, res) {
    try {
      const {
        page = 1,
        limit = 50,
        search,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const filter = {};
      
      if (search) {
        filter.$or = [
          { username: { $regex: search, $options: 'i' } },
          { walletAddress: { $regex: search, $options: 'i' } }
        ];
      }

      if (status) {
        filter.status = status;
      }

      const sortDirection = sortOrder === 'asc' ? 1 : -1;
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        User.find(filter)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        User.countDocuments(filter)
      ]);

      // Get additional stats for each user
      const usersWithStats = await Promise.all(
        users.map(async (user) => {
          const [totalTrades, totalVolume, activePositions] = await Promise.all([
            Trade.countDocuments({ 
              userWalletAddress: user.walletAddress, 
              status: 'confirmed' 
            }),
            Trade.aggregate([
              { 
                $match: { 
                  userWalletAddress: user.walletAddress, 
                  status: 'confirmed' 
                } 
              },
              { $group: { _id: null, total: { $sum: '$totalCost' } } }
            ]),
            Position.countDocuments({ 
              userWalletAddress: user.walletAddress, 
              status: 'active' 
            })
          ]);

          return {
            ...user,
            stats: {
              totalTrades,
              totalVolume: totalVolume[0]?.total || 0,
              activePositions
            }
          };
        })
      );

      res.json({
        success: true,
        data: usersWithStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get all users failed:', error);
      throw error;
    }
  }

  // Update user status or privileges
  static async updateUser(req, res) {
    try {
      const { walletAddress } = req.params;
      const { status, isAdmin, isBanned, banReason } = req.body;

      const updateData = {};
      
      if (status) updateData.status = status;
      if (isAdmin !== undefined) updateData.isAdmin = isAdmin;
      if (isBanned !== undefined) {
        updateData.isBanned = isBanned;
        if (isBanned && banReason) {
          updateData.banReason = banReason;
          updateData.bannedAt = new Date();
        } else if (!isBanned) {
          updateData.banReason = undefined;
          updateData.bannedAt = undefined;
        }
      }

      const user = await User.findOneAndUpdate(
        { walletAddress },
        updateData,
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new NotFoundError('User not found');
      }

      logger.info('User updated by admin', {
        adminWallet: req.user.walletAddress,
        targetWallet: walletAddress,
        changes: updateData
      });

      res.json({
        success: true,
        data: user,
        message: 'User updated successfully'
      });
    } catch (error) {
      logger.error('Update user failed:', error);
      throw error;
    }
  }

  // Force resolve a market
  static async forceResolveMarket(req, res) {
    try {
      const { marketId } = req.params;
      const { outcome, resolution } = req.body;

      const market = await Market.findOne({ marketId });
      
      if (!market) {
        throw new NotFoundError('Market not found');
      }

      if (market.status === 'resolved') {
        throw new ValidationError('Market is already resolved');
      }

      // Update market with admin resolution
      market.status = 'resolved';
      market.outcome = outcome;
      market.resolution = resolution;
      market.resolvedAt = new Date();
      market.resolvedBy = req.user.walletAddress;
      market.resolutionType = 'admin';

      await market.save();

      // TODO: Trigger settlement process for all positions
      
      logger.info('Market force resolved by admin', {
        adminWallet: req.user.walletAddress,
        marketId,
        outcome,
        resolution
      });

      res.json({
        success: true,
        data: market,
        message: 'Market resolved successfully'
      });
    } catch (error) {
      logger.error('Force resolve market failed:', error);
      throw error;
    }
  }

  // Get system logs and errors
  static async getSystemLogs(req, res) {
    try {
      const {
        level = 'error',
        startDate,
        endDate,
        page = 1,
        limit = 100
      } = req.query;

      // This would typically read from log files or a logging service
      // For now, return a placeholder response
      const logs = {
        level,
        entries: [], // Would be populated from actual logs
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        },
        filters: {
          level,
          startDate,
          endDate
        }
      };

      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      logger.error('Get system logs failed:', error);
      throw error;
    }
  }

  // Get pending trades that need intervention
  static async getPendingTrades(req, res) {
    try {
      const {
        page = 1,
        limit = 50,
        status = 'pending'
      } = req.query;

      const skip = (page - 1) * limit;

      const [trades, total] = await Promise.all([
        Trade.find({ status })
          .populate('marketId', 'question category')
          .sort({ timestamp: 1 }) // Oldest first
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Trade.countDocuments({ status })
      ]);

      res.json({
        success: true,
        data: trades,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Get pending trades failed:', error);
      throw error;
    }
  }

  // Update trade status (for stuck transactions)
  static async updateTradeStatus(req, res) {
    try {
      const { tradeId } = req.params;
      const { status, stellarTransactionHash } = req.body;

      const trade = await Trade.findOne({ tradeId });
      
      if (!trade) {
        throw new NotFoundError('Trade not found');
      }

      const updateData = { status };
      if (stellarTransactionHash) {
        updateData.stellarTransactionHash = stellarTransactionHash;
      }

      const updatedTrade = await Trade.findOneAndUpdate(
        { tradeId },
        updateData,
        { new: true }
      );

      logger.info('Trade status updated by admin', {
        adminWallet: req.user.walletAddress,
        tradeId,
        oldStatus: trade.status,
        newStatus: status
      });

      res.json({
        success: true,
        data: updatedTrade,
        message: 'Trade status updated successfully'
      });
    } catch (error) {
      logger.error('Update trade status failed:', error);
      throw error;
    }
  }

  // Get platform configuration
  static async getConfig(req, res) {
    try {
      const config = {
        stellar: {
          network: process.env.STELLAR_NETWORK,
          horizonUrl: process.env.STELLAR_HORIZON_URL
        },
        soroban: {
          rpcUrl: process.env.SOROBAN_RPC_URL
        },
        platform: {
          feePercent: process.env.PLATFORM_FEE_PERCENT || '0.5',
          minMarketDuration: process.env.MIN_MARKET_DURATION_HOURS || '1',
          maxMarketDuration: process.env.MAX_MARKET_DURATION_DAYS || '365'
        }
      };

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Get config failed:', error);
      throw error;
    }
  }
}

module.exports = AdminController;
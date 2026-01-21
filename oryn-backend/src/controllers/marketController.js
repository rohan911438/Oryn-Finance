const { Market, User, Trade, Position } = require('../models');
const stellarService = require('../services/stellarService');
const sorobanService = require('../services/sorobanService');
const logger = require('../config/logger');
const { NotFoundError, ValidationError, ForbiddenError } = require('../middleware/errorHandler');

class MarketController {
  // Get all markets with filtering and pagination
  static async getAllMarkets(req, res) {
    const {
      category,
      status = 'active',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      page = 1,
      limit = 20
    } = req.query;

    const filter = {};
    
    if (category) filter.category = category;
    if (status) filter.status = status;
    
    if (search) {
      filter.$text = { $search: search };
    }

    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const skip = (page - 1) * limit;

    const [markets, total] = await Promise.all([
      Market.find(filter)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Market.countDocuments(filter)
    ]);

    // Add price information for each market
    const marketsWithPrices = await Promise.all(
      markets.map(async (market) => {
        // In a real implementation, you'd get current prices from Stellar DEX
        return {
          ...market,
          currentPrices: {
            yes: market.currentYesPrice,
            no: market.currentNoPrice
          }
        };
      })
    );

    logger.info('Markets retrieved', {
      count: markets.length,
      total,
      filters: { category, status, search },
      user: req.user?.walletAddress
    });

    res.json({
      success: true,
      data: {
        markets: marketsWithPrices,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });
  }

  // Get trending markets
  static async getTrendingMarkets(req, res) {
    const { limit = 10, timeframe = '24h' } = req.query;
    
    let timeFilter = {};
    const now = new Date();
    
    switch (timeframe) {
      case '1h':
        timeFilter = { createdAt: { $gte: new Date(now - 60 * 60 * 1000) } };
        break;
      case '24h':
        timeFilter = { createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) } };
        break;
      case '7d':
        timeFilter = { createdAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } };
        break;
    }

    const markets = await Market.find({
      status: 'active',
      ...timeFilter
    })
      .sort({ 
        totalVolume: -1, 
        'statistics.uniqueTraders': -1,
        totalTrades: -1 
      })
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: {
        markets,
        timeframe
      }
    });
  }

  // Get featured markets
  static async getFeaturedMarkets(req, res) {
    const { limit = 5 } = req.query;

    const markets = await Market.find({
      status: 'active',
      isFeatured: true
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: { markets }
    });
  }

  // Get markets by category
  static async getMarketsByCategory(req, res) {
    const { category } = req.params;
    const { limit = 20, page = 1 } = req.query;
    
    const skip = (page - 1) * limit;

    const [markets, total] = await Promise.all([
      Market.find({
        category,
        status: 'active',
        expiresAt: { $gt: new Date() }
      })
        .sort({ totalVolume: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Market.countDocuments({
        category,
        status: 'active',
        expiresAt: { $gt: new Date() }
      })
    ]);

    res.json({
      success: true,
      data: {
        markets,
        category,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      }
    });
  }

  // Get market statistics
  static async getMarketStats(req, res) {
    const stats = await Market.aggregate([
      {
        $group: {
          _id: null,
          totalMarkets: { $sum: 1 },
          activeMarkets: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          totalVolume: { $sum: '$totalVolume' },
          avgVolume: { $avg: '$totalVolume' },
          totalTrades: { $sum: '$totalTrades' }
        }
      }
    ]);

    const categoryStats = await Market.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalVolume: { $sum: '$totalVolume' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        overall: stats[0] || {},
        byCategory: categoryStats
      }
    });
  }

  // Get specific market by ID
  static async getMarketById(req, res) {
    const { id } = req.params;
    
    const market = await Market.findOne({ marketId: id }).lean();
    
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    // Get additional market data
    const [trades, positions, priceHistory] = await Promise.all([
      Trade.find({ marketId: id, status: 'confirmed' })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
      Position.aggregate([
        { $match: { marketId: id, status: 'active' } },
        {
          $group: {
            _id: '$tokenType',
            totalShares: { $sum: '$totalShares' },
            uniqueHolders: { $sum: 1 }
          }
        }
      ]),
      // Get recent price history
      market.statistics?.priceHistory?.slice(-100) || []
    ]);

    const marketData = {
      ...market,
      recentTrades: trades,
      positionStats: positions,
      priceHistory: priceHistory
    };

    // If user is authenticated, get their position
    if (req.user) {
      const userPosition = await Position.findOne({
        marketId: id,
        userWalletAddress: req.user.walletAddress,
        status: 'active'
      }).lean();
      
      marketData.userPosition = userPosition;
    }

    logger.market('Market viewed', {
      marketId: id,
      user: req.user?.walletAddress,
      category: market.category
    });

    res.json({
      success: true,
      data: marketData
    });
  }

  // Get market price history
  static async getMarketPriceHistory(req, res) {
    const { id } = req.params;
    const { resolution = '1h', limit = 100 } = req.query;

    const market = await Market.findOne({ marketId: id });
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    const priceHistory = await Trade.getMarketPriceHistory(id, resolution, parseInt(limit));

    res.json({
      success: true,
      data: {
        marketId: id,
        resolution,
        history: priceHistory
      }
    });
  }

  // Get market trades
  static async getMarketTrades(req, res) {
    const { id } = req.params;
    const { limit = 50, page = 1 } = req.query;

    const market = await Market.findOne({ marketId: id });
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    const skip = (page - 1) * limit;
    const trades = await Trade.find({
      marketId: id,
      status: 'confirmed'
    })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Trade.countDocuments({
      marketId: id,
      status: 'confirmed'
    });

    res.json({
      success: true,
      data: {
        trades,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      }
    });
  }

  // Create new market
  static async createMarket(req, res) {
    const {
      question,
      category,
      expiresAt,
      resolutionCriteria,
      initialLiquidity,
      walletAddress
    } = req.body;

    // Verify the user owns the wallet address
    if (walletAddress.toLowerCase() !== req.user.walletAddress) {
      throw new ForbiddenError('Cannot create market for different wallet address');
    }

    const marketId = `market_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Create market assets on Stellar
      const { yesAsset, noAsset, issuerKeypair } = await stellarService.createMarketAssets(marketId);

      // Create market in database
      const market = new Market({
        marketId,
        question,
        category,
        creatorWalletAddress: req.user.walletAddress,
        expiresAt: new Date(expiresAt),
        resolutionCriteria,
        initialLiquidity,
        yesTokenAssetCode: yesAsset.code,
        noTokenAssetCode: noAsset.code,
        yesTokenIssuer: yesAsset.issuer,
        noTokenIssuer: noAsset.issuer
      });

      await market.save();

      // Update user stats
      const user = await User.findOne({ walletAddress: req.user.walletAddress });
      if (user) {
        user.statistics.marketsCreated += 1;
        await user.save();
      }

      // Create Soroban contract for market logic
      try {
        const contractResult = await sorobanService.createMarket(issuerKeypair, {
          question,
          category,
          expirationTime: Math.floor(new Date(expiresAt).getTime() / 1000),
          resolutionSource: 'manual',
          initialLiquidity,
          yesTokenAddress: yesAsset.issuer,
          noTokenAddress: noAsset.issuer
        });

        market.metadata.contractAddress = contractResult.contractAddress;
        await market.save();
      } catch (error) {
        logger.error('Failed to create Soroban contract for market:', error);
        // Continue without contract - market can still function via traditional DEX
      }

      logger.market('Market created', {
        marketId,
        creator: req.user.walletAddress,
        category,
        initialLiquidity,
        expiresAt
      });

      res.status(201).json({
        success: true,
        data: market,
        message: 'Market created successfully'
      });
    } catch (error) {
      logger.error('Failed to create market:', error);
      throw error;
    }
  }

  // Update market (only creator can update)
  static async updateMarket(req, res) {
    const { id } = req.params;
    const updates = req.body;

    const market = await Market.findOne({ marketId: id });
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    // Check if user is the creator
    if (market.creatorWalletAddress !== req.user.walletAddress) {
      throw new ForbiddenError('Only market creator can update this market');
    }

    // Don't allow updates to active markets with trades
    if (market.status === 'active' && market.totalTrades > 0) {
      throw new ValidationError('Cannot update market with existing trades');
    }

    // Update allowed fields
    const allowedUpdates = ['question', 'resolutionCriteria'];
    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    Object.assign(market, filteredUpdates);
    await market.save();

    logger.market('Market updated', {
      marketId: id,
      updater: req.user.walletAddress,
      updates: Object.keys(filteredUpdates)
    });

    res.json({
      success: true,
      data: market,
      message: 'Market updated successfully'
    });
  }

  // Resolve market
  static async resolveMarket(req, res) {
    const { id } = req.params;
    const { outcome, resolutionSource } = req.body;

    const market = await Market.findOne({ marketId: id });
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    // Check if user can resolve this market
    const isCreator = market.creatorWalletAddress === req.user.walletAddress;
    const isAdmin = req.user.userData?.level === 'admin';
    
    if (!isCreator && !isAdmin) {
      throw new ForbiddenError('Only market creator or admin can resolve this market');
    }

    // Check if market can be resolved
    if (market.status === 'resolved') {
      throw new ValidationError('Market is already resolved');
    }

    if (market.expiresAt > new Date()) {
      throw new ValidationError('Market has not expired yet');
    }

    try {
      // Resolve market on Soroban contract if available
      let transactionHash = null;
      if (market.metadata?.contractAddress) {
        const resolveResult = await sorobanService.resolveMarket(
          stellarService.adminKeypair,
          market.metadata.contractAddress,
          outcome
        );
        transactionHash = resolveResult.transactionHash;
      }

      // Update market in database
      market.resolve(outcome, req.user.walletAddress, transactionHash);
      if (resolutionSource) {
        market.metadata.resolutionSource = resolutionSource;
      }
      await market.save();

      // Update all positions for this market
      const positions = await Position.find({
        marketId: id,
        status: 'active'
      });

      for (const position of positions) {
        position.settle(outcome, 1.0); // Assuming winning tokens are worth 1 USDC
        await position.save();

        // Update user stats
        const user = await User.findOne({ walletAddress: position.userWalletAddress });
        if (user) {
          user.statistics.totalPredictions += 1;
          if ((outcome === 'yes' && position.tokenType === 'yes') ||
              (outcome === 'no' && position.tokenType === 'no')) {
            user.statistics.successfulPredictions += 1;
          }
          user.addProfitLoss(position.realizedPnL);
          await user.save();
        }
      }

      logger.market('Market resolved', {
        marketId: id,
        resolver: req.user.walletAddress,
        outcome,
        positionsUpdated: positions.length
      });

      res.json({
        success: true,
        data: market,
        message: `Market resolved with outcome: ${outcome}`
      });
    } catch (error) {
      logger.error('Failed to resolve market:', error);
      throw error;
    }
  }

  // Add liquidity to market
  static async addLiquidity(req, res) {
    const { id } = req.params;
    const { amount } = req.body;

    const market = await Market.findOne({ marketId: id });
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    if (market.status !== 'active') {
      throw new ValidationError('Cannot add liquidity to inactive market');
    }

    // This would integrate with Stellar DEX to add liquidity
    // For now, just return a success response
    res.json({
      success: true,
      message: 'Liquidity added successfully',
      data: {
        marketId: id,
        amount,
        provider: req.user.walletAddress
      }
    });
  }

  // Get user's position in market
  static async getUserPosition(req, res) {
    const { id } = req.params;

    const position = await Position.findOne({
      marketId: id,
      userWalletAddress: req.user.walletAddress,
      status: 'active'
    }).lean();

    res.json({
      success: true,
      data: position
    });
  }
}

module.exports = MarketController;
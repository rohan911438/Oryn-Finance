const { Market, User, Trade, Position } = require('../models');
const stellarService = require('../services/stellarService');
const sorobanService = require('../services/sorobanService');
const contractConfig = require('../config/contracts');
const logger = require('../config/logger');
const { NotFoundError, ValidationError, ForbiddenError, BadRequestError } = require('../middleware/errorHandler');
const cacheService = require('../services/cacheService');
const eventSourcingService = require('../services/eventSourcingService');
const atomicSettlementService = require('../services/atomicSettlementService');

class MarketController {
  // Get all markets with filtering and pagination
  static async getAllMarkets(req, res) {
    const {
      category,
      region,
      status = 'active',
      archived,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      tags,
      page = 1,
      limit = 20
    } = req.query;

    const isDefaultQuery = 
      !category && 
      !region && 
      status === 'active' && 
      !archived &&
      sortBy === 'createdAt' && 
      sortOrder === 'desc' && 
      !search && 
      !tags && 
      parseInt(page) === 1 && 
      parseInt(limit) === 20;

    // Cache-Aside default query
    if (isDefaultQuery) {
      const cachedResult = await cacheService.get(cacheService.getKeys.allMarkets());
      if (cachedResult) {
        logger.info('Serving default markets list from Redis cache');
        return res.json({
          success: true,
          data: cachedResult
        });
      }
    }

    const filter = {};
    
    if (category) filter.category = category;
    if (region) filter.region = region;
    if (status) filter.status = status;
    if (archived === 'true') filter.archived = true;
    if (archived === 'false') filter.archived = false;
    
    if (tags) {
      const tagList = Array.isArray(tags) ? tags : tags.split(',');
      filter.tags = { $in: tagList };
    }
    
    if (search) {
      filter.$or = [
        { question: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
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

    // Add live price information for each market from AMM contracts
    const marketsWithPrices = await Promise.all(
      markets.map(async (market) => {
        try {
          // Get live prices from AMM if contract address exists
          let livePrices = {
            yes: market.currentYesPrice || 0.5,
            no: market.currentNoPrice || 0.5
          };

          if (market.poolAddress) {
            try {
              const ammReserves = await sorobanService.getAMMReserves();
              if (ammReserves.result) {
                const { yesReserve, noReserve } = ammReserves.result;
                const totalReserve = yesReserve + noReserve;
                if (totalReserve > 0) {
                  livePrices.yes = yesReserve / totalReserve;
                  livePrices.no = noReserve / totalReserve;
                }
              }
            } catch (priceError) {
              logger.warn(`Failed to fetch live prices for market ${market.marketId}:`, priceError.message);
            }
          }

          return {
            ...market,
            currentPrices: livePrices,
            isLive: !!market.contractAddress,
            explorerUrl: market.contractAddress ? 
              `https://stellar.expert/explorer/testnet/contract/${market.contractAddress}` : null
          };
        } catch (error) {
          logger.error(`Error processing market ${market.marketId}:`, error);
          return {
            ...market,
            currentPrices: {
              yes: market.currentYesPrice || 0.5,
              no: market.currentNoPrice || 0.5
            },
            isLive: false
          };
        }
      })
    );

    const responseData = {
      markets: marketsWithPrices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    };

    if (isDefaultQuery) {
      await cacheService.set(cacheService.getKeys.allMarkets(), responseData, cacheService.DEFAULT_TTL);
    }

    logger.info('Markets retrieved from DB', {
      count: markets.length,
      total,
      filters: { category, status, archived, search },
      user: req.user?.walletAddress
    });

    res.json({
      success: true,
      data: responseData
    });
  }

  // Get trending markets
  static async getTrendingMarkets(req, res) {
    const { limit = 10, timeframe = '24h' } = req.query;

    const cacheKey = `${cacheService.getKeys.trendingMarkets()}:${timeframe}:${limit}`;
    const cachedResult = await cacheService.get(cacheKey);
    if (cachedResult) {
      logger.info(`Serving trending markets (${timeframe}, limit: ${limit}) from cache`);
      return res.json({
        success: true,
        data: {
          markets: cachedResult,
          timeframe
        }
      });
    }
    
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

    await cacheService.set(cacheKey, markets, cacheService.SHORT_TTL);

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

    const cacheKey = `market:featured:${limit}`;
    const cachedResult = await cacheService.get(cacheKey);
    if (cachedResult) {
      return res.json({
        success: true,
        data: { markets: cachedResult }
      });
    }

    const markets = await Market.find({
      status: 'active',
      isFeatured: true
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    await cacheService.set(cacheKey, markets, cacheService.DEFAULT_TTL);

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
    const cacheKey = cacheService.getKeys.marketDetail(id);

    // Serve public views from cache
    if (!req.user) {
      const cachedMarket = await cacheService.get(cacheKey);
      if (cachedMarket) {
        logger.info(`Serving market detail ${id} from cache`);
        return res.json({
          success: true,
          data: cachedMarket
        });
      }
    }
    
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

    // If user is authenticated, get their position (do not cache user specific position)
    if (req.user) {
      const userPosition = await Position.findOne({
        marketId: id,
        userWalletAddress: req.user.walletAddress,
        status: 'active'
      }).lean();
      
      marketData.userPosition = userPosition;
    } else {
      // Cache the public market details
      await cacheService.set(cacheKey, marketData, cacheService.DEFAULT_TTL);
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

  // Get live contract data for a market
  static async getMarketContractData(req, res) {
    const { id } = req.params;
    
    const market = await Market.findOne({ marketId: id }).lean();
    
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    try {
      const contractData = {};

      // Get live market data from prediction market contract
      if (market.contractAddress) {
        try {
          const marketInfo = await sorobanService.queryContract(
            'PREDICTION_MARKET_TEMPLATE',
            'getMarket',
            []
          );
          contractData.marketInfo = marketInfo.result;
        } catch (error) {
          logger.warn(`Failed to fetch contract market data for ${id}:`, error.message);
        }
      }

      // Get live prices from AMM pool
      if (market.poolAddress) {
        try {
          const [reserves, price] = await Promise.all([
            sorobanService.getAMMReserves(),
            sorobanService.getAMMPrice(market.yesTokenAssetCode, market.noTokenAssetCode)
          ]);
          
          contractData.amm = {
            reserves: reserves.result,
            currentPrice: price.result
          };
        } catch (error) {
          logger.warn(`Failed to fetch AMM data for ${id}:`, error.message);
        }
      }

      // Get oracle status if applicable
      try {
        // Query oracle resolver for resolution status
        const oracleStatus = await sorobanService.queryContract(
          'ORACLE_RESOLVER',
          'getMarketResolution',
          [contractConfig.XDR_HELPERS.toXdr.string(id)]
        );
        contractData.oracle = oracleStatus.result;
      } catch (error) {
        logger.debug(`No oracle data for market ${id}:`, error.message);
      }

      // Get user position from contract if authenticated
      if (req.user && market.contractAddress) {
        try {
          const userPosition = await sorobanService.getUserPosition(
            market.contractAddress,
            req.user.walletAddress
          );
          contractData.userPosition = userPosition.result;
        } catch (error) {
          logger.debug(`No contract position for user in market ${id}:`, error.message);
        }
      }

      logger.info(`Fetched contract data for market ${id}`, {
        hasMarketInfo: !!contractData.marketInfo,
        hasAMM: !!contractData.amm,
        hasOracle: !!contractData.oracle,
        hasUserPosition: !!contractData.userPosition
      });

      res.json({
        success: true,
        data: {
          marketId: id,
          contractData,
          metadata: {
            contractAddress: market.contractAddress,
            poolAddress: market.poolAddress,
            networkPassphrase: contractConfig.STELLAR_TESTNET_PASSPHRASE,
            explorerUrls: {
              market: market.contractAddress ? 
                `https://stellar.expert/explorer/testnet/contract/${market.contractAddress}` : null,
              pool: market.poolAddress ? 
                `https://stellar.expert/explorer/testnet/contract/${market.poolAddress}` : null
            }
          }
        }
      });
    } catch (error) {
      logger.error(`Failed to fetch contract data for market ${id}:`, error);
      throw new BadRequestError(`Failed to fetch live contract data: ${error.message}`);
    }
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

      // Create market via event sourcing
      const marketPayload = {
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
      };

      await eventSourcingService.appendEvent(marketId, 'MARKET_CREATED', marketPayload, req.user.walletAddress);

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

        await eventSourcingService.appendEvent(marketId, 'MARKET_UPDATED', { 'metadata.contractAddress': contractResult.contractAddress }, req.user.walletAddress);
      } catch (error) {
        logger.error('Failed to create Soroban contract for market:', error);
        // Continue without contract - market can still function via traditional DEX
      }

      const market = await Market.findOne({ marketId });

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

    await eventSourcingService.appendEvent(id, 'MARKET_UPDATED', filteredUpdates, req.user.walletAddress);
    
    // Fetch updated market to return
    const updatedMarket = await Market.findOne({ marketId: id });

    res.json({
      success: true,
      data: updatedMarket,
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
      const resolvedMarket = await atomicSettlementService.settleMarket(
        id,
        outcome,
        req.user.walletAddress,
        resolutionSource
      );

      res.json({
        success: true,
        data: resolvedMarket,
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

  // Get markets sorted by liquidity
  static async getMarketsByLiquidity(req, res) {
    const { limit = 20, page = 1, category } = req.query;

    const filter = { status: 'active' };
    if (category) filter.category = category;

    const skip = (page - 1) * limit;

    const [markets, total] = await Promise.all([
      Market.find(filter)
        .sort({ initialLiquidity: -1, totalVolume: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Market.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        markets,
        sortBy: 'liquidity',
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      }
    });
  }

  // Get markets sorted by momentum (recent trading activity)
  static async getMarketsByMomentum(req, res) {
    const { limit = 20, page = 1, category, timeframe = '24h' } = req.query;

    const filter = { status: 'active' };
    if (category) filter.category = category;

    const now = new Date();
    let timeFilter = {};
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

    const skip = (page - 1) * limit;

    const markets = await Market.aggregate([
      { $match: { ...filter, ...timeFilter } },
      {
        $addFields: {
          momentumScore: {
            $add: [
              { $multiply: [{ $ifNull: ['$totalVolume', 0] }, 0.4] },
              { $multiply: [{ $ifNull: ['$statistics.uniqueTraders', 0] }, 0.3] },
              { $multiply: [{ $ifNull: ['$totalTrades', 0] }, 0.2] },
              { $multiply: [{ $subtract: [1, { $divide: [{ $subtract: [new Date(), '$createdAt'] }, 86400000] }] }, 0.1] }
            ]
          }
        }
      },
      { $sort: { momentumScore: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    const total = await Market.countDocuments(filter);

    res.json({
      success: true,
      data: {
        markets,
        sortBy: 'momentum',
        timeframe,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      }
    });
  }

  // Get markets sorted by activity (trader count + trade count)
  static async getMarketsByActivity(req, res) {
    const { limit = 20, page = 1, category } = req.query;

    const filter = { status: 'active' };
    if (category) filter.category = category;

    const skip = (page - 1) * limit;

    const [markets, total] = await Promise.all([
      Market.find(filter)
        .sort({ 'statistics.uniqueTraders': -1, totalTrades: -1, totalVolume: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Market.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        markets,
        sortBy: 'activity',
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      }
    });
  }

  // Get trending algorithm with momentum scoring
  static async getTrendingMarketsV2(req, res) {
    const { limit = 10, timeframe = '24h' } = req.query;

    const now = new Date();
    let timeFilter = {};
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

    const markets = await Market.aggregate([
      { $match: { status: 'active', ...timeFilter } },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: [{ $ifNull: ['$totalVolume', 0] }, 0.35] },
              { $multiply: [{ $ifNull: ['$statistics.uniqueTraders', 0] }, 0.25] },
              { $multiply: [{ $ifNull: ['$totalTrades', 0] }, 0.2] },
              { $multiply: [{ $ifNull: ['$initialLiquidity', 0] }, 0.1] },
              { $multiply: [{ $subtract: [1, { $divide: [{ $subtract: [now, '$createdAt'] }, 86400000] }] }, 0.1] }
            ]
          }
        }
      },
      { $sort: { trendingScore: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json({
      success: true,
      data: {
        markets,
        timeframe,
        algorithm: 'momentum-based'
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

  // Get markets by region
  static async getMarketsByRegion(req, res) {
    const { region } = req.params;
    const { limit = 20, page = 1 } = req.query;

    const skip = (page - 1) * limit;

    const [markets, total] = await Promise.all([
      Market.find({
        region,
        status: 'active',
        expiresAt: { $gt: new Date() }
      })
        .sort({ totalVolume: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Market.countDocuments({
        region,
        status: 'active',
        expiresAt: { $gt: new Date() }
      })
    ]);

    res.json({
      success: true,
      data: {
        markets,
        region,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      }
    });
  }

  // Get recommended markets for a user based on region and category
  static async getRecommendedMarkets(req, res) {
    const { limit = 10, region: preferredRegion, country } = req.query;

    const COUNTRY_TO_REGION = {
      us: 'north_america',
      usa: 'north_america',
      united_states: 'north_america',
      ca: 'north_america',
      canada: 'north_america',
      gb: 'europe',
      uk: 'europe',
      united_kingdom: 'europe',
      de: 'europe',
      fr: 'europe',
      es: 'europe',
      ng: 'africa',
      gh: 'africa',
      za: 'africa',
      ke: 'africa',
      in: 'asia',
      pk: 'asia',
      sg: 'asia',
      jp: 'asia',
      au: 'oceania',
      nz: 'oceania',
      br: 'south_america',
      ar: 'south_america',
      mx: 'north_america',
      ae: 'middle_east',
      sa: 'middle_east',
    };

    const normalizedCountry = String(country || '').trim().toLowerCase();
    const userRegion = preferredRegion || COUNTRY_TO_REGION[normalizedCountry] || req.user?.userData?.region || 'global';

    const markets = await Market.find({
      status: 'active',
      expiresAt: { $gt: new Date() },
      archived: { $ne: true },
      $or: [
        { region: userRegion },
        { region: 'global' }
      ]
    })
      .sort({ totalVolume: -1, 'statistics.uniqueTraders': -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: {
        markets,
        region: userRegion,
        country: normalizedCountry || null,
        recommendationType: 'region_based'
      }
    });
  }

  // Get region statistics
  static async getRegionStats(req, res) {
    const regionStats = await Market.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$region',
          count: { $sum: 1 },
          totalVolume: { $sum: '$totalVolume' },
          totalTrades: { $sum: '$totalTrades' },
          avgLiquidity: { $avg: '$initialLiquidity' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: regionStats
    });
  }
}

module.exports = MarketController;

const { TreasuryTransaction, Market, LiquidityPosition, Position, Trade } = require('../models');
const logger = require('../config/logger');
const auditService = require('../services/auditService');
const { NotFoundError, ForbiddenError, ValidationError } = require('../middleware/errorHandler');

class TreasuryController {
  static async getTreasuryOverview(req, res) {
    try {
      const [balanceByAsset, totalInflows, totalOutflows, recentTransactions] = await Promise.all([
        TreasuryTransaction.getTreasuryBalance(),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: { $in: ['fee_inflow', 'investment_return'] } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: { $in: ['distribution_outflow', 'withdrawal', 'emergency_withdraw', 'investment'] } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        TreasuryTransaction.find({ status: 'completed' })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean()
      ]);

      const inflowStats = totalInflows[0] || { total: 0, count: 0 };
      const outflowStats = totalOutflows[0] || { total: 0, count: 0 };

      const balanceMap = {};
      for (const b of balanceByAsset) {
        balanceMap[b._id] = (b.totalInflow || 0) - (b.totalOutflow || 0);
      }

      res.json({
        success: true,
        data: {
          balance: balanceMap,
          totalInflows: inflowStats.total,
          inflowCount: inflowStats.count,
          totalOutflows: outflowStats.total,
          outflowCount: outflowStats.count,
          netBalance: inflowStats.total - outflowStats.total,
          recentTransactions
        }
      });
    } catch (error) {
      logger.error('getTreasuryOverview failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch treasury overview' });
    }
  }

  static async getFeeInflows(req, res) {
    try {
      const { limit = 50, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [transactions, total] = await Promise.all([
        TreasuryTransaction.find({ type: 'fee_inflow', status: 'completed' })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        TreasuryTransaction.countDocuments({ type: 'fee_inflow', status: 'completed' })
      ]);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      logger.error('getFeeInflows failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch fee inflows' });
    }
  }

  static async getOutflows(req, res) {
    try {
      const { limit = 50, page = 1, type } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const filter = {
        type: type || { $in: ['distribution_outflow', 'withdrawal', 'emergency_withdraw'] },
        status: 'completed'
      };

      const [transactions, total] = await Promise.all([
        TreasuryTransaction.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        TreasuryTransaction.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      logger.error('getOutflows failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch outflows' });
    }
  }

  static async recordFeeInflow(req, res) {
    try {
      const { asset = 'USDC', amount, source = 'trading_fees', purpose, fromAddress } = req.body;

      if (!amount || amount <= 0) {
        throw new ValidationError('Amount must be positive');
      }

      const transaction = new TreasuryTransaction({
        type: 'fee_inflow',
        asset,
        amount,
        source,
        purpose: purpose || `Fee collection from ${source}`,
        fromAddress: fromAddress || req.user.walletAddress,
        executedBy: req.user.walletAddress,
        status: 'completed'
      });

      await transaction.save();

      logger.info('Treasury fee inflow recorded', {
        amount,
        asset,
        source,
        by: req.user.walletAddress
      });

      await auditService.treasury('treasury.inflow_recorded', req, {
        description: `Fee inflow of ${amount} ${asset} recorded`,
        target: { type: 'treasury', id: transaction.transactionId },
        metadata: { amount, asset, source }
      });

      res.status(201).json({
        success: true,
        data: transaction,
        message: 'Fee inflow recorded successfully'
      });
    } catch (error) {
      logger.error('recordFeeInflow failed:', error);
      throw error;
    }
  }

  static async recordDistribution(req, res) {
    try {
      const { asset = 'USDC', amount, purpose, toAddress } = req.body;

      if (!amount || amount <= 0) {
        throw new ValidationError('Amount must be positive');
      }

      const transaction = new TreasuryTransaction({
        type: 'distribution_outflow',
        asset,
        amount,
        source: 'governance',
        purpose: purpose || 'Fee distribution',
        toAddress: toAddress || req.user.walletAddress,
        executedBy: req.user.walletAddress,
        status: 'completed'
      });

      await transaction.save();

      logger.info('Treasury distribution recorded', {
        amount,
        asset,
        to: toAddress,
        by: req.user.walletAddress
      });

      await auditService.treasury('treasury.distribution_recorded', req, {
        description: `Distribution of ${amount} ${asset} recorded`,
        target: { type: 'treasury', id: transaction.transactionId },
        metadata: { amount, asset, toAddress: toAddress || req.user.walletAddress }
      });

      res.status(201).json({
        success: true,
        data: transaction,
        message: 'Distribution recorded successfully'
      });
    } catch (error) {
      logger.error('recordDistribution failed:', error);
      throw error;
    }
  }

  static async recordGovernanceAction(req, res) {
    try {
      const { action, proposalId, details } = req.body;

      if (!action) {
        throw new ValidationError('Action description is required');
      }

      const transaction = new TreasuryTransaction({
        type: 'governance_action',
        asset: 'USDC',
        amount: 0,
        source: 'governance',
        purpose: `Governance action: ${action}`,
        governanceProposalId: proposalId,
        executedBy: req.user.walletAddress,
        metadata: { action, details },
        status: 'completed'
      });

      await transaction.save();

      await auditService.treasury('treasury.governance_action', req, {
        description: `Governance action recorded: ${action}`,
        target: { type: 'treasury', id: transaction.transactionId },
        metadata: { action, proposalId }
      });

      res.status(201).json({
        success: true,
        data: transaction,
        message: 'Governance action recorded'
      });
    } catch (error) {
      logger.error('recordGovernanceAction failed:', error);
      throw error;
    }
  }

  static async getGovernanceActions(req, res) {
    try {
      const { limit = 20 } = req.query;
      const actions = await TreasuryTransaction.getGovernanceActions(parseInt(limit));

      res.json({
        success: true,
        data: { actions }
      });
    } catch (error) {
      logger.error('getGovernanceActions failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch governance actions' });
    }
  }

  static async getTreasurySummary(req, res) {
    try {
      const now = new Date();
      const last24h = new Date(now - 24 * 60 * 60 * 1000);
      const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

      const [currentBalance, inflows24h, inflows7d, outflows24h, outflows7d, topSources] = await Promise.all([
        TreasuryTransaction.getTreasuryBalance(),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last24h } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last7d } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: { $in: ['distribution_outflow', 'withdrawal'] }, createdAt: { $gte: last24h } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: { $in: ['distribution_outflow', 'withdrawal'] }, createdAt: { $gte: last7d } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: 'fee_inflow' } },
          { $group: { _id: '$source', total: { $sum: '$amount' }, count: { $sum: 1 } } },
          { $sort: { total: -1 } },
          { $limit: 5 }
        ])
      ]);

      const balanceMap = {};
      for (const b of currentBalance) {
        balanceMap[b._id] = (b.totalInflow || 0) - (b.totalOutflow || 0);
      }

      res.json({
        success: true,
        data: {
          balance: balanceMap,
          inflows: {
            last24h: inflows24h[0]?.total || 0,
            last7d: inflows7d[0]?.total || 0
          },
          outflows: {
            last24h: outflows24h[0]?.total || 0,
            last7d: outflows7d[0]?.total || 0
          },
          topSources
        }
      });
    } catch (error) {
      logger.error('getTreasurySummary failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch treasury summary' });
    }
  }

  /**
   * Get TVL (Total Value Locked) across all markets and liquidity pools
   */
  static async getTVL(req, res) {
    try {
      const [marketTVL, liquidityTVL, positionTVL] = await Promise.all([
        // Calculate TVL from active markets
        Market.aggregate([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: null,
              totalVolume: { $sum: '$totalVolume' },
              totalTrades: { $sum: '$totalTrades' },
              activeMarkets: { $sum: 1 }
            }
          }
        ]),
        // Calculate TVL from liquidity positions
        LiquidityPosition.aggregate([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: null,
              totalLiquidity: { $sum: '$totalLiquidity' },
              activePositions: { $sum: 1 }
            }
          }
        ]),
        // Calculate TVL from user positions
        Position.aggregate([
          {
            $group: {
              _id: null,
              totalInvested: { $sum: '$totalInvested' },
              totalPositions: { $sum: 1 }
            }
          }
        ])
      ]);

      const marketData = marketTVL[0] || { totalVolume: 0, totalTrades: 0, activeMarkets: 0 };
      const liquidityData = liquidityTVL[0] || { totalLiquidity: 0, activePositions: 0 };
      const positionData = positionTVL[0] || { totalInvested: 0, totalPositions: 0 };

      const totalTVL = marketData.totalVolume + liquidityData.totalLiquidity + positionData.totalInvested;

      res.json({
        success: true,
        data: {
          totalTVL,
          breakdown: {
            markets: {
              tvl: marketData.totalVolume,
              count: marketData.activeMarkets,
              totalTrades: marketData.totalTrades
            },
            liquidity: {
              tvl: liquidityData.totalLiquidity,
              count: liquidityData.activePositions
            },
            positions: {
              tvl: positionData.totalInvested,
              count: positionData.totalPositions
            }
          }
        }
      });
    } catch (error) {
      logger.error('getTVL failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch TVL' });
    }
  }

  /**
   * Get treasury asset allocation
   */
  static async getAssetAllocation(req, res) {
    try {
      const [treasuryBalance, marketAllocation, liquidityAllocation] = await Promise.all([
        TreasuryTransaction.getTreasuryBalance(),
        Market.aggregate([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: '$category',
              totalVolume: { $sum: '$totalVolume' },
              marketCount: { $sum: 1 }
            }
          },
          { $sort: { totalVolume: -1 } }
        ]),
        LiquidityPosition.aggregate([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: '$poolAddress',
              totalLiquidity: { $sum: '$totalLiquidity' },
              positionCount: { $sum: 1 }
            }
          },
          { $sort: { totalLiquidity: -1 } }
        ])
      ]);

      const assetBreakdown = treasuryBalance.map(b => ({
        asset: b._id,
        balance: (b.totalInflow || 0) - (b.totalOutflow || 0),
        percentage: 0 // Will be calculated
      }));

      const totalTreasuryBalance = assetBreakdown.reduce((sum, a) => sum + a.balance, 0);
      assetBreakdown.forEach(a => {
        a.percentage = totalTreasuryBalance > 0 ? (a.balance / totalTreasuryBalance * 100).toFixed(2) : 0;
      });

      res.json({
        success: true,
        data: {
          treasury: assetBreakdown,
          markets: marketAllocation,
          liquidity: liquidityAllocation,
          totalTreasuryBalance
        }
      });
    } catch (error) {
      logger.error('getAssetAllocation failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch asset allocation' });
    }
  }

  /**
   * Get active positions across the protocol
   */
  static async getActivePositions(req, res) {
    try {
      const { limit = 20, type } = req.query;
      const limitNum = Math.min(parseInt(limit), 100);

      const [userPositions, liquidityPositions, recentTrades] = await Promise.all([
        Position.find()
          .sort({ lastUpdated: -1 })
          .limit(limitNum)
          .populate('marketId', 'question category status')
          .lean(),
        LiquidityPosition.find({ status: 'active' })
          .sort({ createdAt: -1 })
          .limit(limitNum)
          .lean(),
        Trade.find({ status: 'confirmed' })
          .sort({ timestamp: -1 })
          .limit(limitNum)
          .populate('marketId', 'question category')
          .lean()
      ]);

      const totalUserPositions = await Position.countDocuments();
      const totalLiquidityPositions = await LiquidityPosition.countDocuments({ status: 'active' });

      res.json({
        success: true,
        data: {
          userPositions: {
            positions: userPositions,
            total: totalUserPositions,
            showing: userPositions.length
          },
          liquidityPositions: {
            positions: liquidityPositions,
            total: totalLiquidityPositions,
            showing: liquidityPositions.length
          },
          recentActivity: recentTrades
        }
      });
    } catch (error) {
      logger.error('getActivePositions failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch active positions' });
    }
  }

  /**
   * Get yield generation statistics
   */
  static async getYieldStatistics(req, res) {
    try {
      const now = new Date();
      const last24h = new Date(now - 24 * 60 * 60 * 1000);
      const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const [feeInflows24h, feeInflows7d, feeInflows30d, yieldBySource, apyData] = await Promise.all([
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last24h } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last7d } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last30d } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last30d } } },
          {
            $group: {
              _id: '$source',
              total: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          { $sort: { total: -1 } }
        ]),
        // Calculate APY based on 30d annualized returns
        TreasuryTransaction.aggregate([
          { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last30d } } },
          {
            $group: {
              _id: null,
              totalYield30d: { $sum: '$amount' }
            }
          }
        ])
      ]);

      const inflows24h = feeInflows24h[0] || { total: 0, count: 0 };
      const inflows7d = feeInflows7d[0] || { total: 0, count: 0 };
      const inflows30d = feeInflows30d[0] || { total: 0, count: 0 };
      const apyCalc = apyData[0] || { totalYield30d: 0 };

      // Calculate APY (annualized 30d yield)
      const apy = apyCalc.totalYield30d > 0 ? (apyCalc.totalYield30d * 12).toFixed(2) : 0;

      res.json({
        success: true,
        data: {
          yield: {
            last24h: inflows24h.total,
            last7d: inflows7d.total,
            last30d: inflows30d.total,
            apy: parseFloat(apy)
          },
          yieldBySource,
          transactionCounts: {
            last24h: inflows24h.count,
            last7d: inflows7d.count,
            last30d: inflows30d.count
          }
        }
      });
    } catch (error) {
      logger.error('getYieldStatistics failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch yield statistics' });
    }
  }

  /**
   * Get risk exposure metrics
   */
  static async getRiskMetrics(req, res) {
    try {
      const [marketRisk, liquidityRisk, concentrationRisk, volatilityData] = await Promise.all([
        // Market risk: concentration of large positions
        Market.aggregate([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: null,
              totalVolume: { $sum: '$totalVolume' },
              avgVolume: { $avg: '$totalVolume' },
              maxVolume: { $max: '$totalVolume' },
              marketCount: { $sum: 1 }
            }
          }
        ]),
        // Liquidity risk: depth of liquidity pools
        LiquidityPosition.aggregate([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: null,
              totalLiquidity: { $sum: '$totalLiquidity' },
              avgLiquidity: { $avg: '$totalLiquidity' },
              minLiquidity: { $min: '$totalLiquidity' },
              positionCount: { $sum: 1 }
            }
          }
        ]),
        // Concentration risk: top positions vs total
        Position.aggregate([
          {
            $group: {
              _id: '$userWalletAddress',
              totalInvested: { $sum: '$totalInvested' },
              positionCount: { $sum: 1 }
            }
          },
          { $sort: { totalInvested: -1 } },
          { $limit: 10 }
        ]),
        // Volatility: trade volume variance
        Trade.aggregate([
          { $match: { status: 'confirmed', timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
          {
            $group: {
              _id: null,
              avgTradeSize: { $avg: '$totalCost' },
              totalVolume: { $sum: '$totalCost' },
              tradeCount: { $sum: 1 },
              stdDev: { $stdDevPop: '$totalCost' }
            }
          }
        ])
      ]);

      const marketData = marketRisk[0] || { totalVolume: 0, avgVolume: 0, maxVolume: 0, marketCount: 0 };
      const liquidityData = liquidityRisk[0] || { totalLiquidity: 0, avgLiquidity: 0, minLiquidity: 0, positionCount: 0 };
      const volatilityStats = volatilityData[0] || { avgTradeSize: 0, totalVolume: 0, tradeCount: 0, stdDev: 0 };

      // Calculate concentration risk (top 10 positions % of total)
      const totalInvestedAll = concentrationRisk.reduce((sum, pos) => sum + pos.totalInvested, 0);
      const top10Invested = concentrationRisk.slice(0, 10).reduce((sum, pos) => sum + pos.totalInvested, 0);
      const concentrationRatio = totalInvestedAll > 0 ? (top10Invested / totalInvestedAll * 100).toFixed(2) : 0;

      // Calculate risk scores (0-100, higher = riskier)
      const marketRiskScore = marketData.marketCount > 0 ? Math.min(100, (marketData.maxVolume / (marketData.avgVolume || 1)) * 20) : 0;
      const liquidityRiskScore = liquidityData.positionCount > 0 ? Math.min(100, (liquidityData.minLiquidity / (liquidityData.avgLiquidity || 1)) * 30) : 0;
      const concentrationRiskScore = parseFloat(concentrationRatio) > 50 ? parseFloat(concentrationRatio) : 0;
      const volatilityRiskScore = volatilityStats.stdDev > 0 ? Math.min(100, (volatilityStats.stdDev / (volatilityStats.avgTradeSize || 1)) * 25) : 0;

      const overallRiskScore = ((marketRiskScore + liquidityRiskScore + concentrationRiskScore + volatilityRiskScore) / 4).toFixed(2);

      res.json({
        success: true,
        data: {
          overallRiskScore: parseFloat(overallRiskScore),
          riskBreakdown: {
            market: {
              score: marketRiskScore,
              totalVolume: marketData.totalVolume,
              marketCount: marketData.marketCount,
              maxVolume: marketData.maxVolume,
              avgVolume: marketData.avgVolume
            },
            liquidity: {
              score: liquidityRiskScore,
              totalLiquidity: liquidityData.totalLiquidity,
              positionCount: liquidityData.positionCount,
              minLiquidity: liquidityData.minLiquidity,
              avgLiquidity: liquidityData.avgLiquidity
            },
            concentration: {
              score: concentrationRiskScore,
              ratio: parseFloat(concentrationRatio),
              topPositions: concentrationRisk.slice(0, 10)
            },
            volatility: {
              score: volatilityRiskScore,
              avgTradeSize: volatilityStats.avgTradeSize,
              totalVolume: volatilityStats.totalVolume,
              tradeCount: volatilityStats.tradeCount,
              stdDev: volatilityStats.stdDev
            }
          }
        }
      });
    } catch (error) {
      logger.error('getRiskMetrics failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch risk metrics' });
    }
  }

  /**
   * Get comprehensive dashboard data (all metrics in one call)
   */
  static async getDashboardData(req, res) {
    try {
      const [overview, tvl, allocation, positions, yieldStats, risk] = await Promise.all([
        this.getTreasuryOverviewData(),
        this.getTVLData(),
        this.getAssetAllocationData(),
        this.getActivePositionsData(),
        this.getYieldStatisticsData(),
        this.getRiskMetricsData()
      ]);

      res.json({
        success: true,
        data: {
          overview,
          tvl,
          allocation,
          positions,
          yield: yieldStats,
          risk,
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('getDashboardData failed:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
    }
  }

  // Helper methods for dashboard data aggregation
  static async getTreasuryOverviewData() {
    const [balanceByAsset, totalInflows, totalOutflows, recentTransactions] = await Promise.all([
      TreasuryTransaction.getTreasuryBalance(),
      TreasuryTransaction.aggregate([
        { $match: { status: 'completed', type: { $in: ['fee_inflow', 'investment_return'] } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      TreasuryTransaction.aggregate([
        { $match: { status: 'completed', type: { $in: ['distribution_outflow', 'withdrawal', 'emergency_withdraw', 'investment'] } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      TreasuryTransaction.find({ status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
    ]);

    const inflowStats = totalInflows[0] || { total: 0, count: 0 };
    const outflowStats = totalOutflows[0] || { total: 0, count: 0 };

    const balanceMap = {};
    for (const b of balanceByAsset) {
      balanceMap[b._id] = (b.totalInflow || 0) - (b.totalOutflow || 0);
    }

    return {
      balance: balanceMap,
      totalInflows: inflowStats.total,
      inflowCount: inflowStats.count,
      totalOutflows: outflowStats.total,
      outflowCount: outflowStats.count,
      netBalance: inflowStats.total - outflowStats.total,
      recentTransactions
    };
  }

  static async getTVLData() {
    const [marketTVL, liquidityTVL, positionTVL] = await Promise.all([
      Market.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: null,
            totalVolume: { $sum: '$totalVolume' },
            totalTrades: { $sum: '$totalTrades' },
            activeMarkets: { $sum: 1 }
          }
        }
      ]),
      LiquidityPosition.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: null,
            totalLiquidity: { $sum: '$totalLiquidity' },
            activePositions: { $sum: 1 }
          }
        }
      ]),
      Position.aggregate([
        {
          $group: {
            _id: null,
            totalInvested: { $sum: '$totalInvested' },
            totalPositions: { $sum: 1 }
          }
        }
      ])
    ]);

    const marketData = marketTVL[0] || { totalVolume: 0, totalTrades: 0, activeMarkets: 0 };
    const liquidityData = liquidityTVL[0] || { totalLiquidity: 0, activePositions: 0 };
    const positionData = positionTVL[0] || { totalInvested: 0, totalPositions: 0 };

    const totalTVL = marketData.totalVolume + liquidityData.totalLiquidity + positionData.totalInvested;

    return {
      totalTVL,
      breakdown: {
        markets: { tvl: marketData.totalVolume, count: marketData.activeMarkets, totalTrades: marketData.totalTrades },
        liquidity: { tvl: liquidityData.totalLiquidity, count: liquidityData.activePositions },
        positions: { tvl: positionData.totalInvested, count: positionData.totalPositions }
      }
    };
  }

  static async getAssetAllocationData() {
    const [treasuryBalance, marketAllocation] = await Promise.all([
      TreasuryTransaction.getTreasuryBalance(),
      Market.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: '$category',
            totalVolume: { $sum: '$totalVolume' },
            marketCount: { $sum: 1 }
          }
        },
        { $sort: { totalVolume: -1 } }
      ])
    ]);

    const assetBreakdown = treasuryBalance.map(b => ({
      asset: b._id,
      balance: (b.totalInflow || 0) - (b.totalOutflow || 0),
      percentage: 0
    }));

    const totalTreasuryBalance = assetBreakdown.reduce((sum, a) => sum + a.balance, 0);
    assetBreakdown.forEach(a => {
      a.percentage = totalTreasuryBalance > 0 ? (a.balance / totalTreasuryBalance * 100).toFixed(2) : 0;
    });

    return {
      treasury: assetBreakdown,
      markets: marketAllocation,
      totalTreasuryBalance
    };
  }

  static async getActivePositionsData() {
    const limitNum = 20;

    const [userPositions, liquidityPositions] = await Promise.all([
      Position.find()
        .sort({ lastUpdated: -1 })
        .limit(limitNum)
        .populate('marketId', 'question category status')
        .lean(),
      LiquidityPosition.find({ status: 'active' })
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .lean()
    ]);

    const totalUserPositions = await Position.countDocuments();
    const totalLiquidityPositions = await LiquidityPosition.countDocuments({ status: 'active' });

    return {
      userPositions: {
        positions: userPositions,
        total: totalUserPositions,
        showing: userPositions.length
      },
      liquidityPositions: {
        positions: liquidityPositions,
        total: totalLiquidityPositions,
        showing: liquidityPositions.length
      }
    };
  }

  static async getYieldStatisticsData() {
    const now = new Date();
    const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [feeInflows24h, feeInflows7d, feeInflows30d, yieldBySource, apyData] = await Promise.all([
      TreasuryTransaction.aggregate([
        { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      TreasuryTransaction.aggregate([
        { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      TreasuryTransaction.aggregate([
        { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last30d } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      TreasuryTransaction.aggregate([
        { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last30d } } },
        {
          $group: {
            _id: '$source',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } }
      ]),
      TreasuryTransaction.aggregate([
        { $match: { status: 'completed', type: 'fee_inflow', createdAt: { $gte: last30d } } },
        {
          $group: {
            _id: null,
            totalYield30d: { $sum: '$amount' }
          }
        }
      ])
    ]);

    const inflows24h = feeInflows24h[0] || { total: 0, count: 0 };
    const inflows7d = feeInflows7d[0] || { total: 0, count: 0 };
    const inflows30d = feeInflows30d[0] || { total: 0, count: 0 };
    const apyCalc = apyData[0] || { totalYield30d: 0 };

    const apy = apyCalc.totalYield30d > 0 ? (apyCalc.totalYield30d * 12).toFixed(2) : 0;

    return {
      yield: {
        last24h: inflows24h.total,
        last7d: inflows7d.total,
        last30d: inflows30d.total,
        apy: parseFloat(apy)
      },
      yieldBySource,
      transactionCounts: {
        last24h: inflows24h.count,
        last7d: inflows7d.count,
        last30d: inflows30d.count
      }
    };
  }

  static async getRiskMetricsData() {
    const [marketRisk, liquidityRisk, concentrationRisk, volatilityData] = await Promise.all([
      Market.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: null,
            totalVolume: { $sum: '$totalVolume' },
            avgVolume: { $avg: '$totalVolume' },
            maxVolume: { $max: '$totalVolume' },
            marketCount: { $sum: 1 }
          }
        }
      ]),
      LiquidityPosition.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: null,
            totalLiquidity: { $sum: '$totalLiquidity' },
            avgLiquidity: { $avg: '$totalLiquidity' },
            minLiquidity: { $min: '$totalLiquidity' },
            positionCount: { $sum: 1 }
          }
        }
      ]),
      Position.aggregate([
        {
          $group: {
            _id: '$userWalletAddress',
            totalInvested: { $sum: '$totalInvested' },
            positionCount: { $sum: 1 }
          }
        },
        { $sort: { totalInvested: -1 } },
        { $limit: 10 }
      ]),
      Trade.aggregate([
        { $match: { status: 'confirmed', timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: null,
            avgTradeSize: { $avg: '$totalCost' },
            totalVolume: { $sum: '$totalCost' },
            tradeCount: { $sum: 1 },
            stdDev: { $stdDevPop: '$totalCost' }
          }
        }
      ])
    ]);

    const marketData = marketRisk[0] || { totalVolume: 0, avgVolume: 0, maxVolume: 0, marketCount: 0 };
    const liquidityData = liquidityRisk[0] || { totalLiquidity: 0, avgLiquidity: 0, minLiquidity: 0, positionCount: 0 };
    const volatilityStats = volatilityData[0] || { avgTradeSize: 0, totalVolume: 0, tradeCount: 0, stdDev: 0 };

    const totalInvestedAll = concentrationRisk.reduce((sum, pos) => sum + pos.totalInvested, 0);
    const top10Invested = concentrationRisk.slice(0, 10).reduce((sum, pos) => sum + pos.totalInvested, 0);
    const concentrationRatio = totalInvestedAll > 0 ? (top10Invested / totalInvestedAll * 100).toFixed(2) : 0;

    const marketRiskScore = marketData.marketCount > 0 ? Math.min(100, (marketData.maxVolume / (marketData.avgVolume || 1)) * 20) : 0;
    const liquidityRiskScore = liquidityData.positionCount > 0 ? Math.min(100, (liquidityData.minLiquidity / (liquidityData.avgLiquidity || 1)) * 30) : 0;
    const concentrationRiskScore = parseFloat(concentrationRatio) > 50 ? parseFloat(concentrationRatio) : 0;
    const volatilityRiskScore = volatilityStats.stdDev > 0 ? Math.min(100, (volatilityStats.stdDev / (volatilityStats.avgTradeSize || 1)) * 25) : 0;

    const overallRiskScore = ((marketRiskScore + liquidityRiskScore + concentrationRiskScore + volatilityRiskScore) / 4).toFixed(2);

    return {
      overallRiskScore: parseFloat(overallRiskScore),
      riskBreakdown: {
        market: {
          score: marketRiskScore,
          totalVolume: marketData.totalVolume,
          marketCount: marketData.marketCount,
          maxVolume: marketData.maxVolume,
          avgVolume: marketData.avgVolume
        },
        liquidity: {
          score: liquidityRiskScore,
          totalLiquidity: liquidityData.totalLiquidity,
          positionCount: liquidityData.positionCount,
          minLiquidity: liquidityData.minLiquidity,
          avgLiquidity: liquidityData.avgLiquidity
        },
        concentration: {
          score: concentrationRiskScore,
          ratio: parseFloat(concentrationRatio),
          topPositions: concentrationRisk.slice(0, 10)
        },
        volatility: {
          score: volatilityRiskScore,
          avgTradeSize: volatilityStats.avgTradeSize,
          totalVolume: volatilityStats.totalVolume,
          tradeCount: volatilityStats.tradeCount,
          stdDev: volatilityStats.stdDev
        }
      }
    };
  }
}

module.exports = TreasuryController;

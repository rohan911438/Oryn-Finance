const { Trade, Market, User, Position } = require('../models');
const stellarService = require('../services/stellarService');
const sorobanService = require('../services/sorobanService');
const logger = require('../config/logger');
const { NotFoundError, ValidationError, StellarError } = require('../middleware/errorHandler');

class TradeController {
  // Execute a trade with partial fill support
  static async executeTrade(req, res) {
    const {
      marketId,
      tokenType,
      tradeType,
      amount,
      maxSlippage = 0.05,
      walletAddress
    } = req.body;

    // Verify user owns the wallet
    if (walletAddress.toLowerCase() !== req.user.walletAddress) {
      throw new ValidationError('Cannot trade from different wallet address');
    }

    const market = await Market.findOne({ marketId });
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    if (market.status !== 'active') {
      throw new ValidationError('Market is not active for trading');
    }

    if (market.expiresAt <= new Date()) {
      throw new ValidationError('Market has expired');
    }

    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Calculate expected price and slippage
      let expectedPrice, priceImpact, fees;

      if (market.metadata?.contractAddress) {
        const priceCalculation = await sorobanService.calculateTradePrice(
          market.metadata.contractAddress,
          tokenType,
          tradeType,
          amount
        );
        expectedPrice = priceCalculation.price;
        priceImpact = priceCalculation.priceImpact;
        fees = priceCalculation.fees;
      } else {
        expectedPrice = tokenType === 'yes' ? market.currentYesPrice : market.currentNoPrice;
        priceImpact = 0.01;
        fees = amount * 0.005;
      }

      // Check slippage tolerance
      if (priceImpact > maxSlippage) {
        throw new ValidationError(`Price impact ${(priceImpact * 100).toFixed(2)}% exceeds maximum slippage ${(maxSlippage * 100).toFixed(2)}%`);
      }

      // --- Partial fill calculation ---
      // Available liquidity is the opposite-side reserve (what can be matched)
      const availableLiquidity = tokenType === 'yes'
        ? (market.noLiquidity || market.liquidity * (1 - market.currentYesPrice))
        : (market.yesLiquidity || market.liquidity * market.currentYesPrice);

      // Max fillable amount given current liquidity (cap at 30% of available to avoid draining)
      const maxFillable = availableLiquidity * 0.3;
      const filledAmount = Math.min(amount, maxFillable > 0 ? maxFillable : amount);
      const remainingAmount = parseFloat((amount - filledAmount).toFixed(7));
      const isPartial = remainingAmount > 0.000001; // threshold to avoid float noise
      const fillRatio = filledAmount / amount;

      const effectiveAmount = filledAmount;
      const totalCost = tradeType === 'buy' ? effectiveAmount * expectedPrice : effectiveAmount;
      const platformFee = totalCost * (market.platformFee || 0.005);

      // Create trade record
      const trade = new Trade({
        tradeId,
        marketId,
        userWalletAddress: req.user.walletAddress,
        tradeType,
        tokenType,
        amount: effectiveAmount,
        price: expectedPrice,
        totalCost,
        fees: {
          platformFee,
          stellarFee: 0.00001,
          total: platformFee + 0.00001
        },
        slippage: {
          expected: maxSlippage,
          actual: priceImpact
        },
        marketPrices: {
          yesPriceBefore: market.currentYesPrice,
          noPriceBefore: market.currentNoPrice
        },
        partialFill: {
          isPartial,
          filledAmount,
          remainingAmount,
          fillRatio
        },
        status: 'pending'
      });

      await trade.save();

      // Execute trade on Stellar/Soroban
      let stellarResult;

      if (market.metadata?.contractAddress) {
        stellarResult = await sorobanService.executeTrade(
          stellarService.adminKeypair,
          market.metadata.contractAddress,
          {
            tokenType,
            tradeType,
            amount: effectiveAmount,
            maxSlippage,
            deadline: Math.floor(Date.now() / 1000) + 300
          }
        );
      } else {
        const asset = tokenType === 'yes'
          ? new stellarService.Asset(market.yesTokenAssetCode, market.yesTokenIssuer)
          : new stellarService.Asset(market.noTokenAssetCode, market.noTokenIssuer);

        stellarResult = await stellarService.placeOrder(
          stellarService.adminKeypair,
          tradeType === 'buy' ? stellarService.Asset.native() : asset,
          tradeType === 'buy' ? asset : stellarService.Asset.native(),
          effectiveAmount,
          expectedPrice
        );
      }

      trade.stellarTransactionHash = stellarResult.hash || stellarResult.transactionHash;
      trade.status = isPartial ? 'partially_filled' : 'confirmed';

      const newYesPrice = tokenType === 'yes' && tradeType === 'buy'
        ? Math.min(0.99, market.currentYesPrice + priceImpact * fillRatio)
        : market.currentYesPrice;
      const newNoPrice = 1.0 - newYesPrice;

      market.updatePrices(newYesPrice, newNoPrice);
      market.addTrade(totalCost);

      trade.marketPrices.yesPriceAfter = newYesPrice;
      trade.marketPrices.noPriceAfter = newNoPrice;

      await Promise.all([trade.save(), market.save()]);

      // Update or create user position
      let position = await Position.findOne({
        marketId,
        userWalletAddress: req.user.walletAddress,
        tokenType,
        status: 'active'
      });

      if (!position) {
        position = new Position({
          marketId,
          userWalletAddress: req.user.walletAddress,
          tokenType,
          totalShares: 0,
          averageEntryPrice: 0,
          totalCostBasis: 0
        });
      }

      position.addTrade(trade);
      await position.save();

      const user = await User.findOne({ walletAddress: req.user.walletAddress });
      if (user) {
        user.updateStats(trade);
        await user.save();
      }

      logger.trade('Trade executed', {
        tradeId,
        marketId,
        user: req.user.walletAddress,
        tokenType,
        tradeType,
        requestedAmount: amount,
        filledAmount,
        remainingAmount,
        isPartial,
        price: expectedPrice,
        txHash: stellarResult.hash || stellarResult.transactionHash
      });

      const message = isPartial
        ? `Order partially filled: ${filledAmount.toFixed(4)} of ${amount} filled. ${remainingAmount.toFixed(4)} remaining due to insufficient liquidity.`
        : 'Trade executed successfully';

      res.status(201).json({
        success: true,
        data: {
          trade: {
            tradeId,
            marketId,
            tokenType,
            tradeType,
            requestedAmount: amount,
            filledAmount,
            remainingAmount,
            isPartial,
            fillRatio,
            executedPrice: expectedPrice,
            totalCost,
            fees: trade.fees,
            slippage: priceImpact,
            transactionHash: trade.stellarTransactionHash,
            status: trade.status,
            timestamp: trade.timestamp
          },
          newMarketPrices: {
            yes: newYesPrice,
            no: newNoPrice
          },
          userPosition: {
            totalShares: position.totalShares,
            averageEntryPrice: position.averageEntryPrice,
            unrealizedPnL: position.unrealizedPnL
          }
        },
        message
      });
    } catch (error) {
      await Trade.updateOne(
        { tradeId },
        { status: 'failed', 'metadata.failureReason': error.message }
      );
      logger.error('Trade execution failed:', error);
      throw new StellarError(`Trade execution failed: ${error.message}`);
    }
  }

  // Get user's trade history
  static async getTradeHistory(req, res) {
    const {
      marketId,
      tokenType,
      tradeType,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const filter = {
      userWalletAddress: req.user.walletAddress,
      status: 'confirmed'
    };

    if (marketId) filter.marketId = marketId;
    if (tokenType) filter.tokenType = tokenType;
    if (tradeType) filter.tradeType = tradeType;
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [trades, total] = await Promise.all([
      Trade.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('marketId', 'question category')
        .lean(),
      Trade.countDocuments(filter)
    ]);

    // Calculate P&L for each trade
    const tradesWithPnL = await Promise.all(
      trades.map(async (trade) => {
        // Get current market price to calculate unrealized P&L
        const market = await Market.findOne({ marketId: trade.marketId });
        const currentPrice = trade.tokenType === 'yes' 
          ? market?.currentYesPrice || 0.5 
          : market?.currentNoPrice || 0.5;

        const pnl = trade.calculatePnL(currentPrice);

        return {
          ...trade,
          currentPnL: pnl
        };
      })
    );

    res.json({
      success: true,
      data: {
        trades: tradesWithPnL,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      }
    });
  }

  // Get recent trades across all markets
  static async getRecentTrades(req, res) {
    const { limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const trades = await Trade.find({
      status: 'confirmed'
    })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('marketId', 'question category')
      .lean();

    res.json({
      success: true,
      data: { trades }
    });
  }

  // Get trade by ID
  static async getTradeById(req, res) {
    const { tradeId } = req.params;

    const trade = await Trade.findOne({ tradeId }).lean();
    if (!trade) {
      throw new NotFoundError('Trade not found');
    }

    // Only allow users to view their own trades or make trades public
    if (trade.userWalletAddress !== req.user.walletAddress) {
      // Remove sensitive information for other users' trades
      delete trade.userWalletAddress;
      delete trade.metadata;
    }

    res.json({
      success: true,
      data: trade
    });
  }

  // Calculate trade price before execution
  // Calculate swap output with slippage protection
  static async calculateSwapOutput(req, res) {
    try {
      const { tokenIn, tokenOut, amountIn, slippageTolerance = 0.5 } = req.body;

      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: tokenIn, tokenOut, amountIn'
        });
      }

      if (amountIn <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      const sorobanService = req.app.get('sorobanService');
      const swapData = await sorobanService.calculateSwapOutput(
        tokenIn, 
        tokenOut, 
        parseFloat(amountIn), 
        parseFloat(slippageTolerance)
      );

      res.json({
        success: true,
        data: {
          expectedOutput: swapData.amountOut,
          minimumOutput: swapData.minimumOutput,
          priceImpact: swapData.priceImpact,
          fee: swapData.fee,
          isHighImpact: swapData.isHighImpact,
          effectivePrice: swapData.effectivePrice,
          slippageTolerance: parseFloat(slippageTolerance)
        }
      });
    } catch (error) {
      logger.error('Error calculating swap output:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to calculate swap output'
      });
    }
  }

  static async calculateTradePrice(req, res) {
    const {
      marketId,
      tokenType,
      tradeType,
      amount
    } = req.body;

    const market = await Market.findOne({ marketId });
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    let calculation;
    
    if (market.metadata?.contractAddress) {
      // Use Soroban contract for accurate price calculation
      calculation = await sorobanService.calculateTradePrice(
        market.metadata.contractAddress,
        tokenType,
        tradeType,
        amount
      );
    } else {
      // Basic AMM calculation
      const currentPrice = tokenType === 'yes' ? market.currentYesPrice : market.currentNoPrice;
      const priceImpact = Math.min(0.1, amount / (market.totalVolume || 1000) * 0.5);
      
      const newPrice = tradeType === 'buy' 
        ? currentPrice + priceImpact 
        : currentPrice - priceImpact;

      calculation = {
        price: Math.max(0.01, Math.min(0.99, newPrice)),
        priceImpact,
        fees: amount * 0.005,
        amountOut: amount
      };
    }

    res.json({
      success: true,
      data: {
        marketId,
        tokenType,
        tradeType,
        amount,
        calculation
      }
    });
  }

  // Get pending trades for user
  static async getPendingTrades(req, res) {
    const trades = await Trade.find({
      userWalletAddress: req.user.walletAddress,
      status: 'pending',
      timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) } // Last 10 minutes
    })
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      success: true,
      data: { trades }
    });
  }
}

module.exports = TradeController;
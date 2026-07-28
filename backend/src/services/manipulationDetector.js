const { Trade, Alert, Market } = require('../models');
const logger = require('../config/logger');
const websocketHandler = require('./websocketHandler');
const circuitBreakerService = require('./circuitBreakerService');

class ManipulationDetector {
  /**
   * Scans a newly created trade for market manipulation behaviors
   * @param {Object} trade Mongoose Trade document (or raw trade data)
   */
  async scanTrade(trade) {
    try {
      const { marketId, userWalletAddress, amount, price, totalCost, tradeType, tokenType, tradeId } = trade;
      
      const alertsCreated = [];
      const wallet = userWalletAddress.toLowerCase();

      // Run parallel checks including new circuit breaker integration
      const [volumeAlert, washAlert, spamAlert, priceManipulationAlert, circuitBreakerCheck] = await Promise.all([
        this.checkVolumeSpike(marketId, totalCost, wallet, tradeId),
        this.checkWashTrading(marketId, wallet, tradeType, tokenType, tradeId),
        this.checkOrderSpam(marketId, wallet, tradeId),
        this.checkPriceManipulation(marketId, price, amount, tradeId),
        circuitBreakerService.checkTradeAllowed(marketId, wallet, totalCost, price)
      ]);

      if (volumeAlert) alertsCreated.push(volumeAlert);
      if (washAlert) alertsCreated.push(washAlert);
      if (spamAlert) alertsCreated.push(spamAlert);
      if (priceManipulationAlert) alertsCreated.push(priceManipulationAlert);

      // Check circuit breaker result
      if (!circuitBreakerCheck.allowed) {
        alertsCreated.push(await this.createAlert({
          marketId,
          userWalletAddress: wallet,
          alertType: 'circuit_breaker_blocked',
          severity: 'critical',
          details: {
            reason: circuitBreakerCheck.reason,
            tradeId,
            retryAfter: circuitBreakerCheck.retryAfter
          }
        }));
      }

      // Record trade in circuit breaker service
      await circuitBreakerService.recordTrade(marketId, wallet, totalCost, price, tokenType, tradeType);

      // Trigger WebSockets if alerts are raised
      if (alertsCreated.length > 0) {
        logger.warn(`Market manipulation alerts triggered for user ${wallet} on market ${marketId}`, {
          alertTypes: alertsCreated.map(a => a.alertType),
          tradeId
        });

        // Broadcast to admin space
        try {
          if (websocketHandler.io) {
            websocketHandler.io.emit('admin_alert', {
              success: true,
              alerts: alertsCreated,
              tradeId,
              marketId
            });
          }
        } catch (wsError) {
          logger.error('Failed to broadcast admin WebSocket alert:', wsError);
        }
      }

      return alertsCreated;
    } catch (error) {
      logger.error('Error scanning trade for manipulation:', error);
      return [];
    }
  }

  /**
   * Rule 1: Detect volume spikes exceeding 500% (5x) of average trade volume
   */
  async checkVolumeSpike(marketId, totalCost, wallet, tradeId) {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Get all confirmed trades in the last 24h
      const recentTrades = await Trade.find({
        marketId,
        status: 'confirmed',
        timestamp: { $gte: twentyFourHoursAgo },
        tradeId: { $ne: tradeId }
      }).select('totalCost');

      // Absolute threshold fallback: trades over 10,000 USDC always flagged
      if (totalCost >= 10000) {
        return await this.createAlert({
          marketId,
          userWalletAddress: wallet,
          alertType: 'volume_spike',
          severity: 'high',
          details: {
            reason: 'Trade size exceeded high-volume absolute threshold',
            tradeCost: totalCost,
            threshold: 10000
          }
        });
      }

      if (recentTrades.length >= 5) {
        const sum = recentTrades.reduce((acc, t) => acc + t.totalCost, 0);
        const average = sum / recentTrades.length;
        const ratio = totalCost / average;

        if (ratio >= 5.0) { // 500% of average
          return await this.createAlert({
            marketId,
            userWalletAddress: wallet,
            alertType: 'volume_spike',
            severity: 'medium',
            details: {
              reason: 'Trade size exceeded 500% of 24h average trade size',
              tradeCost: totalCost,
              average24h: average,
              multiplier: ratio.toFixed(2)
            }
          });
        }
      }
      return null;
    } catch (error) {
      logger.error('Volume spike detection error:', error);
      return null;
    }
  }

  /**
   * Rule 2: Detect wash trading (opposing transactions within a 5-minute window)
   */
  async checkWashTrading(marketId, wallet, tradeType, tokenType, tradeId) {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Find any confirmed opposing trade from the same user
      // E.g. BUY YES followed by SELL YES, or BUY YES followed by BUY NO (hedging price distortion)
      const opposingTrade = await Trade.findOne({
        marketId,
        userWalletAddress: wallet,
        status: 'confirmed',
        timestamp: { $gte: fiveMinutesAgo },
        tradeId: { $ne: tradeId },
        $or: [
          { tradeType: tradeType === 'buy' ? 'sell' : 'buy', tokenType },
          { tradeType: 'buy', tokenType: tokenType === 'yes' ? 'no' : 'yes' }
        ]
      }).sort({ timestamp: -1 });

      if (opposingTrade) {
        return await this.createAlert({
          marketId,
          userWalletAddress: wallet,
          alertType: 'wash_trading',
          severity: 'high',
          details: {
            reason: 'Opposing trade detected within a 5-minute window (Wash Trading / Spoofing)',
            currentTrade: { tradeType, tokenType, tradeId },
            previousTrade: { 
              tradeType: opposingTrade.tradeType, 
              tokenType: opposingTrade.tokenType, 
              tradeId: opposingTrade.tradeId,
              timeDifferenceSeconds: Math.floor((Date.now() - opposingTrade.timestamp) / 1000)
            }
          }
        });
      }
      return null;
    } catch (error) {
      logger.error('Wash trading detection error:', error);
      return null;
    }
  }

  /**
   * Rule 3: Detect order spamming (>= 5 trades in a 60-second window)
   */
  async checkOrderSpam(marketId, wallet, tradeId) {
    try {
      const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);

      const recentTradesCount = await Trade.countDocuments({
        marketId,
        userWalletAddress: wallet,
        status: 'confirmed',
        timestamp: { $gte: sixtySecondsAgo },
        tradeId: { $ne: tradeId }
      });

      if (recentTradesCount >= 4) { // Including the current trade, this makes it >= 5
        return await this.createAlert({
          marketId,
          userWalletAddress: wallet,
          alertType: 'order_spam',
          severity: 'medium',
          details: {
            reason: 'Excessive rapid order placement (High-frequency spam)',
            tradesCountLastMinute: recentTradesCount + 1,
            timeWindow: '60s'
          }
        });
      }
      return null;
    } catch (error) {
      logger.error('Order spam detection error:', error);
      return null;
    }
  }

  /**
   * Rule 4: Detect price manipulation through unusual price movements
   */
  async checkPriceManipulation(marketId, price, amount, tradeId) {
    try {
      const market = await Market.findOne({ marketId });
      if (!market) return null;

      // Check for significant price movement (> 5% in single trade)
      const currentYesPrice = market.currentYesPrice || 0.5;
      const priceImpact = Math.abs(price - currentYesPrice) / currentYesPrice;

      if (priceImpact > 0.05) { // 5% price impact
        return await this.createAlert({
          marketId,
          userWalletAddress: null,
          alertType: 'price_manipulation',
          severity: 'high',
          details: {
            reason: 'Significant price movement detected in single trade',
            priceImpact: (priceImpact * 100).toFixed(2) + '%',
            tradeAmount: amount,
            tradeId
          }
        });
      }

      return null;
    } catch (error) {
      logger.error('Price manipulation detection error:', error);
      return null;
    }
  }

  /**
   * Private helper to create an alert record
   */
  async createAlert(alertData) {
    try {
      const alert = new Alert(alertData);
      await alert.save();
      logger.info(`Alert created: ${alert.alertType} - Severity: ${alert.severity}`);
      return alert;
    } catch (error) {
      logger.error('Failed to save Admin Alert in DB:', error);
      return null;
    }
  }
}

module.exports = new ManipulationDetector();

const logger = require('../config/logger');
const { Trade, Market, Alert } = require('../models');
const websocketHandler = require('./websocketHandler');

/**
 * Circuit Breaker Service
 * Implements protocol-level safeguards against abnormal market activity.
 * Monitors price deviations, volume spikes, liquidity imbalances, and
 * triggers circuit breakers when thresholds are exceeded.
 */
class CircuitBreakerService {
  constructor() {
    // Configuration thresholds
    this.config = {
      // Price deviation: 10% triggers circuit breaker
      priceDeviationThreshold: 0.10,
      // Cooldown period after circuit breaker: 5 minutes
      cooldownPeriodMs: 5 * 60 * 1000,
      // Volume spike: 5x average triggers alert
      volumeSpikeMultiplier: 5,
      // Liquidity imbalance: 30% ratio triggers alert
      liquidityImbalanceThreshold: 0.30,
      // Max trade size: 5% of pool reserves
      maxTradeSizePercentage: 0.05,
      // Max drawdown: 20% triggers emergency pause
      maxDrawdownThreshold: 0.20,
      // Rolling window for dynamic limits: 1 hour
      dynamicLimitWindowMs: 60 * 60 * 1000,
      // Max trades per window per user
      maxTradesPerWindow: 100,
      // Price history length for analysis
      priceHistoryLength: 100,
    };

    // In-memory state for circuit breaker tracking
    this.poolStates = new Map(); // poolId -> CircuitBreakerState
    this.priceHistory = new Map(); // poolId -> [{price, timestamp}]
    this.volumeHistory = new Map(); // poolId -> [{volume, timestamp}]
    this.tradeWindows = new Map(); // `${poolId}:${wallet}` -> {trades, windowStart}

    // Start periodic monitoring
    this._startPeriodicMonitoring();

    logger.info('Circuit Breaker Service initialized');
  }

  /**
   * Get or initialize circuit breaker state for a pool
   */
  getPoolState(poolId) {
    if (!this.poolStates.has(poolId)) {
      this.poolStates.set(poolId, {
        isTriggered: false,
        triggeredAt: 0,
        cooldownEnd: 0,
        triggerCount: 0,
        lastPrice: 0,
        peakPrice: 0,
        emergencyPaused: false,
        liquidityImbalanced: false,
        currentDrawdownBps: 0,
      });
    }
    return this.poolStates.get(poolId);
  }

  /**
   * Check if a trade should be allowed based on circuit breaker state
   * @param {string} poolId - Pool identifier
   * @param {string} walletAddress - Trader's wallet address
   * @param {number} tradeSize - Trade size in USDC
   * @param {number} currentPrice - Current pool price
   * @returns {Object} {allowed, reason, retryAfter}
   */
  async checkTradeAllowed(poolId, walletAddress, tradeSize, currentPrice) {
    const state = this.getPoolState(poolId);

    // Check emergency pause
    if (state.emergencyPaused) {
      return {
        allowed: false,
        reason: 'Emergency pause is active for this pool',
        retryAfter: null,
      };
    }

    // Check circuit breaker cooldown
    if (state.isTriggered) {
      const now = Date.now();
      if (now < state.cooldownEnd) {
        const retryAfterMs = state.cooldownEnd - now;
        return {
          allowed: false,
          reason: `Circuit breaker triggered. Retry after ${Math.ceil(retryAfterMs / 1000)}s`,
          retryAfter: Math.ceil(retryAfterMs / 1000),
        };
      }
      // Cooldown expired, reset circuit breaker
      state.isTriggered = false;
      state.cooldownEnd = 0;
      logger.info(`Circuit breaker cooldown expired for pool ${poolId}`);
    }

    // Check price deviation
    const priceDeviationCheck = this._checkPriceDeviation(poolId, currentPrice);
    if (!priceDeviationCheck.allowed) {
      this._triggerCircuitBreaker(poolId, 'price_deviation', priceDeviationCheck.deviation);
      return {
        allowed: false,
        reason: priceDeviationCheck.reason,
        retryAfter: Math.ceil(this.config.cooldownPeriodMs / 1000),
      };
    }

    // Check max trade size
    const tradeSizeCheck = await this._checkTradeSize(poolId, tradeSize);
    if (!tradeSizeCheck.allowed) {
      return {
        allowed: false,
        reason: tradeSizeCheck.reason,
        retryAfter: null,
      };
    }

    // Check dynamic trading limits
    const tradingLimitsCheck = this._checkTradingLimits(poolId, walletAddress);
    if (!tradingLimitsCheck.allowed) {
      return {
        allowed: false,
        reason: tradingLimitsCheck.reason,
        retryAfter: tradingLimitsCheck.retryAfter,
      };
    }

    // Check volume spike
    const volumeSpikeCheck = await this._checkVolumeSpike(poolId, tradeSize);
    if (volumeSpikeCheck.isSpike) {
      logger.warn(`Volume spike detected for pool ${poolId}`, volumeSpikeCheck);
      // Don't block, just alert
    }

    return { allowed: true, reason: null, retryAfter: null };
  }

  /**
   * Record a completed trade and update circuit breaker state
   */
  async recordTrade(poolId, walletAddress, tradeSize, price, tokenType, tradeType) {
    const state = this.getPoolState(poolId);

    // Update price history
    this._recordPrice(poolId, price);

    // Update volume history
    this._recordVolume(poolId, tradeSize);

    // Update trade window
    this._recordTradeInWindow(poolId, walletAddress);

    // Update peak price
    if (price > state.peakPrice) {
      state.peakPrice = price;
    }

    // Check for drawdown
    this._checkDrawdown(poolId, price);

    // Check liquidity imbalance
    await this._checkLiquidityImbalance(poolId);

    return state;
  }

  /**
   * Trigger circuit breaker for a pool
   */
  _triggerCircuitBreaker(poolId, reason, deviation) {
    const state = this.getPoolState(poolId);
    state.isTriggered = true;
    state.triggeredAt = Date.now();
    state.cooldownEnd = Date.now() + this.config.cooldownPeriodMs;
    state.triggerCount += 1;

    logger.warn(`Circuit breaker triggered for pool ${poolId}`, {
      reason,
      deviation,
      triggerCount: state.triggerCount,
      cooldownEnd: new Date(state.cooldownEnd).toISOString(),
    });

    // Create alert
    this._createAlert({
      poolId,
      alertType: 'circuit_breaker_triggered',
      severity: 'critical',
      details: {
        reason,
        deviation,
        triggerCount: state.triggerCount,
        cooldownEnd: state.cooldownEnd,
      },
    });

    // Broadcast via WebSocket
    this._broadcastAlert({
      type: 'circuit_breaker',
      poolId,
      isTriggered: true,
      reason,
      deviation,
      cooldownEnd: state.cooldownEnd,
    });
  }

  /**
   * Manipulation-resistant reference price for a pool, derived from the recent
   * average of recorded trade prices. Used by tradeGuardService (#242) to bound
   * how far a fill price may deviate from recent trading and to detect a stale
   * reference. Returns null when there is not enough history to be trustworthy.
   *
   * @param {string} poolId
   * @param {number} [sampleSize=20] number of most-recent prices to average
   * @returns {{price:number, sampleCount:number, ageMs:number}|null}
   */
  getReferencePrice(poolId, sampleSize = 20) {
    const history = this.priceHistory.get(poolId) || [];
    if (history.length === 0) {
      return null;
    }

    const recent = history.slice(-sampleSize);
    const price = recent.reduce((sum, p) => sum + p.price, 0) / recent.length;
    const newestTs = recent[recent.length - 1].timestamp;

    return {
      price,
      sampleCount: recent.length,
      ageMs: Math.max(0, Date.now() - newestTs)
    };
  }

  /**
   * Check price deviation from recent history
   */
  _checkPriceDeviation(poolId, currentPrice) {
    const history = this.priceHistory.get(poolId) || [];
    if (history.length < 2) {
      return { allowed: true, deviation: 0 };
    }

    // Use weighted average of recent prices
    const recentPrices = history.slice(-20);
    const avgPrice = recentPrices.reduce((sum, p) => sum + p.price, 0) / recentPrices.length;

    const deviation = Math.abs(currentPrice - avgPrice) / avgPrice;

    if (deviation >= this.config.priceDeviationThreshold) {
      return {
        allowed: false,
        deviation,
        reason: `Price deviation ${(deviation * 100).toFixed(2)}% exceeds threshold ${(this.config.priceDeviationThreshold * 100)}%`,
      };
    }

    return { allowed: true, deviation };
  }

  /**
   * Check if trade size is within limits
   */
  async _checkTradeSize(poolId, tradeSize) {
    try {
      const market = await Market.findOne({ marketId: poolId });
      if (!market) {
        return { allowed: true };
      }

      const totalLiquidity = market.totalVolume || market.liquidity || 0;
      const maxSize = totalLiquidity * this.config.maxTradeSizePercentage;

      if (tradeSize > maxSize && maxSize > 0) {
        return {
          allowed: false,
          reason: `Trade size $${tradeSize.toFixed(2)} exceeds maximum allowed $${maxSize.toFixed(2)} (5% of pool reserves)`,
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('Error checking trade size:', error);
      return { allowed: true };
    }
  }

  /**
   * Check dynamic trading limits per user
   */
  _checkTradingLimits(poolId, walletAddress) {
    const key = `${poolId}:${walletAddress.toLowerCase()}`;
    const now = Date.now();

    if (!this.tradeWindows.has(key)) {
      this.tradeWindows.set(key, {
        trades: [],
        windowStart: now,
      });
      return { allowed: true };
    }

    const window = this.tradeWindows.get(key);

    // Reset window if expired
    if (now >= window.windowStart + this.config.dynamicLimitWindowMs) {
      window.trades = [];
      window.windowStart = now;
      return { allowed: true };
    }

    // Check trade count
    if (window.trades.length >= this.config.maxTradesPerWindow) {
      const retryAfterMs = window.windowStart + this.config.dynamicLimitWindowMs - now;
      return {
        allowed: false,
        reason: `Trading limit exceeded. Max ${this.config.maxTradesPerWindow} trades per hour`,
        retryAfter: Math.ceil(retryAfterMs / 1000),
      };
    }

    return { allowed: true };
  }

  /**
   * Record price in history
   */
  _recordPrice(poolId, price) {
    if (!this.priceHistory.has(poolId)) {
      this.priceHistory.set(poolId, []);
    }

    const history = this.priceHistory.get(poolId);
    history.push({ price, timestamp: Date.now() });

    // Keep only recent history
    if (history.length > this.config.priceHistoryLength) {
      history.splice(0, history.length - this.config.priceHistoryLength);
    }
  }

  /**
   * Record volume in history
   */
  _recordVolume(poolId, volume) {
    if (!this.volumeHistory.has(poolId)) {
      this.volumeHistory.set(poolId, []);
    }

    const history = this.volumeHistory.get(poolId);
    history.push({ volume, timestamp: Date.now() });

    // Keep only recent history (last 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.volumeHistory.set(
      poolId,
      history.filter((v) => v.timestamp >= oneDayAgo)
    );
  }

  /**
   * Record trade in user's window
   */
  _recordTradeInWindow(poolId, walletAddress) {
    const key = `${poolId}:${walletAddress.toLowerCase()}`;
    const now = Date.now();

    if (!this.tradeWindows.has(key)) {
      this.tradeWindows.set(key, {
        trades: [],
        windowStart: now,
      });
    }

    const window = this.tradeWindows.get(key);
    window.trades.push({ timestamp: now });
  }

  /**
   * Check for volume spikes
   */
  async _checkVolumeSpike(poolId, tradeSize) {
    const history = this.volumeHistory.get(poolId) || [];
    if (history.length < 5) {
      return { isSpike: false };
    }

    const avgVolume = history.reduce((sum, v) => sum + v.volume, 0) / history.length;
    const ratio = tradeSize / avgVolume;

    return {
      isSpike: ratio >= this.config.volumeSpikeMultiplier,
      ratio,
      avgVolume,
      tradeSize,
    };
  }

  /**
   * Check for drawdown from peak price
   */
  _checkDrawdown(poolId, currentPrice) {
    const state = this.getPoolState(poolId);

    if (state.peakPrice === 0) {
      state.peakPrice = currentPrice;
      return;
    }

    if (currentPrice > state.peakPrice) {
      state.peakPrice = currentPrice;
    }

    const drawdown = (state.peakPrice - currentPrice) / state.peakPrice;
    state.currentDrawdownBps = Math.floor(drawdown * 10000);

    if (drawdown >= this.config.maxDrawdownThreshold) {
      this._triggerEmergencyPause(poolId, `Max drawdown ${(drawdown * 100).toFixed(2)}% exceeded`);
    }
  }

  /**
   * Check liquidity imbalance
   */
  async _checkLiquidityImbalance(poolId) {
    try {
      const market = await Market.findOne({ marketId: poolId });
      if (!market) return;

      const yesLiquidity = market.yesLiquidity || 0;
      const noLiquidity = market.noLiquidity || 0;
      const total = yesLiquidity + noLiquidity;

      if (total === 0) return;

      const imbalance = Math.abs(yesLiquidity - noLiquidity) / total;
      const state = this.getPoolState(poolId);

      state.liquidityImbalanced = imbalance >= this.config.liquidityImbalanceThreshold;

      if (state.liquidityImbalanced) {
        logger.warn(`Liquidity imbalance detected for pool ${poolId}`, {
          imbalance,
          yesLiquidity,
          noLiquidity,
        });

        this._createAlert({
          poolId,
          alertType: 'liquidity_imbalance',
          severity: 'high',
          details: {
            imbalance,
            yesLiquidity,
            noLiquidity,
          },
        });
      }
    } catch (error) {
      logger.error('Error checking liquidity imbalance:', error);
    }
  }

  /**
   * Trigger emergency pause
   */
  _triggerEmergencyPause(poolId, reason) {
    const state = this.getPoolState(poolId);
    state.emergencyPaused = true;

    logger.error(`Emergency pause triggered for pool ${poolId}`, { reason });

    this._createAlert({
      poolId,
      alertType: 'emergency_pause',
      severity: 'critical',
      details: { reason },
    });

    this._broadcastAlert({
      type: 'emergency_pause',
      poolId,
      reason,
    });
  }

  /**
   * Create alert record
   */
  async _createAlert(alertData) {
    try {
      const alert = new Alert(alertData);
      await alert.save();
      return alert;
    } catch (error) {
      logger.error('Failed to create circuit breaker alert:', error);
      return null;
    }
  }

  /**
   * Broadcast alert via WebSocket
   */
  _broadcastAlert(data) {
    try {
      if (websocketHandler.io) {
        websocketHandler.io.emit('risk_alert', {
          success: true,
          ...data,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      logger.error('Failed to broadcast risk alert:', error);
    }
  }

  /**
   * Start periodic monitoring tasks
   */
  _startPeriodicMonitoring() {
    // Clean up expired trade windows every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, window] of this.tradeWindows.entries()) {
        if (now >= window.windowStart + this.config.dynamicLimitWindowMs) {
          this.tradeWindows.delete(key);
        }
      }
    }, 5 * 60 * 1000);

    // Monitor circuit breaker cooldowns every minute
    setInterval(() => {
      const now = Date.now();
      for (const [poolId, state] of this.poolStates.entries()) {
        if (state.isTriggered && now >= state.cooldownEnd) {
          state.isTriggered = false;
          state.cooldownEnd = 0;
          logger.info(`Circuit breaker cooldown expired for pool ${poolId}`);
        }
      }
    }, 60 * 1000);
  }

  /**
   * Get circuit breaker status for a pool
   */
  getStatus(poolId) {
    const state = this.getPoolState(poolId);
    const priceHistory = this.priceHistory.get(poolId) || [];
    const volumeHistory = this.volumeHistory.get(poolId) || [];

    return {
      poolId,
      circuitBreaker: {
        isTriggered: state.isTriggered,
        triggeredAt: state.triggeredAt,
        cooldownEnd: state.cooldownEnd,
        triggerCount: state.triggerCount,
        lastPrice: state.lastPrice,
        peakPrice: state.peakPrice,
      },
      liquidityImbalance: {
        isImbalanced: state.liquidityImbalanced,
      },
      tradingLimits: {
        currentDrawdownBps: state.currentDrawdownBps,
      },
      emergencyPaused: state.emergencyPaused,
      priceHistoryLength: priceHistory.length,
      volumeHistoryLength: volumeHistory.length,
    };
  }

  /**
   * Manually reset circuit breaker for a pool (admin only)
   */
  resetCircuitBreaker(poolId) {
    const state = this.getPoolState(poolId);
    state.isTriggered = false;
    state.cooldownEnd = 0;
    logger.info(`Circuit breaker manually reset for pool ${poolId}`);
    return state;
  }

  /**
   * Manually trigger emergency pause (admin only)
   */
  triggerEmergencyPause(poolId, reason) {
    this._triggerEmergencyPause(poolId, reason);
    return this.getPoolState(poolId);
  }

  /**
   * Manually reset emergency pause (admin only)
   */
  resetEmergencyPause(poolId) {
    const state = this.getPoolState(poolId);
    state.emergencyPaused = false;
    logger.info(`Emergency pause manually reset for pool ${poolId}`);
    return state;
  }
}

module.exports = new CircuitBreakerService();

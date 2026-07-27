const circuitBreakerService = require('../../../src/services/circuitBreakerService');

describe('CircuitBreakerService', () => {
  beforeEach(() => {
    // Clear all state before each test
    circuitBreakerService.poolStates.clear();
    circuitBreakerService.priceHistory.clear();
    circuitBreakerService.volumeHistory.clear();
    circuitBreakerService.tradeWindows.clear();
  });

  describe('getPoolState', () => {
    it('should initialize default state for new pool', () => {
      const state = circuitBreakerService.getPoolState('pool-1');
      expect(state).toEqual({
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
    });

    it('should return existing state for known pool', () => {
      circuitBreakerService.poolStates.set('pool-1', {
        isTriggered: true,
        triggerCount: 5,
      });
      const state = circuitBreakerService.getPoolState('pool-1');
      expect(state.isTriggered).toBe(true);
      expect(state.triggerCount).toBe(5);
    });
  });

  describe('checkTradeAllowed', () => {
    it('should allow trade when no restrictions', async () => {
      const result = await circuitBreakerService.checkTradeAllowed(
        'pool-1',
        'wallet-1',
        1000,
        0.5
      );
      expect(result.allowed).toBe(true);
    });

    it('should block trade when emergency paused', async () => {
      circuitBreakerService.poolStates.set('pool-1', {
        emergencyPaused: true,
      });
      const result = await circuitBreakerService.checkTradeAllowed(
        'pool-1',
        'wallet-1',
        1000,
        0.5
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Emergency pause');
    });

    it('should block trade when circuit breaker triggered and cooldown active', async () => {
      const now = Date.now();
      circuitBreakerService.poolStates.set('pool-1', {
        isTriggered: true,
        cooldownEnd: now + 60000, // 1 minute from now
      });
      const result = await circuitBreakerService.checkTradeAllowed(
        'pool-1',
        'wallet-1',
        1000,
        0.5
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Circuit breaker triggered');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reset circuit breaker after cooldown expires', async () => {
      const past = Date.now() - 1000;
      circuitBreakerService.poolStates.set('pool-1', {
        isTriggered: true,
        cooldownEnd: past,
      });
      const result = await circuitBreakerService.checkTradeAllowed(
        'pool-1',
        'wallet-1',
        1000,
        0.5
      );
      expect(result.allowed).toBe(true);
      const state = circuitBreakerService.getPoolState('pool-1');
      expect(state.isTriggered).toBe(false);
    });

    it('should enforce dynamic trading limits', async () => {
      // Set up window with max trades
      const key = 'pool-1:wallet-1';
      circuitBreakerService.tradeWindows.set(key, {
        trades: Array(100).fill({ timestamp: Date.now() }),
        windowStart: Date.now(),
      });

      const result = await circuitBreakerService.checkTradeAllowed(
        'pool-1',
        'wallet-1',
        1000,
        0.5
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Trading limit exceeded');
    });
  });

  describe('recordTrade', () => {
    it('should record price in history', async () => {
      await circuitBreakerService.recordTrade('pool-1', 'wallet-1', 1000, 0.5, 'yes', 'buy');
      const history = circuitBreakerService.priceHistory.get('pool-1');
      expect(history).toHaveLength(1);
      expect(history[0].price).toBe(0.5);
    });

    it('should update peak price', async () => {
      circuitBreakerService.poolStates.set('pool-1', { peakPrice: 0.4 });
      await circuitBreakerService.recordTrade('pool-1', 'wallet-1', 1000, 0.6, 'yes', 'buy');
      const state = circuitBreakerService.getPoolState('pool-1');
      expect(state.peakPrice).toBe(0.6);
    });

    it('should record trade in window', async () => {
      await circuitBreakerService.recordTrade('pool-1', 'wallet-1', 1000, 0.5, 'yes', 'buy');
      const key = 'pool-1:wallet-1';
      const window = circuitBreakerService.tradeWindows.get(key);
      expect(window).toBeDefined();
      expect(window.trades).toHaveLength(1);
    });
  });

  describe('_checkPriceDeviation', () => {
    it('should return allowed when price history is insufficient', () => {
      circuitBreakerService.priceHistory.set('pool-1', []);
      const result = circuitBreakerService._checkPriceDeviation('pool-1', 0.5);
      expect(result.allowed).toBe(true);
    });

    it('should detect price deviation above threshold', () => {
      // Set up price history with stable price
      const history = Array(20).fill(null).map((_, i) => ({
        price: 0.5,
        timestamp: Date.now() - (20 - i) * 1000,
      }));
      circuitBreakerService.priceHistory.set('pool-1', history);

      // Check with 15% deviation (above 10% threshold)
      const result = circuitBreakerService._checkPriceDeviation('pool-1', 0.575);
      expect(result.allowed).toBe(false);
      expect(result.deviation).toBeGreaterThan(0.1);
    });

    it('should allow trade when price deviation is within threshold', () => {
      const history = Array(20).fill(null).map((_, i) => ({
        price: 0.5,
        timestamp: Date.now() - (20 - i) * 1000,
      }));
      circuitBreakerService.priceHistory.set('pool-1', history);

      // Check with 5% deviation (below 10% threshold)
      const result = circuitBreakerService._checkPriceDeviation('pool-1', 0.525);
      expect(result.allowed).toBe(true);
    });
  });

  describe('_checkTradingLimits', () => {
    it('should allow trade when within limits', () => {
      const result = circuitBreakerService._checkTradingLimits('pool-1', 'wallet-1');
      expect(result.allowed).toBe(true);
    });

    it('should block trade when exceeding max trades per window', () => {
      const key = 'pool-1:wallet-1';
      circuitBreakerService.tradeWindows.set(key, {
        trades: Array(100).fill({ timestamp: Date.now() }),
        windowStart: Date.now(),
      });

      const result = circuitBreakerService._checkTradingLimits('pool-1', 'wallet-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Trading limit exceeded');
    });

    it('should reset window after expiry', () => {
      const key = 'pool-1:wallet-1';
      circuitBreakerService.tradeWindows.set(key, {
        trades: Array(100).fill({ timestamp: Date.now() }),
        windowStart: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      });

      const result = circuitBreakerService._checkTradingLimits('pool-1', 'wallet-1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('resetCircuitBreaker', () => {
    it('should reset circuit breaker state', () => {
      circuitBreakerService.poolStates.set('pool-1', {
        isTriggered: true,
        cooldownEnd: Date.now() + 60000,
      });

      circuitBreakerService.resetCircuitBreaker('pool-1');
      const state = circuitBreakerService.getPoolState('pool-1');
      expect(state.isTriggered).toBe(false);
      expect(state.cooldownEnd).toBe(0);
    });
  });

  describe('triggerEmergencyPause', () => {
    it('should activate emergency pause', () => {
      circuitBreakerService.triggerEmergencyPause('pool-1', 'Test reason');
      const state = circuitBreakerService.getPoolState('pool-1');
      expect(state.emergencyPaused).toBe(true);
    });
  });

  describe('resetEmergencyPause', () => {
    it('should deactivate emergency pause', () => {
      circuitBreakerService.poolStates.set('pool-1', {
        emergencyPaused: true,
      });

      circuitBreakerService.resetEmergencyPause('pool-1');
      const state = circuitBreakerService.getPoolState('pool-1');
      expect(state.emergencyPaused).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive status', () => {
      circuitBreakerService.poolStates.set('pool-1', {
        isTriggered: true,
        triggerCount: 3,
        peakPrice: 0.8,
      });
      circuitBreakerService.priceHistory.set('pool-1', [
        { price: 0.5, timestamp: Date.now() },
      ]);

      const status = circuitBreakerService.getStatus('pool-1');
      expect(status.poolId).toBe('pool-1');
      expect(status.circuitBreaker.isTriggered).toBe(true);
      expect(status.circuitBreaker.triggerCount).toBe(3);
      expect(status.circuitBreaker.peakPrice).toBe(0.8);
      expect(status.priceHistoryLength).toBe(1);
    });
  });
});

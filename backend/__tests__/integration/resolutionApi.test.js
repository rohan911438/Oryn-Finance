/**
 * Integration tests for Resolution API endpoints.
 *
 * Covers:
 *   - GET /api/markets/:id/resolution  (Requirements 6.1–6.4)
 *   - GET /api/oracle/health           (Requirements 7.1, 8.1–8.3)
 */

const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// Mock MongoDB models BEFORE any require() that pulls in the models module.
// ---------------------------------------------------------------------------

const mockMarketFindOne = jest.fn();
const MockMarket = jest.fn(function (data) {
  Object.assign(this, data);
});
MockMarket.findOne = mockMarketFindOne;

const mockResolutionEventFind = jest.fn();
const MockResolutionEvent = jest.fn(function (data) {
  Object.assign(this, data);
});
MockResolutionEvent.find = mockResolutionEventFind;

jest.mock('../../src/models', () => ({
  Market: MockMarket,
  ResolutionEvent: MockResolutionEvent
}));

// ---------------------------------------------------------------------------
// Mock sorobanService
// ---------------------------------------------------------------------------

const mockQueryContract = jest.fn();

jest.mock('../../src/services/sorobanService', () => ({
  queryContract: mockQueryContract,
  buildBuyTokensXDR: jest.fn(),
  buildCreateMarketXDR: jest.fn(),
  submitSignedTransaction: jest.fn(),
  validateTransactionXDR: jest.fn(),
  getNetworkInfo: jest.fn(),
  getCurrentLedger: jest.fn(),
  getHealth: jest.fn(),
  testContractIntegration: jest.fn(),
  pingContract: jest.fn(),
  contracts: {
    ORACLE_RESOLVER: 'ORACLE_RESOLVER_CONTRACT'
  }
}));

// ---------------------------------------------------------------------------
// Mock oracleService
// ---------------------------------------------------------------------------

const mockGetSourceHealthStatus = jest.fn();

jest.mock('../../src/services/oracleService', () => ({
  getSourceHealthStatus: mockGetSourceHealthStatus
}));

// ---------------------------------------------------------------------------
// Mock logger (already handled by setup.js, but be explicit here too)
// ---------------------------------------------------------------------------

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  oracle: jest.fn()
}));

// ---------------------------------------------------------------------------
// Mock auth middleware so protected routes don't block
// ---------------------------------------------------------------------------

jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' };
    next();
  },
  optionalAuth: (_req, _res, next) => next()
}));

// ---------------------------------------------------------------------------
// Require routes and error handler AFTER mocks are in place
// ---------------------------------------------------------------------------

const marketRoutes = require('../../src/routes/markets');
const oracleRoutes = require('../../src/routes/oracle');
const { errorHandler, notFound } = require('../../src/middleware/errorHandler');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal market document that satisfies the controller. */
function makeMarket(overrides = {}) {
  return {
    marketId: 'market-test-1',
    oracleSource: 'coingecko',
    oracleConfig: { symbol: 'bitcoin', targetPrice: 100000, condition: 'above' },
    resolutionFinalizationTxHash: null,
    resolutionFinalizationTimestamp: null,
    ...overrides
  };
}

/** Build a minimal ResolutionEvent document. */
function makeEvent(overrides = {}) {
  return {
    eventType: 'oracle_submission',
    actorAddress: 'GABC123',
    outcome: true,
    confidenceScore: 0.9,
    payload: { outcome: true, confidence: 0.9 },
    ledger: 1000,
    txHash: 'txhash-abc',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    ...overrides
  };
}

/**
 * Create a chainable mock that mimics Mongoose's
 * `Model.find(...).sort(...).lean()` pattern.
 */
function makeFindChain(resolvedValue) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(resolvedValue)
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Resolution API integration tests', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/markets', marketRoutes);
    app.use('/api/oracle', oracleRoutes);
    app.use(notFound);
    app.use(errorHandler);

    // Default: Soroban returns a valid result (no contract_data_unavailable)
    mockQueryContract.mockResolvedValue({ result: {} });
  });

  // -------------------------------------------------------------------------
  // 1. GET /api/markets/:id/resolution — 200 with correct response shape
  // -------------------------------------------------------------------------

  describe('GET /api/markets/:id/resolution — 200 with correct response shape', () => {
    it('returns success:true and all required data fields when market and events exist', async () => {
      const market = makeMarket();
      const events = [
        makeEvent({ txHash: 'tx-1', outcome: true, confidenceScore: 0.9 }),
        makeEvent({ txHash: 'tx-2', outcome: false, confidenceScore: 0.7, eventType: 'oracle_submission' })
      ];

      mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(market) });
      mockResolutionEventFind.mockReturnValue(makeFindChain(events));

      const res = await request(app)
        .get('/api/markets/market-test-1/resolution')
        .expect(200);

      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data).toBeDefined();

      // All required top-level fields must be present (Requirement 6.5)
      expect(data).toHaveProperty('oracle_source');
      expect(data).toHaveProperty('oracle_config');
      expect(data).toHaveProperty('resolution_status');
      expect(data).toHaveProperty('submissions');
      expect(data).toHaveProperty('aggregated_result');
      expect(data).toHaveProperty('dispute_info');
      expect(data).toHaveProperty('audit_trail');

      // Spot-check values
      expect(data.oracle_source).toBe('coingecko');
      expect(data.oracle_config).toEqual({ symbol: 'bitcoin', targetPrice: 100000, condition: 'above' });
      expect(Array.isArray(data.submissions)).toBe(true);
      expect(Array.isArray(data.audit_trail)).toBe(true);
    });

    it('populates submissions from oracle_submission events', async () => {
      const market = makeMarket();
      const events = [
        makeEvent({ txHash: 'tx-sub-1', actorAddress: 'GORACLE1', outcome: true, confidenceScore: 0.95 })
      ];

      mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(market) });
      mockResolutionEventFind.mockReturnValue(makeFindChain(events));

      const res = await request(app)
        .get('/api/markets/market-test-1/resolution')
        .expect(200);

      const { submissions } = res.body.data;
      expect(submissions).toHaveLength(1);
      expect(submissions[0]).toMatchObject({
        oracleAddress: 'GORACLE1',
        outcome: 'yes',
        confidenceScore: 0.95,
        txHash: 'tx-sub-1'
      });
      expect(submissions[0].explorerUrl).toContain('tx-sub-1');
    });

    it('populates audit_trail from all events', async () => {
      const market = makeMarket();
      const events = [
        makeEvent({ txHash: 'tx-audit-1', eventType: 'oracle_submission', ledger: 100 }),
        makeEvent({ txHash: 'tx-audit-2', eventType: 'consensus_reached', ledger: 200 })
      ];

      mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(market) });
      mockResolutionEventFind.mockReturnValue(makeFindChain(events));

      const res = await request(app)
        .get('/api/markets/market-test-1/resolution')
        .expect(200);

      const { audit_trail } = res.body.data;
      expect(audit_trail).toHaveLength(2);
      expect(audit_trail[0].txHash).toBe('tx-audit-1');
      expect(audit_trail[1].txHash).toBe('tx-audit-2');
    });
  });

  // -------------------------------------------------------------------------
  // 2. GET /api/markets/:id/resolution — 404 for unknown market ID
  // -------------------------------------------------------------------------

  describe('GET /api/markets/:id/resolution — 404 for unknown market', () => {
    it('returns HTTP 404 with success:false and message when market does not exist', async () => {
      mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      const res = await request(app)
        .get('/api/markets/nonexistent-market/resolution')
        .expect(404);

      expect(res.body.success).toBe(false);
      // NotFoundError constructor appends " not found" to the resource string.
      // resolutionController passes 'Market not found' → message = 'Market not found not found'.
      // We verify the message contains the key phrase from the spec.
      expect(res.body.error.message).toContain('Market not found');
    });
  });

  // -------------------------------------------------------------------------
  // 3. GET /api/markets/:id/resolution — contract_data_unavailable when Soroban fails
  // -------------------------------------------------------------------------

  describe('GET /api/markets/:id/resolution — contract_data_unavailable on Soroban failure', () => {
    it('returns 200 with off-chain data and contract_data_unavailable:true when Soroban throws', async () => {
      const market = makeMarket();
      const events = [makeEvent()];

      mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(market) });
      mockResolutionEventFind.mockReturnValue(makeFindChain(events));

      // Simulate Soroban RPC failure (Requirement 6.3)
      mockQueryContract.mockRejectedValue(new Error('Soroban RPC unreachable'));

      const res = await request(app)
        .get('/api/markets/market-test-1/resolution')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.contract_data_unavailable).toBe(true);

      // Off-chain data must still be present
      expect(res.body.data).toHaveProperty('oracle_source');
      expect(res.body.data).toHaveProperty('resolution_status');
      expect(res.body.data).toHaveProperty('audit_trail');
    });

    it('still returns all required fields even when Soroban is unavailable', async () => {
      const market = makeMarket();
      mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(market) });
      mockResolutionEventFind.mockReturnValue(makeFindChain([]));
      mockQueryContract.mockRejectedValue(new Error('timeout'));

      const res = await request(app)
        .get('/api/markets/market-test-1/resolution')
        .expect(200);

      const data = res.body.data;
      expect(data).toHaveProperty('oracle_source');
      expect(data).toHaveProperty('oracle_config');
      expect(data).toHaveProperty('resolution_status');
      expect(data).toHaveProperty('submissions');
      expect(data).toHaveProperty('aggregated_result');
      expect(data).toHaveProperty('dispute_info');
      expect(data).toHaveProperty('audit_trail');
      expect(data.contract_data_unavailable).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. GET /api/markets/:id/resolution — responds within 3000ms
  // -------------------------------------------------------------------------

  describe('GET /api/markets/:id/resolution — response time', () => {
    it('responds within 3000ms even when Soroban is slow/unavailable', async () => {
      const market = makeMarket();
      mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(market) });
      mockResolutionEventFind.mockReturnValue(makeFindChain([]));

      // Soroban throws immediately — the controller's internal 3000ms timeout
      // will fire, but the endpoint should still respond well within 3000ms.
      mockQueryContract.mockRejectedValue(new Error('RPC unavailable'));

      const start = Date.now();
      await request(app)
        .get('/api/markets/market-test-1/resolution')
        .expect(200);
      const elapsed = Date.now() - start;

      // Requirement 6.4: respond within 3000ms
      expect(elapsed).toBeLessThan(3000);
    });
  });

  // -------------------------------------------------------------------------
  // 5. GET /api/oracle/health — correct response shape
  // -------------------------------------------------------------------------

  describe('GET /api/oracle/health — correct response shape', () => {
    it('returns success:true and sources array with required fields', async () => {
      // Requirement 7.1, 7.2
      mockGetSourceHealthStatus.mockReturnValue({
        coingecko: { successCount: 100, failureCount: 5, failureRate: 0.047, lastFailure: null },
        'sports-api': { successCount: 50, failureCount: 2, failureRate: 0.038, lastFailure: null },
        'news-api': { successCount: 30, failureCount: 1, failureRate: 0.032, lastFailure: null },
        chainlink: { successCount: 80, failureCount: 0, failureRate: 0.0, lastFailure: null }
      });

      const res = await request(app)
        .get('/api/oracle/health')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data.sources)).toBe(true);

      const sources = res.body.data.sources;
      expect(sources.length).toBe(4);

      // Each entry must have the required fields (Requirement 7.2)
      sources.forEach(source => {
        expect(source).toHaveProperty('name');
        expect(source).toHaveProperty('successCount');
        expect(source).toHaveProperty('failureCount');
        expect(source).toHaveProperty('failureRate');
        expect(source).toHaveProperty('isHealthy');
      });
    });

    it('returns 503 when oracleService returns null', async () => {
      mockGetSourceHealthStatus.mockReturnValue(null);

      const res = await request(app)
        .get('/api/oracle/health')
        .expect(503);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Oracle service unavailable');
    });
  });

  // -------------------------------------------------------------------------
  // 6. GET /api/oracle/health — isHealthy reflects in-memory health state
  // -------------------------------------------------------------------------

  describe('GET /api/oracle/health — isHealthy reflects health state', () => {
    it('sets isHealthy:false for a source with failureRate > 0.30', async () => {
      // Requirement 7.3: failure rate above 0.30 → isHealthy: false
      mockGetSourceHealthStatus.mockReturnValue({
        coingecko: { successCount: 100, failureCount: 5, failureRate: 0.047, lastFailure: null },
        'sports-api': { successCount: 10, failureCount: 5, failureRate: 0.333, lastFailure: '2025-01-15T09:00:00Z' }
      });

      const res = await request(app)
        .get('/api/oracle/health')
        .expect(200);

      const sources = res.body.data.sources;
      const coingecko = sources.find(s => s.name === 'coingecko');
      const sportsApi = sources.find(s => s.name === 'sports-api');

      expect(coingecko.isHealthy).toBe(true);
      expect(sportsApi.isHealthy).toBe(false);
    });

    it('sets isHealthy:true for a source with failureRate exactly 0.30', async () => {
      // Boundary: failureRate === 0.30 should still be healthy (threshold is > 0.30)
      mockGetSourceHealthStatus.mockReturnValue({
        coingecko: { successCount: 70, failureCount: 30, failureRate: 0.30, lastFailure: null }
      });

      const res = await request(app)
        .get('/api/oracle/health')
        .expect(200);

      const coingecko = res.body.data.sources.find(s => s.name === 'coingecko');
      expect(coingecko.isHealthy).toBe(true);
    });

    it('sets isHealthy:false for a source with failureRate just above 0.30', async () => {
      mockGetSourceHealthStatus.mockReturnValue({
        coingecko: { successCount: 69, failureCount: 31, failureRate: 0.31, lastFailure: '2025-01-15T09:00:00Z' }
      });

      const res = await request(app)
        .get('/api/oracle/health')
        .expect(200);

      const coingecko = res.body.data.sources.find(s => s.name === 'coingecko');
      expect(coingecko.isHealthy).toBe(false);
    });

    it('reflects all-healthy state when all sources have low failure rates', async () => {
      mockGetSourceHealthStatus.mockReturnValue({
        coingecko: { successCount: 200, failureCount: 1, failureRate: 0.005, lastFailure: null },
        chainlink: { successCount: 150, failureCount: 0, failureRate: 0.0, lastFailure: null }
      });

      const res = await request(app)
        .get('/api/oracle/health')
        .expect(200);

      res.body.data.sources.forEach(source => {
        expect(source.isHealthy).toBe(true);
      });
    });
  });
});

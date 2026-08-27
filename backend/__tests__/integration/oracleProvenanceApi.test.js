/**
 * Integration tests for the Oracle Data Provenance API (#241).
 *
 *   GET /api/markets/:id/resolution/provenance
 */

const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// Mock models BEFORE requiring the routes.
// ---------------------------------------------------------------------------

const mockMarketFindOne = jest.fn();
const MockMarket = jest.fn(function (data) {
  Object.assign(this, data);
});
MockMarket.findOne = mockMarketFindOne;

const mockProvenanceFind = jest.fn();
const MockOracleProvenanceRecord = jest.fn(function (data) {
  Object.assign(this, data);
});
MockOracleProvenanceRecord.find = mockProvenanceFind;

const MockResolutionEvent = jest.fn();
MockResolutionEvent.find = jest.fn();

jest.mock('../../src/models', () => ({
  Market: MockMarket,
  OracleProvenanceRecord: MockOracleProvenanceRecord,
  ResolutionEvent: MockResolutionEvent
}));

jest.mock('../../src/services/sorobanService', () => ({
  queryContract: jest.fn().mockResolvedValue({ result: {} }),
  contracts: { ORACLE_RESOLVER: 'ORACLE_RESOLVER_CONTRACT' }
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  oracle: jest.fn()
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { walletAddress: 'GTEST' };
    next();
  },
  optionalAuth: (_req, _res, next) => next()
}));

const marketRoutes = require('../../src/routes/markets');
const { errorHandler, notFound } = require('../../src/middleware/errorHandler');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMarket(overrides = {}) {
  return {
    marketId: 'MKT-prov-1',
    status: 'resolved',
    resolvedOutcome: 'yes',
    resolvedAt: new Date('2026-01-15T12:00:00Z'),
    resolvedBy: 'oracle',
    resolutionTransactionHash: 'stellar-tx-1',
    resolutionFinalizationTxHash: null,
    resolutionFinalizationTimestamp: null,
    ...overrides
  };
}

function makeRecord(overrides = {}) {
  return {
    _id: `rec-${Math.random().toString(16).slice(2)}`,
    marketId: 'MKT-prov-1',
    batchId: 'MKT-prov-1:batch-1',
    provider: 'coingecko',
    providerRequestId: 'bitcoin',
    receivedAt: new Date('2026-01-15T11:59:59Z'),
    normalizedOutcome: 'yes',
    confidence: 0.95,
    numericValue: 105000,
    sourceValue: { outcome: 'yes', confidence: 0.95, value: 105000 },
    responseMetadata: { source: 'coingecko', symbol: 'bitcoin' },
    validationStatus: 'valid',
    rejectionReason: null,
    rejectionDetail: null,
    stale: false,
    freshness: null,
    participatedInConsensus: true,
    weightInConsensus: 0.5,
    consensusContext: {
      providersAccepted: ['coingecko', 'chainlink'],
      providersRejected: { stale: ['sports-api'], outliers: [], invalid: [] },
      finalOutcome: 'yes',
      consensusReached: true,
      agreementRatio: 0.82
    },
    contributedToResolution: true,
    resolutionRef: {
      resolvedOutcome: 'yes',
      resolutionTransactionHash: 'stellar-tx-1'
    },
    recordedAt: new Date('2026-01-15T12:00:00Z'),
    ...overrides
  };
}

/** Mimic Model.find(...).sort(...).lean() */
function findChain(value) {
  return {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value)
  };
}

// ---------------------------------------------------------------------------

describe('GET /api/markets/:id/resolution/provenance', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/markets', marketRoutes);
    app.use(notFound);
    app.use(errorHandler);
  });

  it('returns the full provenance trail for a resolved market', async () => {
    const records = [
      makeRecord({ provider: 'coingecko', validationStatus: 'valid', participatedInConsensus: true, contributedToResolution: true }),
      makeRecord({ provider: 'chainlink', validationStatus: 'valid', participatedInConsensus: true, contributedToResolution: true, providerRequestId: 'BTC/USD' }),
      makeRecord({
        provider: 'sports-api',
        validationStatus: 'stale',
        stale: true,
        rejectionReason: 'freshness_violation',
        rejectionDetail: 'Response age 1200000ms exceeds max staleness 300000ms',
        freshness: { ageMs: 1200000, maxAgeMs: 300000 },
        participatedInConsensus: false,
        contributedToResolution: false,
        normalizedOutcome: 'no'
      }),
      makeRecord({
        provider: 'news-api',
        validationStatus: 'rejected',
        rejectionReason: 'validation_failure',
        rejectionDetail: 'Consensus engine rejected response: missing_source_or_outcome',
        participatedInConsensus: false,
        contributedToResolution: false,
        normalizedOutcome: null
      })
    ];

    mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeMarket()) });
    mockProvenanceFind.mockReturnValue(findChain(records));

    const res = await request(app)
      .get('/api/markets/MKT-prov-1/resolution/provenance')
      .expect(200);

    expect(res.body.success).toBe(true);
    const data = res.body.data;

    // Resolution summary
    expect(data.resolution).toMatchObject({
      status: 'resolved',
      resolvedOutcome: 'yes',
      resolutionTransactionHash: 'stellar-tx-1'
    });

    // Every observation is present with provider identity, timestamp and status
    expect(data.observations).toHaveLength(4);
    data.observations.forEach((o) => {
      expect(o).toHaveProperty('provider');
      expect(o).toHaveProperty('receivedAt');
      expect(o).toHaveProperty('validationStatus');
    });

    // Rejected + stale observations remain visible with reasons
    const stale = data.observations.find((o) => o.provider === 'sports-api');
    expect(stale.validationStatus).toBe('stale');
    expect(stale.stale).toBe(true);
    expect(stale.rejectionReason).toBe('freshness_violation');
    expect(stale.freshness).toEqual({ ageMs: 1200000, maxAgeMs: 300000 });

    const rejected = data.observations.find((o) => o.provider === 'news-api');
    expect(rejected.validationStatus).toBe('rejected');
    expect(rejected.rejectionReason).toBe('validation_failure');

    // Contributing inputs are identifiable
    const attempt = data.attempts[0];
    expect(attempt.contributingProviders.sort()).toEqual(['chainlink', 'coingecko']);
    expect(attempt.staleProviders).toEqual(['sports-api']);
    expect(attempt.rejectedProviders).toEqual([{ provider: 'news-api', reason: 'validation_failure' }]);

    // Decision context is exposed
    expect(data.decision_context).toBeTruthy();
    expect(data.decision_context.consensusContext.finalOutcome).toBe('yes');
    expect(data.legacy_resolution).toBe(false);
  });

  it('does not expose credentials in observation metadata', async () => {
    const records = [
      makeRecord({ responseMetadata: { source: 'coingecko', symbol: 'bitcoin', apiKey: '[redacted]' } })
    ];
    mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeMarket()) });
    mockProvenanceFind.mockReturnValue(findChain(records));

    const res = await request(app)
      .get('/api/markets/MKT-prov-1/resolution/provenance')
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain('super-secret');
    expect(res.body.data.observations[0].responseMetadata.apiKey).toBe('[redacted]');
  });

  it('flags a resolved market with no provenance records as legacy', async () => {
    mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeMarket()) });
    mockProvenanceFind.mockReturnValue(findChain([]));

    const res = await request(app)
      .get('/api/markets/MKT-prov-1/resolution/provenance')
      .expect(200);

    expect(res.body.data.observations).toEqual([]);
    expect(res.body.data.attempts).toEqual([]);
    expect(res.body.data.decision_context).toBeNull();
    expect(res.body.data.legacy_resolution).toBe(true);
  });

  it('returns an empty, non-legacy trail for an unresolved market', async () => {
    mockMarketFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(makeMarket({ status: 'active', resolvedOutcome: null, resolvedAt: null }))
    });
    mockProvenanceFind.mockReturnValue(findChain([]));

    const res = await request(app)
      .get('/api/markets/MKT-prov-1/resolution/provenance')
      .expect(200);

    expect(res.body.data.legacy_resolution).toBe(false);
    expect(res.body.data.observations).toEqual([]);
  });

  it('returns 404 for an unknown market', async () => {
    mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const res = await request(app)
      .get('/api/markets/nope/resolution/provenance')
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Market not found');
  });

  it('separates multiple resolution attempts by batch, oldest first', async () => {
    const records = [
      makeRecord({ batchId: 'b1', provider: 'coingecko', recordedAt: new Date('2026-01-15T10:00:00Z'), contributedToResolution: false }),
      makeRecord({ batchId: 'b2', provider: 'coingecko', recordedAt: new Date('2026-01-15T12:00:00Z'), contributedToResolution: true })
    ];
    mockMarketFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeMarket()) });
    mockProvenanceFind.mockReturnValue(findChain(records));

    const res = await request(app)
      .get('/api/markets/MKT-prov-1/resolution/provenance')
      .expect(200);

    expect(res.body.data.attempts.map((a) => a.batchId)).toEqual(['b1', 'b2']);
    // decision_context reflects the latest attempt
    expect(res.body.data.decision_context.batchId).toBe('b2');
  });
});

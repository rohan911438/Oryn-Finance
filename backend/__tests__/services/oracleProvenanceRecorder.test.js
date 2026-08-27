/**
 * Unit tests for OracleProvenanceRecorder (#241).
 *
 * Covers:
 *   - multi-provider attempt: valid / valid / stale / rejected all persisted
 *   - stale response: persisted, marked stale, reason recorded, excluded
 *   - invalid/malformed response: persisted, rejected, reason available, excluded
 *   - resolution linkage: contributing observations linked, excluded stay excluded
 *   - credentials are never persisted
 */

// ---------------------------------------------------------------------------
// In-memory OracleProvenanceRecord mock (mirrors the Mongoose surface used).
// ---------------------------------------------------------------------------

let store = [];
let autoId = 1;

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '_id') return doc._id === value;
    return doc[key] === value;
  });
}

const MockOracleProvenanceRecord = {
  updateOne: jest.fn(async (filter = {}, update = {}, options = {}) => {
    let doc = store.find((d) => matches(d, filter));
    if (!doc && options.upsert) {
      doc = { _id: `rec_${autoId++}` };
      store.push(doc);
      if (update.$setOnInsert) Object.assign(doc, update.$setOnInsert);
    }
    if (doc && update.$set) Object.assign(doc, update.$set);
    return { acknowledged: true, modifiedCount: doc ? 1 : 0, upsertedCount: options.upsert ? 1 : 0 };
  }),
  find: jest.fn((filter = {}) => ({
    lean: async () => store.filter((d) => matches(d, filter)),
    sort: () => ({ lean: async () => store.filter((d) => matches(d, filter)) })
  }))
};

jest.mock('../../src/models', () => ({
  OracleProvenanceRecord: MockOracleProvenanceRecord
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  oracle: jest.fn()
}));

const recorder = require('../../src/services/oracle/OracleProvenanceRecorder');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** A consensus decision as produced by OracleConsensusEngine.evaluate(). */
function makeDecision() {
  return {
    finalOutcome: 'yes',
    consensusReached: true,
    agreementRatio: 0.82,
    totalWeight: 1.1,
    weightByOutcome: { yes: 0.9, no: 0.2 },
    participants: [
      { source: 'coingecko', outcome: 'yes', value: 105000, confidence: 0.95, weight: 0.5, ageMs: 1000 },
      { source: 'chainlink', outcome: 'yes', value: 104800, confidence: 0.9, weight: 0.4, ageMs: 2000 }
    ],
    rejected: {
      invalid: [{ source: 'news-api', reason: 'missing_source_or_outcome' }],
      stale: [{ source: 'sports-api', timestamp: '2026-01-15T11:40:00Z', ageMs: 1200000, maxAgeMs: 300000 }],
      outliers: []
    },
    consensusThreshold: 0.6,
    minResponses: 1,
    evaluatedResponseCount: 4,
    evaluatedAt: new Date(NOW).toISOString()
  };
}

/** Raw provider results matching the decision above. */
function makeResults() {
  return [
    {
      source: 'coingecko',
      outcome: 'yes',
      confidence: 0.95,
      data: { source: 'coingecko', symbol: 'bitcoin', currentPrice: 105000, targetPrice: 100000, condition: 'above', apiKey: 'super-secret-key' },
      timestamp: new Date(NOW - 1000).toISOString()
    },
    {
      source: 'chainlink',
      outcome: 'yes',
      confidence: 0.9,
      data: { source: 'chainlink', feedId: 'BTC/USD', currentPrice: 104800, authorization: 'Bearer abc.def' },
      timestamp: new Date(NOW - 2000).toISOString()
    },
    {
      source: 'sports-api',
      outcome: 'no',
      confidence: 0.7,
      data: { source: 'sports-api', gameId: 'game-1' },
      timestamp: new Date(NOW - 1200000).toISOString()
    },
    {
      source: 'news-api',
      outcome: undefined,
      confidence: 0.5,
      data: { source: 'news-api', sentiment: 'neutral' },
      timestamp: new Date(NOW - 3000).toISOString()
    }
  ];
}

beforeEach(() => {
  store = [];
  autoId = 1;
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Multi-provider attempt
// ---------------------------------------------------------------------------

describe('recordResolutionAttempt — multi-provider', () => {
  it('persists one provenance record per raw provider response', async () => {
    const batchId = await recorder.recordResolutionAttempt({
      marketId: 'MKT-1',
      results: makeResults(),
      decision: makeDecision()
    });

    expect(batchId).toEqual(expect.stringContaining('MKT-1:'));
    expect(store).toHaveLength(4);
    expect(store.map((r) => r.provider).sort()).toEqual(
      ['chainlink', 'coingecko', 'news-api', 'sports-api']
    );
    store.forEach((r) => {
      expect(r.batchId).toBe(batchId);
      expect(r.marketId).toBe('MKT-1');
      expect(r.consensusContext).toBeTruthy();
    });
  });

  it('assigns the correct validation status to each response', async () => {
    await recorder.recordResolutionAttempt({
      marketId: 'MKT-1',
      results: makeResults(),
      decision: makeDecision()
    });

    const byProvider = Object.fromEntries(store.map((r) => [r.provider, r]));

    expect(byProvider.coingecko.validationStatus).toBe('valid');
    expect(byProvider.coingecko.participatedInConsensus).toBe(true);
    expect(byProvider.chainlink.validationStatus).toBe('valid');

    expect(byProvider['sports-api'].validationStatus).toBe('stale');
    expect(byProvider['sports-api'].stale).toBe(true);
    expect(byProvider['sports-api'].rejectionReason).toBe('freshness_violation');
    expect(byProvider['sports-api'].participatedInConsensus).toBe(false);

    expect(byProvider['news-api'].validationStatus).toBe('rejected');
    expect(byProvider['news-api'].rejectionReason).toBe('validation_failure');
    expect(byProvider['news-api'].participatedInConsensus).toBe(false);
  });

  it('keeps rejected and stale observations queryable (they do not disappear)', async () => {
    await recorder.recordResolutionAttempt({
      marketId: 'MKT-1',
      results: makeResults(),
      decision: makeDecision()
    });

    const excluded = store.filter((r) => r.validationStatus !== 'valid');
    expect(excluded.map((r) => r.provider).sort()).toEqual(['news-api', 'sports-api']);
    excluded.forEach((r) => {
      expect(r.rejectionReason).toBeTruthy();
      expect(r.rejectionDetail).toBeTruthy();
    });
  });

  it('is idempotent when the same attempt is recorded twice', async () => {
    const batchId = await recorder.recordResolutionAttempt({
      marketId: 'MKT-1',
      results: makeResults(),
      decision: makeDecision(),
      batchId: 'MKT-1:fixed-batch'
    });
    await recorder.recordResolutionAttempt({
      marketId: 'MKT-1',
      results: makeResults(),
      decision: makeDecision(),
      batchId
    });

    expect(store).toHaveLength(4);
  });

  it('never persists credentials from provider response metadata', async () => {
    await recorder.recordResolutionAttempt({
      marketId: 'MKT-1',
      results: makeResults(),
      decision: makeDecision()
    });

    const serialized = JSON.stringify(store);
    expect(serialized).not.toContain('super-secret-key');
    expect(serialized).not.toContain('Bearer abc.def');

    const coingecko = store.find((r) => r.provider === 'coingecko');
    expect(coingecko.responseMetadata.apiKey).toBe('[redacted]');
    expect(coingecko.responseMetadata.symbol).toBe('bitcoin');
  });

  it('returns null and writes nothing when there are no results', async () => {
    const batchId = await recorder.recordResolutionAttempt({
      marketId: 'MKT-1',
      results: [],
      decision: makeDecision()
    });
    expect(batchId).toBeNull();
    expect(store).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Stale response handling
// ---------------------------------------------------------------------------

describe('recordResolutionAttempt — stale response', () => {
  it('records freshness detail and excludes the stale response from consensus', async () => {
    await recorder.recordResolutionAttempt({
      marketId: 'MKT-2',
      results: makeResults(),
      decision: makeDecision()
    });

    const stale = store.find((r) => r.provider === 'sports-api');
    expect(stale.validationStatus).toBe('stale');
    expect(stale.freshness).toEqual({ ageMs: 1200000, maxAgeMs: 300000 });
    expect(stale.rejectionDetail).toContain('exceeds max staleness');
    expect(stale.contributedToResolution).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Outlier / malformed response
// ---------------------------------------------------------------------------

describe('recordResolutionAttempt — outlier and malformed responses', () => {
  it('classifies an outlier response as rejected with the outlier reason', async () => {
    const decision = makeDecision();
    decision.rejected.outliers = [
      { source: 'chainlink', value: 999999, robustZ: 12.4, threshold: 3.5 }
    ];
    decision.participants = decision.participants.filter((p) => p.source !== 'chainlink');

    await recorder.recordResolutionAttempt({
      marketId: 'MKT-3',
      results: makeResults(),
      decision
    });

    const chainlink = store.find((r) => r.provider === 'chainlink');
    expect(chainlink.validationStatus).toBe('rejected');
    expect(chainlink.rejectionReason).toBe('outlier');
    expect(chainlink.rejectionDetail).toContain('z-score');
  });

  it('classifies an invalid-timestamp response as a malformed_response rejection', async () => {
    const decision = makeDecision();
    decision.rejected.invalid = [{ source: 'news-api', reason: 'invalid_timestamp' }];

    await recorder.recordResolutionAttempt({
      marketId: 'MKT-3',
      results: makeResults(),
      decision
    });

    const news = store.find((r) => r.provider === 'news-api');
    expect(news.validationStatus).toBe('rejected');
    expect(news.rejectionReason).toBe('malformed_response');
  });
});

// ---------------------------------------------------------------------------
// Resolution linkage
// ---------------------------------------------------------------------------

describe('linkResolution', () => {
  it('links only contributing observations to the final resolution', async () => {
    const batchId = await recorder.recordResolutionAttempt({
      marketId: 'MKT-4',
      results: makeResults(),
      decision: makeDecision()
    });

    const linked = await recorder.linkResolution({
      marketId: 'MKT-4',
      batchId,
      resolution: {
        resolvedOutcome: 'yes',
        resolvedAt: new Date(NOW),
        resolutionTransactionHash: 'stellar-tx-hash-1',
        consensusReached: true,
        agreementRatio: 0.82
      }
    });

    expect(linked).toBe(4);

    const byProvider = Object.fromEntries(store.map((r) => [r.provider, r]));
    // Accepted + outcome matches resolved outcome → contributed
    expect(byProvider.coingecko.contributedToResolution).toBe(true);
    expect(byProvider.chainlink.contributedToResolution).toBe(true);
    // Stale / rejected → never contribute, even after linkage
    expect(byProvider['sports-api'].contributedToResolution).toBe(false);
    expect(byProvider['news-api'].contributedToResolution).toBe(false);

    store.forEach((r) => {
      expect(r.resolutionRef.resolutionTransactionHash).toBe('stellar-tx-hash-1');
      expect(r.resolutionRef.resolvedOutcome).toBe('yes');
    });
  });

  it('does not change a rejected/stale record\'s validation status', async () => {
    const batchId = await recorder.recordResolutionAttempt({
      marketId: 'MKT-5',
      results: makeResults(),
      decision: makeDecision()
    });

    await recorder.linkResolution({
      marketId: 'MKT-5',
      batchId,
      resolution: { resolvedOutcome: 'yes', resolvedAt: new Date(NOW), resolutionTransactionHash: 'tx' }
    });

    const stale = store.find((r) => r.provider === 'sports-api');
    const rejected = store.find((r) => r.provider === 'news-api');
    expect(stale.validationStatus).toBe('stale');
    expect(rejected.validationStatus).toBe('rejected');
  });

  it('returns 0 when there is no batch to link', async () => {
    const linked = await recorder.linkResolution({
      marketId: 'MKT-6',
      batchId: 'does-not-exist',
      resolution: { resolvedOutcome: 'yes' }
    });
    expect(linked).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('deriveVerdict', () => {
  it('marks a participant as valid', () => {
    const decision = makeDecision();
    const verdict = recorder.deriveVerdict({ source: 'coingecko' }, decision);
    expect(verdict.validationStatus).toBe('valid');
    expect(verdict.participatedInConsensus).toBe(true);
  });

  it('marks an unknown source as rejected rather than dropping it', () => {
    const verdict = recorder.deriveVerdict({ source: 'ghost' }, makeDecision());
    expect(verdict.validationStatus).toBe('rejected');
    expect(verdict.rejectionReason).toBe('validation_failure');
  });
});

describe('sanitizeMetadata', () => {
  it('redacts sensitive keys at any depth', () => {
    const clean = recorder.sanitizeMetadata({
      symbol: 'btc',
      nested: { secret: 'x', apiKey: 'y', ok: 1 },
      token: 'z'
    });
    expect(clean.symbol).toBe('btc');
    expect(clean.nested.ok).toBe(1);
    expect(clean.nested.secret).toBe('[redacted]');
    expect(clean.nested.apiKey).toBe('[redacted]');
    expect(clean.token).toBe('[redacted]');
  });
});

/**
 * Integration tests for the end-to-end Oracle Consensus Engine (#219).
 *
 * Exercises the real ConsensusEngine wired into oracleService.aggregateResults,
 * including provider weighting, staleness rejection, statistical outlier
 * rejection, configurable thresholds, and audit-log persistence of oracle
 * decisions.
 */

jest.mock('../../src/config/logger', () => ({
  oracle: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../src/models', () => ({ Market: {} }));

const mockOracleAudit = jest.fn().mockResolvedValue({});
jest.mock('../../src/services/auditService', () => ({
  oracle: (...args) => mockOracleAudit(...args)
}));

const oracleService = require('../../src/services/oracleService');

describe('Oracle Consensus Engine — end-to-end integration', () => {
  beforeEach(() => {
    oracleService.setWeights({});
    oracleService.clearRetryQueue();
    oracleService.resultCache.clear();
    mockOracleAudit.mockClear();
  });

  it('reaches weighted consensus across providers and records an audit log', () => {
    const now = Date.now();

    const aggregated = oracleService.aggregateResults(
      [
        { source: 'coingecko', outcome: 'yes', confidence: 1, data: {}, timestamp: new Date(now).toISOString() },
        { source: 'chainlink', outcome: 'yes', confidence: 1, data: {}, timestamp: new Date(now).toISOString() },
        { source: 'news-api', outcome: 'no', confidence: 1, data: {}, timestamp: new Date(now).toISOString() }
      ],
      { marketId: 'market-consensus-1', consensusThreshold: 0.6 }
    );

    // weights: coingecko 0.4, chainlink 0.5, news-api 0.25 -> yes 0.9 / total 1.15 ≈ 0.783
    expect(aggregated.outcome).toBe('yes');
    expect(aggregated.consensusReached).toBe(true);
    expect(aggregated.data.consensus.agreementRatio).toBeGreaterThan(0.6);

    expect(mockOracleAudit).toHaveBeenCalledWith(
      'oracle.consensus_reached',
      expect.objectContaining({
        target: { type: 'market', id: 'market-consensus-1' },
        metadata: expect.objectContaining({ finalOutcome: 'yes' })
      })
    );
  });

  it('does not persist an audit log when marketId is omitted (pure aggregation call)', () => {
    oracleService.aggregateResults([
      { source: 'coingecko', outcome: 'yes', confidence: 1, data: {} },
      { source: 'news-api', outcome: 'no', confidence: 1, data: {} }
    ]);

    expect(mockOracleAudit).not.toHaveBeenCalled();
  });

  it('excludes stale provider responses from consensus and logs the rejection', () => {
    const now = Date.now();
    const staleTimestamp = new Date(now - 10 * 60 * 1000).toISOString(); // 10 minutes old

    const aggregated = oracleService.aggregateResults(
      [
        { source: 'coingecko', outcome: 'yes', confidence: 1, data: {}, timestamp: new Date(now).toISOString() },
        { source: 'chainlink', outcome: 'no', confidence: 1, data: {}, timestamp: staleTimestamp }
      ],
      { marketId: 'market-stale-1', maxAgeMs: 5 * 60 * 1000, consensusThreshold: 0.5 }
    );

    expect(aggregated.data.consensus.rejected.stale.map((r) => r.source)).toContain('chainlink');
    expect(aggregated.data.breakdown.map((b) => b.source)).toEqual(['coingecko']);
    expect(aggregated.outcome).toBe('yes');
  });

  it('rejects statistically outlying numeric provider readings', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();

    const aggregated = oracleService.aggregateResults(
      [
        { source: 'src1', outcome: 'yes', confidence: 1, data: { currentPrice: 100 }, timestamp: ts },
        { source: 'src2', outcome: 'yes', confidence: 1, data: { currentPrice: 102 }, timestamp: ts },
        { source: 'src3', outcome: 'yes', confidence: 1, data: { currentPrice: 98 }, timestamp: ts },
        { source: 'src4', outcome: 'no', confidence: 1, data: { currentPrice: 50000 }, timestamp: ts }
      ],
      { marketId: 'market-outlier-1' }
    );

    expect(aggregated.data.consensus.rejected.outliers.map((r) => r.source)).toEqual(['src4']);
    expect(aggregated.data.breakdown.map((b) => b.source)).toEqual(['src1', 'src2', 'src3']);
    expect(aggregated.outcome).toBe('yes');
  });

  it('applies a per-market configurable consensus threshold', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const responses = [
      { source: 'a', outcome: 'yes', confidence: 1, data: {}, timestamp: ts },
      { source: 'b', outcome: 'no', confidence: 1, data: {}, timestamp: ts }
    ];

    const strict = oracleService.aggregateResults(responses, {
      marketId: 'market-threshold-1',
      consensusThreshold: 0.6
    });
    expect(strict.consensusReached).toBe(false);

    const lenient = oracleService.aggregateResults(responses, {
      marketId: 'market-threshold-2',
      consensusThreshold: 0.5
    });
    expect(lenient.consensusReached).toBe(true);
  });

  it('resolves a market end-to-end via resolveWithFallback honoring market-level oracleConfig thresholds', async () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();

    oracleService.resolvers['e2e-primary'] = jest.fn().mockResolvedValue({
      outcome: 'yes',
      confidence: 1,
      data: { provider: 'e2e-primary' }
    });

    const market = {
      marketId: 'market-e2e-1',
      category: 'generic',
      oracleConfig: {
        sources: ['e2e-primary'],
        consensusThreshold: 0.4,
        minConsensusResponses: 1
      }
    };

    const result = await oracleService.resolveWithFallback(market, { skipQueue: true });

    expect(result).not.toBeNull();
    expect(result.outcome).toBe('yes');
    expect(result.consensusReached).toBe(true);
    expect(mockOracleAudit).toHaveBeenCalledWith(
      'oracle.consensus_reached',
      expect.objectContaining({ target: { type: 'market', id: 'market-e2e-1' } })
    );

    delete oracleService.resolvers['e2e-primary'];
  });
});

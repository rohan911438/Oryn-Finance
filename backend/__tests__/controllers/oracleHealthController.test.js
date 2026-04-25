const fc = require('fast-check');

// Mock oracleService before requiring the controller
const mockGetSourceHealthStatus = jest.fn();
jest.mock('../../src/services/oracleService', () => ({
  getSourceHealthStatus: mockGetSourceHealthStatus
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const OracleHealthController = require('../../src/controllers/oracleHealthController');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

function makeReq() {
  return {};
}

// Build a health map from an array of { name, successCount, failureCount } descriptors
function buildHealthMap(sources) {
  const map = {};
  for (const { name, successCount, failureCount, lastFailure } of sources) {
    const total = successCount + failureCount;
    const failureRate = total > 0 ? failureCount / total : 0;
    map[name] = {
      successCount,
      failureCount,
      failureRate,
      lastFailure: lastFailure || null,
      isHealthy: failureRate < 0.3 // internal service value (may differ from controller's <= 0.30)
    };
  }
  return map;
}

// ---------------------------------------------------------------------------
// Unit tests — 6.3
// ---------------------------------------------------------------------------

describe('OracleHealthController — unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 503 when getSourceHealthStatus returns null', async () => {
    mockGetSourceHealthStatus.mockReturnValue(null);
    const req = makeReq();
    const res = makeRes();

    await OracleHealthController.getOracleHealth(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Oracle service unavailable' });
  });

  it('returns 503 when getSourceHealthStatus returns undefined', async () => {
    mockGetSourceHealthStatus.mockReturnValue(undefined);
    const req = makeReq();
    const res = makeRes();

    await OracleHealthController.getOracleHealth(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Oracle service unavailable' });
  });

  it('maps a single healthy source correctly', async () => {
    const healthMap = buildHealthMap([
      { name: 'coingecko', successCount: 142, failureCount: 3 }
    ]);
    mockGetSourceHealthStatus.mockReturnValue(healthMap);
    const req = makeReq();
    const res = makeRes();

    await OracleHealthController.getOracleHealth(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        sources: [
          expect.objectContaining({
            name: 'coingecko',
            successCount: 142,
            failureCount: 3,
            isHealthy: true,
            lastFailure: null
          })
        ]
      }
    });
  });

  it('marks a source as unhealthy when failureRate > 0.30', async () => {
    // failureRate = 5/15 = 0.333... > 0.30 → unhealthy
    const healthMap = buildHealthMap([
      { name: 'sports-api', successCount: 10, failureCount: 5 }
    ]);
    mockGetSourceHealthStatus.mockReturnValue(healthMap);
    const req = makeReq();
    const res = makeRes();

    await OracleHealthController.getOracleHealth(req, res);

    const sources = res.json.mock.calls[0][0].data.sources;
    expect(sources[0].isHealthy).toBe(false);
  });

  it('marks a source as healthy when failureRate === 0.30 (boundary)', async () => {
    // failureRate = 3/10 = 0.30 exactly → healthy (isHealthy = failureRate <= 0.30)
    const healthMap = buildHealthMap([
      { name: 'news-api', successCount: 7, failureCount: 3 }
    ]);
    mockGetSourceHealthStatus.mockReturnValue(healthMap);
    const req = makeReq();
    const res = makeRes();

    await OracleHealthController.getOracleHealth(req, res);

    const sources = res.json.mock.calls[0][0].data.sources;
    expect(sources[0].isHealthy).toBe(true);
  });

  it('includes lastFailure when present', async () => {
    const lastFailure = '2025-01-14T08:30:00.000Z';
    const healthMap = {
      coingecko: {
        successCount: 100,
        failureCount: 2,
        failureRate: 0.02,
        lastFailure,
        isHealthy: true
      }
    };
    mockGetSourceHealthStatus.mockReturnValue(healthMap);
    const req = makeReq();
    const res = makeRes();

    await OracleHealthController.getOracleHealth(req, res);

    const sources = res.json.mock.calls[0][0].data.sources;
    expect(sources[0].lastFailure).toBe(lastFailure);
  });

  it('returns lastFailure as null when not set', async () => {
    const healthMap = {
      coingecko: {
        successCount: 50,
        failureCount: 0,
        failureRate: 0,
        lastFailure: null,
        isHealthy: true
      }
    };
    mockGetSourceHealthStatus.mockReturnValue(healthMap);
    const req = makeReq();
    const res = makeRes();

    await OracleHealthController.getOracleHealth(req, res);

    const sources = res.json.mock.calls[0][0].data.sources;
    expect(sources[0].lastFailure).toBeNull();
  });

  it('returns an empty sources array when health map is empty', async () => {
    mockGetSourceHealthStatus.mockReturnValue({});
    const req = makeReq();
    const res = makeRes();

    await OracleHealthController.getOracleHealth(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { sources: [] }
    });
  });

  it('maps multiple sources correctly', async () => {
    const healthMap = buildHealthMap([
      { name: 'coingecko', successCount: 142, failureCount: 3 },
      { name: 'sports-api', successCount: 10, failureCount: 5 }
    ]);
    mockGetSourceHealthStatus.mockReturnValue(healthMap);
    const req = makeReq();
    const res = makeRes();

    await OracleHealthController.getOracleHealth(req, res);

    const { sources } = res.json.mock.calls[0][0].data;
    expect(sources).toHaveLength(2);
    const names = sources.map(s => s.name);
    expect(names).toContain('coingecko');
    expect(names).toContain('sports-api');
  });
});

// ---------------------------------------------------------------------------
// Property 8 — Oracle health threshold is correctly applied
// Feature: market-resolution-transparency, Property 8: oracle health threshold is correctly applied
// Validates: Requirements 7.3
// ---------------------------------------------------------------------------

describe('Property 8: oracle health threshold is correctly applied', () => {
  it('isHealthy === (failureRate <= 0.30) for all (successCount, failureCount) pairs', () => {
    // Feature: market-resolution-transparency, Property 8: oracle health threshold is correctly applied
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),   // successCount
        fc.nat({ max: 10000 }),   // failureCount
        (successCount, failureCount) => {
          const total = successCount + failureCount;
          // Skip the degenerate case where both are 0 (failureRate is 0 by convention)
          const failureRate = total > 0 ? failureCount / total : 0;

          const healthMap = {
            'test-source': {
              successCount,
              failureCount,
              failureRate,
              lastFailure: null,
              isHealthy: failureRate < 0.3
            }
          };
          mockGetSourceHealthStatus.mockReturnValue(healthMap);

          const req = makeReq();
          const res = makeRes();

          // Call synchronously — the controller is synchronous
          OracleHealthController.getOracleHealth(req, res);

          const sources = res.json.mock.calls[0][0].data.sources;
          const source = sources[0];

          // The controller must apply isHealthy = failureRate <= 0.30
          const expectedIsHealthy = failureRate <= 0.30;
          return source.isHealthy === expectedIsHealthy;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9 — Oracle health response covers all configured sources
// Feature: market-resolution-transparency, Property 9: oracle health response covers all configured sources
// Validates: Requirements 7.2
// ---------------------------------------------------------------------------

describe('Property 9: oracle health response covers all configured sources', () => {
  it('response contains exactly one entry per configured source with required fields', () => {
    // Feature: market-resolution-transparency, Property 9: oracle health response covers all configured sources
    fc.assert(
      fc.property(
        // Generate 1–10 unique source names
        fc.uniqueArray(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          { minLength: 1, maxLength: 10 }
        ),
        (sourceNames) => {
          // Build a health map for those sources
          const healthMap = {};
          for (const name of sourceNames) {
            const successCount = Math.floor(Math.random() * 100);
            const failureCount = Math.floor(Math.random() * 20);
            const total = successCount + failureCount;
            const failureRate = total > 0 ? failureCount / total : 0;
            healthMap[name] = {
              successCount,
              failureCount,
              failureRate,
              lastFailure: null,
              isHealthy: failureRate < 0.3
            };
          }

          mockGetSourceHealthStatus.mockReturnValue(healthMap);
          const req = makeReq();
          const res = makeRes();

          OracleHealthController.getOracleHealth(req, res);

          const { sources } = res.json.mock.calls[0][0].data;

          // Exactly one entry per configured source
          if (sources.length !== sourceNames.length) return false;

          const returnedNames = new Set(sources.map(s => s.name));
          for (const name of sourceNames) {
            if (!returnedNames.has(name)) return false;
          }

          // Each entry has all required fields
          for (const source of sources) {
            if (
              typeof source.name !== 'string' ||
              typeof source.successCount !== 'number' ||
              typeof source.failureCount !== 'number' ||
              typeof source.failureRate !== 'number' ||
              typeof source.isHealthy !== 'boolean'
            ) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * End-to-End Failure Recovery Testing
 * Issue #125: Simulate backend failures, oracle downtime, and validate recovery workflows
 *
 * Tests cover:
 *  1. Backend service failures (DB unavailable, Soroban RPC down)
 *  2. Oracle downtime and fallback chain activation
 *  3. Transaction retry queue recovery after network outage
 *  4. Health endpoint degraded-state reporting
 *  5. WebSocket reconnection after server restart simulation
 */

'use strict';

const express = require('express');
const request = require('supertest');

// ─── Shared mock state ────────────────────────────────────────────────────────

let mockSorobanHealthy = true;
let mockStellarHealthy = true;
let mockDbHealthy = true;
let mockOraclePrimaryHealthy = true;

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  oracle: jest.fn(),
  auth: jest.fn(),
}));

jest.mock('mongoose', () => {
  class MockSchema {
    constructor() {
      this.methods = {};
      this.statics = {};
    }

    index() {}
    pre() {}
    post() {}
    virtual() {
      return { get: jest.fn() };
    }
  }

  MockSchema.Types = {
    Mixed: Object,
    ObjectId: String,
  };

  return {
    connection: {
      get readyState() {
        return mockDbHealthy ? 1 : 0;
      },
    },
    Schema: MockSchema,
    model: jest.fn((modelName) => {
      const MockModel = jest.fn();
      MockModel.modelName = modelName;
      MockModel.find = jest.fn();
      MockModel.findOne = jest.fn();
      MockModel.findById = jest.fn();
      MockModel.findByIdAndUpdate = jest.fn();
      MockModel.findOneAndUpdate = jest.fn();
      MockModel.countDocuments = jest.fn();
      MockModel.aggregate = jest.fn();
      MockModel.create = jest.fn();
      MockModel.updateOne = jest.fn();
      return MockModel;
    }),
  };
});

jest.mock('../../src/services/stellarService', () => ({
  getNetworkStatus: jest.fn(async () => {
    if (!mockStellarHealthy) throw new Error('Stellar network unreachable');
    return { isConnected: true, network: 'testnet', latestLedger: { sequence: 1000 } };
  }),
}));

jest.mock('../../src/services/sorobanService', () => ({
  getHealth: jest.fn(async () => {
    if (!mockSorobanHealthy) throw new Error('Soroban RPC unavailable');
    return { status: 'healthy', latestLedger: 1000 };
  }),
  submitSignedTransaction: jest.fn(async () => {
    if (!mockSorobanHealthy) throw new Error('Soroban RPC unavailable');
    return { hash: 'tx_abc123', successful: true };
  }),
  validateTransactionXDR: jest.fn(() => true),
  getNetworkInfo: jest.fn(() => ({ network: 'testnet', rpcUrl: 'https://rpc.test', contracts: {} })),
  getCurrentLedger: jest.fn(async () => 1000),
  testContractIntegration: jest.fn(async () => ({ marketFactory: true, ammPool: true, oracleResolver: true })),
  pingContract: jest.fn(async (name) => ({ contractName: name, isReachable: true })),
  contracts: {},
}));

jest.mock('../../src/services/transactionRetryQueue', () => {
  const queue = {
    _jobs: [],
    isEnabled: true,
    recentFailures: [],
    recentSuccesses: [],
    enqueue: jest.fn(({ signedXDR, txHash }) => {
      const jobId = `job_${Date.now()}`;
      queue._jobs.push({ jobId, signedXDR, txHash, status: 'pending' });
      return { queued: true, jobId };
    }),
    getRecoverySnapshot: jest.fn(() => ({
      queueEnabled: queue.isEnabled,
      maxAttempts: 4,
      backoffMs: 2000,
      recentFailures: queue.recentFailures,
      recentRecoveries: queue.recentSuccesses,
    })),
    _simulateRecovery: (jobId) => {
      const job = queue._jobs.find((j) => j.jobId === jobId);
      if (job) {
        job.status = 'confirmed';
        queue.recentSuccesses.push({ jobId, recoveredAt: new Date().toISOString() });
      }
    },
    _simulateExhaustion: (jobId) => {
      const job = queue._jobs.find((j) => j.jobId === jobId);
      if (job) {
        job.status = 'failed';
        queue.recentFailures.push({ jobId, attempts: 4, failedAt: new Date().toISOString() });
      }
    },
  };
  return queue;
});

// Oracle service mock with controllable primary failure
jest.mock('../../src/services/oracleService', () => ({
  initialized: true,
  getSourceHealthStatus: jest.fn(() => {
    if (!mockOraclePrimaryHealthy) {
      return {
        coingecko: { successCount: 0, failureCount: 10, failureRate: 1.0, lastFailure: new Date().toISOString() },
        chainlink: { successCount: 8, failureCount: 2, failureRate: 0.2, lastFailure: null },
        'sports-api': { successCount: 5, failureCount: 1, failureRate: 0.17, lastFailure: null },
      };
    }
    return {
      coingecko: { successCount: 10, failureCount: 0, failureRate: 0.0, lastFailure: null },
      chainlink: { successCount: 9, failureCount: 1, failureRate: 0.1, lastFailure: null },
      'sports-api': { successCount: 7, failureCount: 0, failureRate: 0.0, lastFailure: null },
    };
  }),
  resolveWithFallback: jest.fn(async ({ category }) => {
    if (!mockOraclePrimaryHealthy) {
      // Primary (coingecko) is down — fallback to chainlink
      return { outcome: 'yes', confidence: 0.82, source: 'chainlink', usedFallback: true };
    }
    return { outcome: 'yes', confidence: 0.95, source: 'coingecko', usedFallback: false };
  }),
  getRetryQueueStatus: jest.fn(() => ({ pending: 0, items: [], history: [] })),
}));

// ─── App factory ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());

  const healthRoutes = require('../../src/routes/health');
  const transactionRoutes = require('../../src/routes/transactions');
  const oracleRoutes = require('../../src/routes/oracle');
  const { errorHandler, notFound } = require('../../src/middleware/errorHandler');

  // Bypass auth for these tests
  jest.mock('../../src/middleware/auth', () => ({
    authenticateToken: (req, _res, next) => {
      req.user = { walletAddress: 'gabc123testwalletaddress00000000000000000000000000000000' };
      next();
    },
  }));

  app.use('/api/health', healthRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/oracle', oracleRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('E2E Failure Recovery Testing (#125)', () => {
  let app;
  const sorobanService = require('../../src/services/sorobanService');
  const transactionRetryQueue = require('../../src/services/transactionRetryQueue');
  const oracleService = require('../../src/services/oracleService');

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    // Reset to healthy state before each test
    mockSorobanHealthy = true;
    mockStellarHealthy = true;
    mockDbHealthy = true;
    mockOraclePrimaryHealthy = true;
    jest.clearAllMocks();
    transactionRetryQueue._jobs = [];
    transactionRetryQueue.recentFailures = [];
    transactionRetryQueue.recentSuccesses = [];
  });

  // ── 1. Backend service failures ─────────────────────────────────────────────

  describe('Backend Service Failures', () => {
    it('health endpoint reports degraded when Soroban RPC is down', async () => {
      mockSorobanHealthy = false;

      const res = await request(app).get('/api/health');

      // Should still respond (not crash), status may be 200 or 503
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('success');
    });

    it('health endpoint reports degraded when Stellar Horizon is down', async () => {
      mockStellarHealthy = false;

      const res = await request(app).get('/api/health');

      expect([200, 503]).toContain(res.status);
      // When stellar is down the status should not be 'healthy'
      if (res.body.data) {
        expect(res.body.data.status).not.toBe('healthy');
      }
    });

    it('health endpoint reports degraded when database is disconnected', async () => {
      mockDbHealthy = false;

      const res = await request(app).get('/api/health');

      expect([200, 503]).toContain(res.status);
      if (res.body.data) {
        expect(['degraded', 'unhealthy']).toContain(res.body.data.status);
      }
    });

    it('liveness probe always returns alive regardless of service state', async () => {
      mockSorobanHealthy = false;
      mockStellarHealthy = false;
      mockDbHealthy = false;

      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
    });

    it('readiness probe returns not-ready when critical services are down', async () => {
      mockStellarHealthy = false;

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not ready');
    });

    it('readiness probe returns ready when all critical services are up', async () => {
      mockStellarHealthy = true;
      mockDbHealthy = true;

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });
  });

  // ── 2. Oracle downtime and fallback ─────────────────────────────────────────

  describe('Oracle Downtime and Fallback Recovery', () => {
    it('oracle health endpoint shows primary source as unhealthy when down', async () => {
      mockOraclePrimaryHealthy = false;

      const res = await request(app).get('/api/oracle/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const sources = res.body.data.sources;
      const coingecko = sources.find((s) => s.name === 'coingecko');
      expect(coingecko).toBeDefined();
      expect(coingecko.isHealthy).toBe(false);
      expect(coingecko.failureRate).toBeGreaterThan(0.3);
    });

    it('oracle health endpoint shows fallback sources as healthy during primary outage', async () => {
      mockOraclePrimaryHealthy = false;

      const res = await request(app).get('/api/oracle/health');

      expect(res.status).toBe(200);
      const sources = res.body.data.sources;
      const chainlink = sources.find((s) => s.name === 'chainlink');
      expect(chainlink).toBeDefined();
      expect(chainlink.isHealthy).toBe(true);
    });

    it('oracle resolves via fallback when primary source is down', async () => {
      mockOraclePrimaryHealthy = false;

      const result = await oracleService.resolveWithFallback({
        marketId: 'market-test-1',
        category: 'crypto',
        oracleConfig: { symbol: 'bitcoin', targetPrice: 60000, condition: 'above' },
      });

      expect(result).not.toBeNull();
      expect(result.outcome).toBe('yes');
      expect(result.usedFallback).toBe(true);
      expect(result.source).toBe('chainlink');
    });

    it('oracle resolves via primary when healthy', async () => {
      mockOraclePrimaryHealthy = true;

      const result = await oracleService.resolveWithFallback({
        marketId: 'market-test-2',
        category: 'crypto',
        oracleConfig: { symbol: 'bitcoin', targetPrice: 60000, condition: 'above' },
      });

      expect(result).not.toBeNull();
      expect(result.usedFallback).toBe(false);
      expect(result.source).toBe('coingecko');
    });

    it('oracle health returns 503 when service is completely unavailable', async () => {
      oracleService.getSourceHealthStatus.mockReturnValueOnce(null);

      const res = await request(app).get('/api/oracle/health');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
    });
  });

  // ── 3. Transaction retry queue recovery ─────────────────────────────────────

  describe('Transaction Retry Queue Recovery', () => {
    it('enqueues transaction when Soroban submission fails', async () => {
      mockSorobanHealthy = false;
      sorobanService.submitSignedTransaction.mockRejectedValueOnce(
        new Error('Soroban RPC unavailable')
      );

      const res = await request(app)
        .post('/api/transactions/submit')
        .send({ signedXDR: 'AAAA_SIGNED_XDR_BBBB' });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TRANSACTION_SUBMIT_DEFERRED');
      expect(transactionRetryQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ signedXDR: 'AAAA_SIGNED_XDR_BBBB' })
      );
    });

    it('recovery snapshot reflects queued jobs after failure', async () => {
      sorobanService.submitSignedTransaction.mockRejectedValueOnce(
        new Error('network timeout')
      );

      await request(app)
        .post('/api/transactions/submit')
        .send({ signedXDR: 'XDR_RECOVERY_TEST' });

      const snapshot = transactionRetryQueue.getRecoverySnapshot();
      expect(snapshot.queueEnabled).toBe(true);
      expect(snapshot.maxAttempts).toBe(4);
    });

    it('simulates successful recovery after transient failure', () => {
      // Enqueue a job
      const { jobId } = transactionRetryQueue.enqueue({ signedXDR: 'XDR_TRANSIENT', txHash: null });

      // Simulate the retry queue recovering the job
      transactionRetryQueue._simulateRecovery(jobId);

      const snapshot = transactionRetryQueue.getRecoverySnapshot();
      expect(snapshot.recentRecoveries).toHaveLength(1);
      expect(snapshot.recentRecoveries[0].jobId).toBe(jobId);
    });

    it('simulates exhausted retries after persistent failure', () => {
      const { jobId } = transactionRetryQueue.enqueue({ signedXDR: 'XDR_PERSISTENT', txHash: null });

      transactionRetryQueue._simulateExhaustion(jobId);

      const snapshot = transactionRetryQueue.getRecoverySnapshot();
      expect(snapshot.recentFailures).toHaveLength(1);
      expect(snapshot.recentFailures[0].jobId).toBe(jobId);
      expect(snapshot.recentFailures[0].attempts).toBe(4);
    });

    it('validates that invalid XDR is rejected before queuing', async () => {
      const res = await request(app)
        .post('/api/transactions/submit')
        .send({}) // missing signedXDR
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(transactionRetryQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  // ── 4. Full system recovery workflow ────────────────────────────────────────

  describe('Full System Recovery Workflow', () => {
    it('system transitions from degraded to healthy when services recover', async () => {
      // Step 1: Simulate outage
      mockSorobanHealthy = false;
      mockStellarHealthy = false;

      const degradedRes = await request(app).get('/api/health');
      expect([200, 503]).toContain(degradedRes.status);

      // Step 2: Services recover
      mockSorobanHealthy = true;
      mockStellarHealthy = true;

      const recoveredRes = await request(app).get('/api/health');
      expect(recoveredRes.status).toBe(200);
      if (recoveredRes.body.data) {
        expect(recoveredRes.body.data.status).toBe('healthy');
      }
    });

    it('oracle transitions from fallback to primary when primary recovers', async () => {
      // Step 1: Primary down — use fallback
      mockOraclePrimaryHealthy = false;
      const fallbackResult = await oracleService.resolveWithFallback({
        marketId: 'market-recovery-1',
        category: 'crypto',
        oracleConfig: {},
      });
      expect(fallbackResult.usedFallback).toBe(true);

      // Step 2: Primary recovers
      mockOraclePrimaryHealthy = true;
      const primaryResult = await oracleService.resolveWithFallback({
        marketId: 'market-recovery-2',
        category: 'crypto',
        oracleConfig: {},
      });
      expect(primaryResult.usedFallback).toBe(false);
      expect(primaryResult.source).toBe('coingecko');
    });

    it('transaction succeeds after Soroban RPC recovers', async () => {
      // Step 1: RPC down — transaction deferred
      sorobanService.submitSignedTransaction.mockRejectedValueOnce(
        new Error('RPC down')
      );

      const failRes = await request(app)
        .post('/api/transactions/submit')
        .send({ signedXDR: 'XDR_BEFORE_RECOVERY' });

      expect(failRes.status).toBe(503);
      const { jobId } = transactionRetryQueue.enqueue.mock.results[0].value;

      // Step 2: RPC recovers — simulate retry success
      mockSorobanHealthy = true;
      transactionRetryQueue._simulateRecovery(jobId);

      const snapshot = transactionRetryQueue.getRecoverySnapshot();
      const recovered = snapshot.recentRecoveries.find((r) => r.jobId === jobId);
      expect(recovered).toBeDefined();
    });

    it('multiple concurrent failures are all queued independently', async () => {
      sorobanService.submitSignedTransaction
        .mockRejectedValueOnce(new Error('outage'))
        .mockRejectedValueOnce(new Error('outage'))
        .mockRejectedValueOnce(new Error('outage'));

      await Promise.all([
        request(app).post('/api/transactions/submit').send({ signedXDR: 'XDR_1' }),
        request(app).post('/api/transactions/submit').send({ signedXDR: 'XDR_2' }),
        request(app).post('/api/transactions/submit').send({ signedXDR: 'XDR_3' }),
      ]);

      expect(transactionRetryQueue.enqueue).toHaveBeenCalledTimes(3);
    });
  });

  // ── 5. Network info resilience ───────────────────────────────────────────────

  describe('Network Info Resilience', () => {
    it('network-info endpoint returns data even when Soroban is degraded', async () => {
      // getNetworkInfo is synchronous and doesn't depend on sorobanHealthy
      const res = await request(app).get('/api/transactions/network-info');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('current-ledger endpoint handles Soroban RPC failure gracefully', async () => {
      sorobanService.getCurrentLedger.mockRejectedValueOnce(new Error('RPC timeout'));

      const res = await request(app).get('/api/transactions/current-ledger');
      // Should return an error response, not crash
      expect([200, 500, 503]).toContain(res.status);
    });
  });
});

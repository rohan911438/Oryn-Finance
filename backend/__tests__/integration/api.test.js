const express = require('express');
const request = require('supertest');

const mockValidWallet = `G${'A'.repeat(55)}`;

const mockMarketSave = jest.fn();
const MockMarket = jest.fn(function MockMarket(data) {
  Object.assign(this, data);
  this.save = mockMarketSave;
});
MockMarket.findOne = jest.fn();
MockMarket.countDocuments = jest.fn();
MockMarket.aggregate = jest.fn();

const MockUser = { countDocuments: jest.fn() };
const MockTrade = { countDocuments: jest.fn(), aggregate: jest.fn() };

jest.mock('stellar-sdk', () => ({
  StrKey: {
    isValidEd25519PublicKey: jest.fn((value) => typeof value === 'string' && value.length === 56 && value.startsWith('G'))
  },
  Keypair: {
    fromPublicKey: jest.fn((value) => ({ publicKey: () => value }))
  }
}));

jest.mock('mongoose', () => ({
  connection: { readyState: 1 }
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  auth: jest.fn()
}));

jest.mock('../../src/services/stellarService', () => ({
  getNetworkStatus: jest.fn(),
  contracts: {
    MARKET_FACTORY: 'FACTORY_CONTRACT',
    AMM_POOL: 'AMM_CONTRACT',
    ORACLE_RESOLVER: 'ORACLE_CONTRACT',
    GOVERNANCE: 'GOV_CONTRACT',
    REPUTATION: 'REP_CONTRACT'
  }
}));

jest.mock('../../src/services/sorobanService', () => ({
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
    MARKET_FACTORY: 'FACTORY_CONTRACT',
    AMM_POOL: 'AMM_CONTRACT',
    ORACLE_RESOLVER: 'ORACLE_CONTRACT',
    GOVERNANCE: 'GOV_CONTRACT',
    REPUTATION: 'REP_CONTRACT'
  }
}));

jest.mock('../../src/services/transactionRetryQueue', () => ({
  enqueue: jest.fn(),
  getRecoverySnapshot: jest.fn()
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = {
      walletAddress: mockValidWallet.toLowerCase(),
      userAddress: mockValidWallet.toLowerCase()
    };
    next();
  }
}));

jest.mock('../../src/models', () => ({
  Market: MockMarket,
  User: MockUser,
  Trade: MockTrade
}));

const stellarService = require('../../src/services/stellarService');
const sorobanService = require('../../src/services/sorobanService');
const transactionRetryQueue = require('../../src/services/transactionRetryQueue');
const transactionRoutes = require('../../src/routes/transactions');
const healthRoutes = require('../../src/routes/health');
const { errorHandler, notFound } = require('../../src/middleware/errorHandler');

describe('API integration coverage', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionRoutes);
    app.use('/api/health', healthRoutes);
    app.use(notFound);
    app.use(errorHandler);

    MockMarket.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        marketId: 'market-1',
        currentYesPrice: 0.61,
        currentNoPrice: 0.39,
        metadata: { contractAddress: 'CONTRACT-1' }
      })
    });
    mockMarketSave.mockResolvedValue({
      marketId: 'created-market-1'
    });
    MockMarket.countDocuments.mockResolvedValue(2);
    MockUser.countDocuments.mockResolvedValue(3);
    MockTrade.countDocuments.mockResolvedValue(4);
    MockTrade.aggregate.mockResolvedValue([{ total: 42 }]);

    stellarService.getNetworkStatus.mockResolvedValue({
      isConnected: true,
      network: 'testnet',
      latestLedger: { sequence: 999 }
    });
    sorobanService.buildBuyTokensXDR.mockResolvedValue({
      xdr: 'BUY_XDR',
      fees: '100',
      simulation: { ok: true }
    });
    sorobanService.validateTransactionXDR.mockReturnValue(true);
    sorobanService.getNetworkInfo.mockReturnValue({
      network: 'testnet',
      rpcUrl: 'https://rpc.test',
      contracts: sorobanService.contracts
    });
    sorobanService.getCurrentLedger.mockResolvedValue(999);
    sorobanService.getHealth.mockResolvedValue({
      status: 'healthy',
      latestLedger: 999
    });
    sorobanService.testContractIntegration.mockResolvedValue({
      marketFactory: true,
      ammPool: true,
      oracleResolver: false
    });
    sorobanService.pingContract.mockImplementation(async (name) => ({
      contractName: name,
      isReachable: name !== 'REPUTATION'
    }));
    transactionRetryQueue.enqueue.mockReturnValue({
      queued: true,
      jobId: 'job-1'
    });
    transactionRetryQueue.getRecoverySnapshot.mockReturnValue({
      queueEnabled: true
    });
  });

  it('returns live network information from the real transaction route', async () => {
    const response = await request(app)
      .get('/api/transactions/network-info')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        network: 'testnet',
        rpcUrl: 'https://rpc.test',
        contracts: sorobanService.contracts
      }
    });
  });

  it('builds a buy-token XDR from current market state', async () => {
    const response = await request(app)
      .post('/api/transactions/build/buy-tokens')
      .set('Authorization', `Bearer ${mockValidWallet}`)
      .send({
        marketId: 'market-1',
        tokenType: 'yes',
        amount: 10
      })
      .expect(200);

    expect(sorobanService.buildBuyTokensXDR).toHaveBeenCalledWith(
      mockValidWallet.toLowerCase(),
      'CONTRACT-1',
      'yes',
      10,
      0.61
    );
    expect(response.body.data.xdr).toBe('BUY_XDR');
  });

  it('defers submission retries when direct network submission fails', async () => {
    sorobanService.submitSignedTransaction.mockRejectedValue(new Error('temporary outage'));

    const response = await request(app)
      .post('/api/transactions/submit')
      .send({ signedXDR: 'SIGNED_XDR' })
      .expect(503);

    expect(transactionRetryQueue.enqueue).toHaveBeenCalledWith({
      signedXDR: 'SIGNED_XDR',
      txHash: null
    });
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'TRANSACTION_SUBMIT_DEFERRED',
        message: 'temporary outage',
        retry: {
          queued: true,
          jobId: 'job-1'
        }
      }
    });
  });

  it('rejects invalid transaction payloads through validation middleware', async () => {
    const response = await request(app)
      .post('/api/transactions/submit')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns the current ledger through the live transaction route', async () => {
    const response = await request(app)
      .get('/api/transactions/current-ledger')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        currentLedger: 999,
        timestamp: expect.any(String)
      }
    });
  });

  it('summarizes deployed smart-contract connectivity from the health route', async () => {
    const response = await request(app)
      .get('/api/health/contracts')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.summary).toEqual({
      totalContracts: 5,
      reachableContracts: 4,
      workingContracts: 2
    });
    expect(sorobanService.pingContract).toHaveBeenCalledTimes(5);
  });
});

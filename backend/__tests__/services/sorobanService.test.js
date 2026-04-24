const mockServer = {
  serverURL: { href: 'https://soroban-testnet.stellar.org' },
  getAccount: jest.fn(),
  simulateTransaction: jest.fn(),
  sendTransaction: jest.fn(),
  getTransaction: jest.fn(),
  getEvents: jest.fn(),
  getHealth: jest.fn(),
  getContractWasmByContractId: jest.fn()
};

const mockContractCall = jest.fn().mockReturnValue({ type: 'mock-op' });

const mockBuilderInstance = {
  addOperation: jest.fn().mockReturnThis(),
  setTimeout: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue({
    toXDR: () => 'unsigned-xdr'
  })
};

const mockFromXdr = jest.fn();
const mockScValToNative = jest.fn();

jest.mock('stellar-sdk', () => {
  function MockContract() {}
  MockContract.prototype.call = mockContractCall;
  function MockTransactionBuilder() {
    return mockBuilderInstance;
  }
  MockTransactionBuilder.fromXDR = mockFromXdr;
  function MockAccount(accountId, sequence) {
    this.accountId = accountId;
    this.sequence = sequence;
  }

  return {
    SorobanRpc: {
      Server: jest.fn(() => mockServer),
      Api: {
        isSimulationError: jest.fn((simulation) => Boolean(simulation.error))
      },
      assembleTransaction: jest.fn(() => ({
        toXDR: () => 'assembled-xdr'
      }))
    },
    Contract: MockContract,
    TransactionBuilder: MockTransactionBuilder,
    BASE_FEE: '100',
    Keypair: {
      random: jest.fn(() => ({
        publicKey: () => 'GDUMMYACCOUNT'
      }))
    },
    Account: MockAccount,
    scValToNative: mockScValToNative,
    xdr: {
      ScVal: {
        scvVoid: jest.fn(() => 'VOID')
      }
    }
  };
});

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../src/config/contracts', () => ({
  getNetworkConfig: jest.fn(() => ({
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015'
  })),
  CURRENT_NETWORK: 'testnet',
  DEPLOYED_CONTRACTS: {
    MARKET_FACTORY: 'FACTORY_CONTRACT',
    PREDICTION_MARKET_TEMPLATE: 'MARKET_TEMPLATE',
    AMM_POOL: 'AMM_CONTRACT',
    ORACLE_RESOLVER: 'ORACLE_CONTRACT'
  },
  XDR_HELPERS: {
    toXdr: {
      address: jest.fn((value) => `addr:${value}`),
      string: jest.fn((value) => `str:${value}`),
      number: jest.fn((value) => `num:${value}`),
      boolean: jest.fn((value) => `bool:${value}`),
      bytes: jest.fn((value) => `bytes:${value}`)
    }
  },
  getContractAddress: jest.fn((name) => ({
    MARKET_FACTORY: 'FACTORY_CONTRACT',
    PREDICTION_MARKET_TEMPLATE: 'MARKET_TEMPLATE',
    AMM_POOL: 'AMM_CONTRACT',
    ORACLE_RESOLVER: 'ORACLE_CONTRACT'
  }[name])),
  getContractFunction: jest.fn((_contract, functionName) => functionName),
  validateAllContracts: jest.fn(() => true)
}));

const contractConfig = require('../../src/config/contracts');
const sorobanService = require('../../src/services/sorobanService');

describe('SorobanService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServer.serverURL.href = 'https://soroban-testnet.stellar.org';
    mockServer.getAccount.mockResolvedValue({ id: 'GUSER', sequence: '123' });
    mockServer.simulateTransaction.mockResolvedValue({
      minResourceFee: '250',
      result: { retval: 'RETVAL' }
    });
    mockServer.sendTransaction.mockResolvedValue({
      status: 'SUCCESS',
      hash: 'tx-hash'
    });
    mockServer.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      hash: 'tx-hash'
    });
    mockServer.getEvents.mockResolvedValue({ events: [] });
    mockServer.getHealth.mockResolvedValue({
      latestLedger: 998,
      status: 'healthy'
    });
    mockServer.getContractWasmByContractId.mockResolvedValue('wasm-id');
    mockFromXdr.mockReturnValue({ signed: true });
    mockScValToNative.mockReturnValue({ marketId: 'market-1' });
    const StellarSdk = require('stellar-sdk');
    StellarSdk.TransactionBuilder.fromXDR = mockFromXdr;
    StellarSdk.Keypair.random.mockReturnValue({
      publicKey: () => 'GDUMMYACCOUNT'
    });
    StellarSdk.xdr.ScVal.scvVoid.mockReturnValue('VOID');
    sorobanService.xdrHelpers = {
      toXdr: {
        address: jest.fn((value) => `addr:${value}`),
        string: jest.fn((value) => `str:${value}`),
        number: jest.fn((value) => `num:${value}`),
        boolean: jest.fn((value) => `bool:${value}`),
        bytes: jest.fn((value) => `bytes:${value}`)
      }
    };
  });

  it('polls pending signed submissions until a final status is available', async () => {
    const finalResult = { status: 'SUCCESS', hash: 'final-hash' };
    jest.spyOn(sorobanService, 'pollTransactionStatus').mockResolvedValueOnce(finalResult);
    mockServer.sendTransaction.mockResolvedValueOnce({
      status: 'PENDING',
      hash: 'pending-hash'
    });

    const result = await sorobanService.submitSignedTransaction('SIGNED_XDR');

    expect(mockFromXdr).toHaveBeenCalledWith('SIGNED_XDR', 'Test SDF Network ; September 2015');
    expect(sorobanService.pollTransactionStatus).toHaveBeenCalledWith('pending-hash');
    expect(result).toBe(finalResult);
  });

  it('builds a create-market contract flow with optional token placeholders', async () => {
    const buildSpy = jest.spyOn(sorobanService, 'buildContractInvocationXDR').mockResolvedValueOnce({
      xdr: 'assembled-xdr'
    });

    await sorobanService.buildCreateMarketXDR('GCREATOR', {
      question: 'Will Oryn ship?',
      category: 'crypto',
      expiryTimestamp: 1800000000,
      initialLiquidity: 1000,
      marketContract: 'GMARKET',
      poolAddress: 'GPOOL',
      yesToken: null,
      noToken: null
    });

    expect(buildSpy).toHaveBeenCalledWith(
      'GCREATOR',
      'MARKET_FACTORY',
      'createMarket',
      expect.arrayContaining(['addr:GCREATOR', 'str:Will Oryn ship?', 'VOID'])
    );
  });

  it('delegates read-only market queries through queryContract', async () => {
    const querySpy = jest.spyOn(sorobanService, 'queryContract').mockResolvedValueOnce({
      result: { marketId: 'market-1' }
    });

    const result = await sorobanService.getMarketData(7);

    expect(querySpy).toHaveBeenCalledWith('MARKET_FACTORY', 'getMarket', ['num:7']);
    expect(result).toEqual({ result: { marketId: 'market-1' } });
  });

  it('fetches all recent events across contracts in ledger order', async () => {
    jest.spyOn(sorobanService, 'getContractEvents')
      .mockResolvedValueOnce([{ ledger: 12, contractId: 'b' }])
      .mockResolvedValueOnce([{ ledger: 3, contractId: 'a' }])
      .mockResolvedValueOnce([{ ledger: 8, contractId: 'c' }])
      .mockRejectedValueOnce(new Error('skip failure'));

    sorobanService.contracts = {
      MARKET_FACTORY: 'FACTORY_CONTRACT',
      PREDICTION_MARKET_TEMPLATE: 'MARKET_TEMPLATE',
      AMM_POOL: 'AMM_CONTRACT',
      ORACLE_RESOLVER: 'ORACLE_CONTRACT'
    };

    const events = await sorobanService.getAllRecentEvents(100);

    expect(events.map((event) => event.ledger)).toEqual([3, 8, 12]);
  });

  it('returns network metadata from the configured RPC server', () => {
    expect(sorobanService.getNetworkInfo()).toEqual({
      network: 'testnet',
      passphrase: 'Test SDF Network ; September 2015',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      contracts: sorobanService.contracts
    });
  });

  it('reports unhealthy status when the RPC health check fails', async () => {
    mockServer.getHealth.mockRejectedValueOnce(new Error('rpc down'));

    const result = await sorobanService.getHealth();

    expect(result).toEqual({
      isConnected: false,
      error: 'rpc down',
      network: 'testnet'
    });
  });

  it('tests contract integration by probing configured read-only methods', async () => {
    const querySpy = jest.spyOn(sorobanService, 'queryContract')
      .mockResolvedValueOnce({ result: 3 })
      .mockResolvedValueOnce({ result: { pool: true } })
      .mockRejectedValueOnce(new Error('oracle offline'));

    sorobanService.contracts = {
      MARKET_FACTORY: 'FACTORY_CONTRACT',
      AMM_POOL: 'AMM_CONTRACT',
      ORACLE_RESOLVER: 'ORACLE_CONTRACT'
    };

    const result = await sorobanService.testContractIntegration();

    expect(querySpy).toHaveBeenNthCalledWith(1, 'MARKET_FACTORY', 'getMarketCount', []);
    expect(querySpy).toHaveBeenNthCalledWith(2, 'AMM_POOL', 'getPoolInfo', []);
    expect(querySpy).toHaveBeenNthCalledWith(3, 'ORACLE_RESOLVER', 'getStatus', []);
    expect(result).toEqual({
      marketFactory: true,
      predictionMarket: false,
      ammPool: true,
      oracleResolver: false,
      errors: ['Oracle Resolver: oracle offline']
    });
  });
});

// Test setup and global mocks
const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  oracle: jest.fn()
};

// Mock mongoose
jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(true),
  connection: {
    close: jest.fn().mockResolvedValue(true)
  },
  Schema: class MockSchema {
    constructor() {}
  },
  model: jest.fn()
}));

// Mock config modules
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  oracle: jest.fn()
}));

jest.mock('../src/config/contracts', () => ({
  getNetworkConfig: jest.fn().mockReturnValue({
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org'
  }),
  CURRENT_NETWORK: 'testnet',
  DEPLOYED_CONTRACTS: {},
  XDR_HELPERS: {},
  getContractAddress: jest.fn().mockReturnValue('CA7D3F7B7D3F7B7D3F7B7D3F7B7D3F7B7D3F'),
  getContractFunction: jest.fn().mockReturnValue('test_function'),
  validateAllContracts: jest.fn().mockReturnValue(true)
}));

jest.mock('../src/config/database', () => ({
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true)
}));

// Global test utilities
global.testUtils = {
  createMockRequest: (overrides = {}) => ({
    params: {},
    query: {},
    body: {},
    user: null,
    headers: {},
    ...overrides
  }),
  createMockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    return res;
  },
  createMockUser: (overrides = {}) => ({
    _id: 'user123',
    walletAddress: 'GABC123456789',
    email: 'test@example.com',
    createdAt: new Date(),
    ...overrides
  }),
  createMockMarket: (overrides = {}) => ({
    _id: 'market123',
    marketId: 'MKT001',
    question: 'Will BTC reach $100k by 2025?',
    description: 'Test market description',
    category: 'crypto',
    status: 'active',
    endDate: new Date('2025-12-31'),
    resolutionDate: new Date('2026-01-01'),
    outcomes: [
      { id: 'yes', label: 'Yes', probability: 0.5 },
      { id: 'no', label: 'No', probability: 0.5 }
    ],
    totalVolume: 10000,
    ...overrides
  })
};

// Suppress console during tests unless verbose
const originalConsole = global.console;
beforeAll(() => {
  if (!process.env.VERBOSE_TEST) {
    global.console = {
      ...originalConsole,
      log: jest.fn(),
      debug: jest.fn()
    };
  }
});

afterAll(() => {
  global.console = originalConsole;
});
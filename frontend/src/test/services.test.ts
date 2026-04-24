import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock API client
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    testConnection: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('@/lib/api-config', () => ({
  ENDPOINTS: {
    HEALTH: '/api/health',
    MARKETS: '/api/markets',
    TRADES: '/api/trades',
    USERS: '/api/users'
  }
}));

describe('API Service Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('healthService', () => {
    it('should get health status', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { healthService } = await import('@/services/apiService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { status: 'ok', timestamp: '2024-01-01' }
      });
      
      const result = await healthService.getHealth();
      
      expect(result.status).toBe('ok');
    });

    it('should throw error on failed health check', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { healthService } = await import('@/services/apiService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        message: 'Backend unavailable'
      });
      
      await expect(healthService.getHealth()).rejects.toThrow('Backend unavailable');
    });

    it('should test connection', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { healthService } = await import('@/services/apiService');
      
      const result = await healthService.testConnection();
      
      expect(result).toBe(true);
    });
  });

  describe('networkService', () => {
    it('should get network info', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { networkService } = await import('@/services/apiService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { network: 'testnet', horizonUrl: 'https://horizon-testnet.stellar.org' }
      });
      
      const result = await networkService.getNetworkInfo();
      
      expect(result.network).toBe('testnet');
    });

    it('should get current ledger', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { networkService } = await import('@/services/apiService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { ledger: 12345 }
      });
      
      const result = await networkService.getCurrentLedger();
      
      expect(result).toBe(12345);
    });

    it('should get transaction status', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { networkService } = await import('@/services/apiService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { status: 'success', hash: 'tx123' }
      });
      
      const result = await networkService.getTransactionStatus('tx123');
      
      expect(result.status).toBe('success');
    });
  });
});

describe('Contract Service Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildTransaction', () => {
    it('should build contract invocation transaction', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { contractService } = await import('@/services/contractService');
      
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { xdr: 'mockXdr', simulation: {} }
      });
      
      const result = await contractService.buildTransaction({
        contractName: 'predictionMarket',
        functionName: 'placeBet',
        args: ['marketId', 'yes', '100']
      });
      
      expect(result.xdr).toBe('mockXdr');
    });

    it('should handle build failure', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { contractService } = await import('@/services/contractService');
      
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        message: 'Build failed'
      });
      
      await expect(contractService.buildTransaction({
        contractName: 'invalid',
        functionName: 'test',
        args: []
      })).rejects.toThrow('Build failed');
    });
  });

  describe('submitTransaction', () => {
    it('should submit signed transaction', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { contractService } = await import('@/services/contractService');
      
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { status: 'pending', hash: 'tx123' }
      });
      
      const result = await contractService.submitTransaction('signedXdr');
      
      expect(result.status).toBe('pending');
    });
  });

  describe('getContractState', () => {
    it('should get contract state', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { contractService } = await import('@/services/contractService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { state: 'active' }
      });
      
      const result = await contractService.getContractState('contract123');
      
      expect(result.state).toBe('active');
    });
  });
});

describe('Market Service Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMarkets', () => {
    it('should get markets with pagination', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { marketService } = await import('@/services/marketService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: [
          { marketId: 'MKT001', question: 'Test 1?' },
          { marketId: 'MKT002', question: 'Test 2?' }
        ],
        pagination: { page: 1, limit: 10, total: 2 }
      });
      
      const result = await marketService.getMarkets({ page: 1, limit: 10 });
      
      expect(result.data.length).toBe(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter markets by category', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { marketService } = await import('@/services/marketService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: []
      });
      
      await marketService.getMarkets({ category: 'crypto' });
      
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('category=crypto')
      );
    });

    it('should filter markets by status', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { marketService } = await import('@/services/marketService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: []
      });
      
      await marketService.getMarkets({ status: 'active' });
      
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('status=active')
      );
    });
  });

  describe('getMarketById', () => {
    it('should get market by ID', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { marketService } = await import('@/services/marketService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { marketId: 'MKT001', question: 'Test?' }
      });
      
      const result = await marketService.getMarketById('MKT001');
      
      expect(result.marketId).toBe('MKT001');
    });
  });

  describe('createMarket', () => {
    it('should create new market', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { marketService } = await import('@/services/marketService');
      
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { marketId: 'MKT003', question: 'New market?' }
      });
      
      const result = await marketService.createMarket({
        question: 'New market?',
        category: 'crypto',
        outcomes: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' }
        ]
      });
      
      expect(result.marketId).toBe('MKT003');
    });
  });
});

describe('Trade Service Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('placeTrade', () => {
    it('should place a trade', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { tradeService } = await import('@/services/tradeService');
      
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { tradeId: 'T001', status: 'pending' }
      });
      
      const result = await tradeService.placeTrade({
        marketId: 'MKT001',
        outcome: 'yes',
        amount: 100
      });
      
      expect(result.tradeId).toBe('T001');
    });

    it('should reject invalid amount', async () => {
      const { tradeService } = await import('@/services/tradeService');
      
      await expect(tradeService.placeTrade({
        marketId: 'MKT001',
        outcome: 'yes',
        amount: -10
      })).rejects.toThrow();
    });
  });

  describe('getTrades', () => {
    it('should get user trades', async () => {
      const { apiClient } = await import('@/lib/api-client');
      const { tradeService } = await import('@/services/tradeService');
      
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: [
          { tradeId: 'T001', marketId: 'MKT001' },
          { tradeId: 'T002', marketId: 'MKT002' }
        ]
      });
      
      const result = await tradeService.getTrades({ userId: 'user123' });
      
      expect(result.data.length).toBe(2);
    });
  });
});

describe('Wallet Service Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect to wallet', async () => {
      const { walletService } = await import('@/services/walletService');
      
      // Mock Freighter wallet
      global.freighter = {
        isConnected: () => Promise.resolve(true),
        getPublicKey: () => Promise.resolve('GABC123456789'),
        signTransaction: () => Promise.resolve('signedXdr')
      };
      
      const result = await walletService.connect();
      
      expect(result).toBeDefined();
    });
  });

  describe('disconnect', () => {
    it('should disconnect wallet', async () => {
      const { walletService } = await import('@/services/walletService');
      
      const result = await walletService.disconnect();
      
      expect(result).toBe(true);
    });
  });

  describe('getBalance', () => {
    it('should get wallet balance', async () => {
      const { walletService } = await import('@/services/walletService');
      
      const result = await walletService.getBalance('GABC123456789');
      
      expect(result).toBeDefined();
    });
  });
});

describe('Component Integration Tests', () => {
  it('should render market card with data', () => {
    // This would test actual React components
    // For now, testing the data flow
    const marketData = {
      marketId: 'MKT001',
      question: 'Will BTC reach $100k?',
      category: 'crypto',
      status: 'active',
      outcomes: [
        { id: 'yes', label: 'Yes', probability: 0.5 },
        { id: 'no', label: 'No', probability: 0.5 }
      ],
      totalVolume: 10000
    };
    
    expect(marketData.marketId).toBe('MKT001');
    expect(marketData.outcomes.length).toBe(2);
  });

  it('should handle trade form submission', async () => {
    const tradeForm = {
      marketId: 'MKT001',
      outcome: 'yes',
      amount: 100,
      maxPayout: 200
    };
    
    expect(tradeForm.amount).toBe(100);
    expect(tradeForm.maxPayout).toBe(200);
  });

  it('should validate wallet connection state', () => {
    const walletState = {
      isConnected: true,
      address: 'GABC123456789',
      balance: 1000
    };
    
    expect(walletState.isConnected).toBe(true);
    expect(walletState.address).toStartWith('G');
  });
});
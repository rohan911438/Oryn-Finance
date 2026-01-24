import { apiClient } from '@/lib/api-client';
import { ENDPOINTS, ApiResponse, HealthResponse, NetworkInfo, TransactionBuildResponse } from '@/lib/api-config';

// Health & Status Services
export const healthService = {
  // Check backend health
  async getHealth(): Promise<HealthResponse> {
    const response = await apiClient.get<HealthResponse>(ENDPOINTS.HEALTH);
    if (!response.success) {
      throw new Error(response.message || 'Failed to get health status');
    }
    return response.data!;
  },

  // Check contract integration status
  async getContractsHealth(): Promise<any> {
    const response = await apiClient.get(ENDPOINTS.HEALTH_CONTRACTS);
    if (!response.success) {
      throw new Error(response.message || 'Failed to get contracts status');
    }
    return response.data;
  },

  // Test backend connectivity
  async testConnection() {
    return apiClient.testConnection();
  },
};

// Network & Transaction Services
export const networkService = {
  // Get network information
  async getNetworkInfo(): Promise<NetworkInfo> {
    const response = await apiClient.get<NetworkInfo>(ENDPOINTS.NETWORK_INFO);
    if (!response.success) {
      throw new Error(response.message || 'Failed to get network info');
    }
    return response.data!;
  },

  // Get current ledger
  async getCurrentLedger(): Promise<number> {
    const response = await apiClient.get<{ ledger: number }>(ENDPOINTS.CURRENT_LEDGER);
    if (!response.success) {
      throw new Error(response.message || 'Failed to get current ledger');
    }
    return response.data!.ledger;
  },

  // Get transaction status
  async getTransactionStatus(txHash: string): Promise<any> {
    const response = await apiClient.get(ENDPOINTS.TRANSACTION_STATUS(txHash));
    if (!response.success) {
      throw new Error(response.message || 'Failed to get transaction status');
    }
    return response.data;
  },
};

// Transaction Building Services
export const transactionService = {
  // Build create market transaction
  async buildCreateMarket(data: {
    question: string;
    category: string;
    expiryTimestamp: number;
    initialLiquidity: number;
    marketContract?: string;
    poolAddress?: string;
    yesToken?: string;
    noToken?: string;
  }, walletAddress: string): Promise<TransactionBuildResponse> {
    // Use wallet address directly as auth token (testing mode)
    apiClient.setAuthToken(walletAddress);
    
    const response = await apiClient.post<TransactionBuildResponse>(ENDPOINTS.BUILD_CREATE_MARKET, data);
    if (!response.success) {
      throw new Error(response.message || 'Failed to build create market transaction');
    }
    return response.data!;
  },

  // Build buy tokens transaction
  async buildBuyTokens(data: {
    marketId: string;
    tokenType: 'yes' | 'no';
    amount: number;
    maxSlippage?: number;
  }, authToken: string): Promise<TransactionBuildResponse> {
    apiClient.setAuthToken(authToken);
    const response = await apiClient.post<TransactionBuildResponse>(ENDPOINTS.BUILD_BUY_TOKENS, data);
    if (!response.success) {
      throw new Error(response.message || 'Failed to build buy tokens transaction');
    }
    return response.data!;
  },

  // Build sell tokens transaction
  async buildSellTokens(data: {
    marketId: string;
    tokenType: 'yes' | 'no';
    amount: number;
    maxSlippage?: number;
  }, authToken: string): Promise<TransactionBuildResponse> {
    apiClient.setAuthToken(authToken);
    const response = await apiClient.post<TransactionBuildResponse>(ENDPOINTS.BUILD_SELL_TOKENS, data);
    if (!response.success) {
      throw new Error(response.message || 'Failed to build sell tokens transaction');
    }
    return response.data!;
  },

  // Build swap transaction
  async buildSwap(data: {
    fromToken: string;
    toToken: string;
    amount: number;
    maxSlippage?: number;
  }, authToken: string): Promise<TransactionBuildResponse> {
    apiClient.setAuthToken(authToken);
    const response = await apiClient.post<TransactionBuildResponse>(ENDPOINTS.BUILD_SWAP, data);
    if (!response.success) {
      throw new Error(response.message || 'Failed to build swap transaction');
    }
    return response.data!;
  },

  // Submit signed transaction
  async submitTransaction(data: {
    xdr: string;
    networkPassphrase?: string;
  }): Promise<any> {
    const response = await apiClient.post(ENDPOINTS.SUBMIT_TRANSACTION, data);
    if (!response.success) {
      throw new Error(response.message || 'Failed to submit transaction');
    }
    return response.data;
  },
};

// Market Services
export const marketService = {
  // Get all markets
  async getMarkets(filters?: {
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    
    const endpoint = queryParams.toString() 
      ? `${ENDPOINTS.MARKETS}?${queryParams}`
      : ENDPOINTS.MARKETS;
      
    const response = await apiClient.get<any>(endpoint);
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch markets');
    }
    
    // Return the nested data structure from the API
    return response.data;
  },

  // Get market by ID
  async getMarket(id: string): Promise<any> {
    const response = await apiClient.get(ENDPOINTS.MARKET_DETAIL(id));
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch market');
    }
    return response.data;
  },

  // Get market trades
  async getMarketTrades(id: string): Promise<any[]> {
    const response = await apiClient.get<any[]>(ENDPOINTS.MARKET_TRADES(id));
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch market trades');
    }
    return response.data!;
  },
};

// User Services
export const userService = {
  // Get user profile
  async getProfile(authToken: string): Promise<any> {
    apiClient.setAuthToken(authToken);
    const response = await apiClient.get(ENDPOINTS.USER_PROFILE);
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch user profile');
    }
    return response.data;
  },

  // Update user profile
  async updateProfile(data: any, authToken: string): Promise<any> {
    apiClient.setAuthToken(authToken);
    const response = await apiClient.put(ENDPOINTS.USER_PROFILE, data);
    if (!response.success) {
      throw new Error(response.message || 'Failed to update profile');
    }
    return response.data;
  },

  // Get user by wallet address
  async getUserByAddress(address: string): Promise<any> {
    const response = await apiClient.get(ENDPOINTS.USER_BY_ADDRESS(address));
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch user data');
    }
    return response.data;
  },
};

// Leaderboard Services
export const leaderboardService = {
  // Get leaderboard
  async getLeaderboard(timeFrame?: string): Promise<any[]> {
    const endpoint = timeFrame 
      ? `${ENDPOINTS.LEADERBOARD}?timeFrame=${timeFrame}`
      : ENDPOINTS.LEADERBOARD;
      
    const response = await apiClient.get<any[]>(endpoint);
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch leaderboard');
    }
    return response.data!;
  },
};

// Combined API service object
export const apiService = {
  health: healthService,
  network: networkService,
  transactions: transactionService,
  markets: marketService,
  users: userService,
  leaderboard: leaderboardService,
};
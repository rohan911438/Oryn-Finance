import { apiService } from './apiService';

// Contract interaction service that uses the backend API
export class ContractService {
  // Test contract connectivity
  static async testContractIntegration() {
    try {
      const health = await apiService.health.getContractsHealth();
      return {
        success: true,
        data: health
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Contract test failed'
      };
    }
  }

  // Get network information
  static async getNetworkInfo() {
    try {
      const networkInfo = await apiService.network.getNetworkInfo();
      return {
        success: true,
        data: networkInfo
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get network info'
      };
    }
  }

  // Create a market
  static async createMarket(marketData: {
    question: string;
    category: string;
    expiryTimestamp: number;
    initialLiquidity: number;
  }, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildCreateMarket(marketData, authToken);
      return {
        success: true,
        data: xdrData
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create market'
      };
    }
  }

  // Buy prediction tokens
  static async buyTokens(tradeData: {
    marketId: string;
    tokenType: 'yes' | 'no';
    amount: number;
    maxSlippage?: number;
  }, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildBuyTokens(tradeData, authToken);
      return {
        success: true,
        data: xdrData
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to buy tokens'
      };
    }
  }

  // Sell prediction tokens
  static async sellTokens(tradeData: {
    marketId: string;
    tokenType: 'yes' | 'no';
    amount: number;
    maxSlippage?: number;
  }, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildSellTokens(tradeData, authToken);
      return {
        success: true,
        data: xdrData
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sell tokens'
      };
    }
  }

  // Submit a signed transaction
  static async submitTransaction(signedXDR: string, networkPassphrase?: string) {
    try {
      const result = await apiService.transactions.submitTransaction({
        xdr: signedXDR,
        networkPassphrase
      });
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit transaction'
      };
    }
  }
}

export default ContractService;
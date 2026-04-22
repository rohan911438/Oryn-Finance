import { apiService } from './apiService';

// Contract interaction service that uses the backend API
export class ContractService {
  static async signAndSubmit(
    xdr: string,
    signTransaction: (xdr: string) => Promise<string>
  ) {
    const signedXDR = await signTransaction(xdr);
    return apiService.transactions.submitSignedTransaction({ signedXdr: signedXDR });
  }

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
  }, signTransaction: (xdr: string) => Promise<string>, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildCreateMarket(marketData, authToken);
      const result = await this.signAndSubmit(xdrData.xdr, signTransaction);
      return {
        success: true,
        data: result
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
  }, signTransaction: (xdr: string) => Promise<string>, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildBuyTokens(tradeData, authToken);
      const result = await this.signAndSubmit(xdrData.xdr, signTransaction);
      return {
        success: true,
        data: result
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
  }, signTransaction: (xdr: string) => Promise<string>, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildSellTokens(tradeData, authToken);
      const result = await this.signAndSubmit(xdrData.xdr, signTransaction);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sell tokens'
      };
    }
  }

  // Claim market winnings
  static async claimWinnings(marketId: string, signTransaction: (xdr: string) => Promise<string>, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildClaimWinnings({ marketId }, authToken);
      const result = await this.signAndSubmit(xdrData.xdr, signTransaction);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to claim winnings'
      };
    }
  }

  // Swap tokens in AMM
  static async swapTokens(fromToken: string, toToken: string, amountIn: number, minAmountOut: number, signTransaction: (xdr: string) => Promise<string>, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildSwap({ fromToken, toToken, amount: amountIn, maxSlippage: minAmountOut }, authToken);
      const result = await this.signAndSubmit(xdrData.xdr, signTransaction);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to swap tokens'
      };
    }
  }

  // Add liquidity
  static async addLiquidity(tokenA: string, tokenB: string, amountA: number, amountB: number, signTransaction: (xdr: string) => Promise<string>, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildAddLiquidity({ tokenA, tokenB, amountA, amountB }, authToken);
      const result = await this.signAndSubmit(xdrData.xdr, signTransaction);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add liquidity'
      };
    }
  }

  // Stake governance tokens
  static async stakeTokens(amount: number, lockPeriod: number, signTransaction: (xdr: string) => Promise<string>, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildStake({ amount, lockPeriod }, authToken);
      const result = await this.signAndSubmit(xdrData.xdr, signTransaction);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stake tokens'
      };
    }
  }

  // Vote on governance proposal
  static async voteOnProposal(proposalId: number, choice: 'YES' | 'NO' | 'ABSTAIN', signTransaction: (xdr: string) => Promise<string>, authToken: string) {
    try {
      const xdrData = await apiService.transactions.buildVote({ proposalId, choice }, authToken);
      const result = await this.signAndSubmit(xdrData.xdr, signTransaction);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit vote'
      };
    }
  }

  static async getMarketContractData(marketId: string) {
    try {
      const result = await apiService.markets.getMarket(marketId);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch market data'
      };
    }
  }

  static async getTransactionStatus(txHash: string) {
    try {
      const result = await apiService.network.getTransactionStatus(txHash);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get transaction status'
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
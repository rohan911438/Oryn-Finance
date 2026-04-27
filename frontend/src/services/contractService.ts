import { apiClient } from '@/lib/api-client';
import { ENDPOINTS } from '@/lib/api-config';
import { buildGovernanceProposals, type GovernanceProposal, type GovernanceVoteChoice } from '@/lib/governance';
import { apiService } from './apiService';

type SignTransactionFn = (xdr: string) => Promise<string>;

export class ContractService {
  private static async buildSignAndSubmit(
    buildTransaction: () => Promise<{ xdr: string }>,
    signTransaction: SignTransactionFn
  ) {
    const builtTransaction = await buildTransaction();
    const signedXdr = await signTransaction(builtTransaction.xdr);
    return apiService.transactions.submitSignedTransaction({ signedXdr });
  }

  static async testContractIntegration() {
    return apiService.health.getContractsHealth();
  }

  static async getNetworkInfo() {
    return apiService.network.getNetworkInfo();
  }

  static async getTransactionStatus(txHash: string) {
    return apiService.network.getTransactionStatus(txHash);
  }

  static async createMarket(
    marketData: {
      question: string;
      category: string;
      expiryTimestamp: number;
      initialLiquidity: number;
    },
    signTransaction: SignTransactionFn,
    authToken: string
  ) {
    return this.buildSignAndSubmit(
      () => apiService.transactions.buildCreateMarket(marketData, authToken),
      signTransaction
    );
  }

  static async buyTokens(
    marketId: string,
    tokenType: 'yes' | 'no',
    amount: number,
    _price: number,
    signTransaction: SignTransactionFn,
    authToken: string
  ) {
    return this.buildSignAndSubmit(
      () => apiService.transactions.buildBuyTokens({ marketId, tokenType, amount }, authToken),
      signTransaction
    );
  }

  static async sellTokens(
    marketId: string,
    tokenType: 'yes' | 'no',
    amount: number,
    _price: number,
    signTransaction: SignTransactionFn,
    authToken: string
  ) {
    return this.buildSignAndSubmit(
      () => apiService.transactions.buildSellTokens({ marketId, tokenType, amount }, authToken),
      signTransaction
    );
  }

  static async claimWinnings(
    marketContract: string,
    signTransaction: SignTransactionFn,
    authToken: string
  ) {
    return this.buildSignAndSubmit(
      () => apiService.transactions.buildClaimWinnings({ marketContract }, authToken),
      signTransaction
    );
  }

  static async swapTokens(
    fromToken: string,
    toToken: string,
    amountIn: number,
    minAmountOut: number,
    signTransaction: SignTransactionFn,
    authToken: string
  ) {
    return this.buildSignAndSubmit(
      () =>
        apiService.transactions.buildSwap(
          { fromToken, toToken, amount: amountIn, maxSlippage: minAmountOut },
          authToken
        ),
      signTransaction
    );
  }

  static async addLiquidity(
    tokenA: string,
    tokenB: string,
    amountA: number,
    amountB: number,
    signTransaction: SignTransactionFn,
    authToken: string
  ) {
    return this.buildSignAndSubmit(
      () => apiService.transactions.buildAddLiquidity({ tokenA, tokenB, amountA, amountB }, authToken),
      signTransaction
    );
  }

  static async stakeTokens(
    amount: number,
    lockPeriod: number,
    signTransaction: SignTransactionFn,
    authToken: string
  ) {
    return this.buildSignAndSubmit(
      () => apiService.transactions.buildStake({ amount, lockPeriod }, authToken),
      signTransaction
    );
  }

  static async voteOnProposal(
    proposalId: number | string,
    choice: GovernanceVoteChoice,
    signTransaction: SignTransactionFn,
    authToken: string
  ) {
    return this.buildSignAndSubmit(
      () => apiService.transactions.buildVote({ proposalId, choice }, authToken),
      signTransaction
    );
  }

  static async getMarketContractData(marketId: string) {
    return apiService.markets.getMarket(marketId);
  }

  static async getGovernanceProposals(limit = 250): Promise<GovernanceProposal[]> {
    const events = await apiService.analytics.getIndexedEvents({
      contractName: 'GOVERNANCE',
      limit,
    });

    return buildGovernanceProposals(events);
  }

  static async buildTransaction(data: {
    contractName: string;
    functionName: string;
    args: unknown[];
  }) {
    const response = await apiClient.post<{ xdr: string }>(ENDPOINTS.BUILD_SWAP, data);
    if (!response.success) {
      throw new Error(response.message || 'Failed to build transaction');
    }
    return response.data!;
  }

  static async submitTransaction(signedXDR: string, networkPassphrase?: string) {
    return apiService.transactions.submitTransaction({
      xdr: signedXDR,
      networkPassphrase,
    });
  }

  static async getContractState(contractId: string) {
    const response = await apiClient.get(ENDPOINTS.TRANSACTION_STATUS(contractId));
    if (!response.success) {
      throw new Error(response.message || 'Failed to get contract state');
    }
    return response.data;
  }
}

export const contractService = ContractService;
export default ContractService;

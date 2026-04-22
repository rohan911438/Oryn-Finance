import { useCallback } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import contractService from '@/services/contractService';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook for interacting with Soroban contracts
 * Combines wallet signing with contract service calls
 */
export function useContracts() {
  const { signTransaction, isConnected, address } = useWallet();
  const { toast } = useToast();

  const handleContractCall = useCallback(
    async <T,>(
      operation: () => Promise<T>,
      successMessage?: string,
      errorMessage?: string
    ): Promise<T | null> => {
      if (!isConnected) {
        toast({
          title: 'Wallet not connected',
          description: 'Please connect your wallet to perform this action',
          variant: 'destructive',
        });
        return null;
      }

      try {
        const result = await operation();
        
        if (successMessage) {
          toast({
            title: 'Success',
            description: successMessage,
            variant: 'default',
          });
        }
        
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : (errorMessage || 'Operation failed');
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        return null;
      }
    },
    [isConnected, toast]
  );

  // Market operations
  const createMarket = useCallback(
    async (marketData: {
      question: string;
      category: string;
      expiryTimestamp: number;
      initialLiquidity: number;
    }) => {
      return handleContractCall(
        () => contractService.createMarket(marketData, signTransaction, address ?? ''),
        'Market created successfully!',
        'Failed to create market'
      );
    },
    [signTransaction, address, handleContractCall]
  );

  const buyTokens = useCallback(
    async (
      marketContract: string,
      tokenType: 'yes' | 'no',
      amount: number,
      price: number
    ) => {
      return handleContractCall(
        () => contractService.buyTokens({ marketId: marketContract, tokenType, amount, maxSlippage: price }, signTransaction, address ?? ''),
        `Successfully bought ${amount} ${tokenType.toUpperCase()} tokens!`,
        'Failed to buy tokens'
      );
    },
    [signTransaction, address, handleContractCall]
  );

  const sellTokens = useCallback(
    async (
      marketContract: string,
      tokenType: 'yes' | 'no',
      amount: number,
      price: number
    ) => {
      return handleContractCall(
        () => contractService.sellTokens({ marketId: marketContract, tokenType, amount, maxSlippage: price }, signTransaction, address ?? ''),
        `Successfully sold ${amount} ${tokenType.toUpperCase()} tokens!`,
        'Failed to sell tokens'
      );
    },
    [signTransaction, address, handleContractCall]
  );

  const claimWinnings = useCallback(
    async (marketContract: string) => {
      return handleContractCall(
        () => contractService.claimWinnings(marketContract, signTransaction, address ?? ''),
        'Winnings claimed successfully!',
        'Failed to claim winnings'
      );
    },
    [signTransaction, address, handleContractCall]
  );

  // AMM operations
  const swapTokens = useCallback(
    async (
      fromToken: string,
      toToken: string,
      amountIn: number,
      minAmountOut: number
    ) => {
      return handleContractCall(
        () => contractService.swapTokens(fromToken, toToken, amountIn, minAmountOut, signTransaction, address ?? ''),
        'Tokens swapped successfully!',
        'Failed to swap tokens'
      );
    },
    [signTransaction, address, handleContractCall]
  );

  const addLiquidity = useCallback(
    async (
      tokenA: string,
      tokenB: string,
      amountA: number,
      amountB: number
    ) => {
      return handleContractCall(
        () => contractService.addLiquidity(tokenA, tokenB, amountA, amountB, signTransaction, address ?? ''),
        'Liquidity added successfully!',
        'Failed to add liquidity'
      );
    },
    [signTransaction, address, handleContractCall]
  );

  // Governance operations
  const stakeTokens = useCallback(
    async (amount: number, lockPeriod: number) => {
      return handleContractCall(
        () => contractService.stakeTokens(amount, lockPeriod, signTransaction, address ?? ''),
        'Tokens staked successfully!',
        'Failed to stake tokens'
      );
    },
    [signTransaction, address, handleContractCall]
  );

  const voteOnProposal = useCallback(
    async (proposalId: number, choice: 'YES' | 'NO' | 'ABSTAIN') => {
      return handleContractCall(
        () => contractService.voteOnProposal(proposalId, choice, signTransaction, address ?? ''),
        `Vote "${choice}" submitted successfully!`,
        'Failed to submit vote'
      );
    },
    [signTransaction, address, handleContractCall]
  );

  // Query operations (no signing required)
  const getMarketContractData = useCallback(
    async (marketId: string) => {
      try {
        return await contractService.getMarketContractData(marketId);
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to fetch market contract data',
          variant: 'destructive',
        });
        return null;
      }
    },
    [toast]
  );

  const getTransactionStatus = useCallback(
    async (txHash: string) => {
      try {
        return await contractService.getTransactionStatus(txHash);
      } catch (error) {
        console.error('Failed to get transaction status:', error);
        return null;
      }
    },
    []
  );

  const getNetworkInfo = useCallback(
    async () => {
      try {
        return await contractService.getNetworkInfo();
      } catch (error) {
        console.error('Failed to get network info:', error);
        return null;
      }
    },
    []
  );

  return {
    // State
    isConnected,
    address,
    
    // Market operations
    createMarket,
    buyTokens,
    sellTokens,
    claimWinnings,
    
    // AMM operations
    swapTokens,
    addLiquidity,
    
    // Governance operations
    stakeTokens,
    voteOnProposal,
    
    // Query operations
    getMarketContractData,
    getTransactionStatus,
    getNetworkInfo,
  };
}

export default useContracts;
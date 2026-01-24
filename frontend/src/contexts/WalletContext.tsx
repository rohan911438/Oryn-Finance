import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

// Freighter wallet types
interface FreighterModule {
  isConnected(): Promise<boolean>;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string, opts?: { networkPassphrase?: string }): Promise<string>;
  getNetworkDetails(): Promise<{ networkPassphrase: string; networkUrl: string }>;
}

interface WalletState {
  isConnected: boolean;
  address: string | null;
  xlmBalance: string;
  usdcBalance: string;
  isConnecting: boolean;
  isFreighterInstalled: boolean;
  networkPassphrase: string | null;
}

interface WalletContextType extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
  refreshBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Stellar testnet configuration
const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    address: null,
    xlmBalance: '0',
    usdcBalance: '0',
    isConnecting: false,
    isFreighterInstalled: false,
    networkPassphrase: null,
  });

  // Check if Freighter is installed
  const checkFreighterInstallation = useCallback(() => {
    const isInstalled = typeof window !== 'undefined' && 'freighter' in window;
    setState(prev => ({ ...prev, isFreighterInstalled: isInstalled }));
    return isInstalled;
  }, []);

  // Get Freighter API
  const getFreighter = useCallback((): FreighterModule | null => {
    if (typeof window === 'undefined' || !window.freighter) {
      return null;
    }
    return window.freighter as FreighterModule;
  }, []);

  // Fetch balances from Horizon API
  const fetchBalances = useCallback(async (publicKey: string) => {
    try {
      const response = await fetch(`${HORIZON_TESTNET_URL}/accounts/${publicKey}`);
      if (!response.ok) {
        throw new Error('Failed to fetch account data');
      }
      
      const accountData = await response.json();
      const balances = accountData.balances;
      
      let xlmBalance = '0';
      let usdcBalance = '0';
      
      for (const balance of balances) {
        if (balance.asset_type === 'native') {
          xlmBalance = parseFloat(balance.balance).toFixed(2);
        } else if (balance.asset_code === 'USDC') {
          usdcBalance = parseFloat(balance.balance).toFixed(2);
        }
      }
      
      return { xlmBalance, usdcBalance };
    } catch (error) {
      console.warn('Failed to fetch balances:', error);
      return { xlmBalance: '0', usdcBalance: '0' };
    }
  }, []);

  // Connect to Freighter wallet
  const connect = useCallback(async () => {
    const freighter = getFreighter();
    
    if (!freighter) {
      throw new Error('Freighter wallet is not installed. Please install Freighter extension.');
    }

    setState(prev => ({ ...prev, isConnecting: true }));
    
    try {
      // Check if already connected
      const isAlreadyConnected = await freighter.isConnected();
      
      let publicKey: string;
      
      if (isAlreadyConnected) {
        publicKey = await freighter.getPublicKey();
      } else {
        // Request connection
        publicKey = await freighter.getPublicKey();
      }

      // Get network details
      const networkDetails = await freighter.getNetworkDetails();
      
      // Validate network (ensure we're on testnet)
      if (networkDetails.networkPassphrase !== STELLAR_TESTNET_PASSPHRASE) {
        console.warn('Freighter is not connected to Stellar testnet. Please switch networks.');
        // Note: We'll still connect but show a warning
      }

      // Fetch balances
      const balances = await fetchBalances(publicKey);
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        address: publicKey,
        xlmBalance: balances.xlmBalance,
        usdcBalance: balances.usdcBalance,
        isConnecting: false,
        networkPassphrase: networkDetails.networkPassphrase,
      }));

      // Store connection in localStorage for persistence
      localStorage.setItem('walletConnected', 'true');
      localStorage.setItem('walletAddress', publicKey);
      
      console.log('Connected to Freighter wallet:', {
        address: publicKey,
        network: networkDetails.networkPassphrase,
        balances
      });
    } catch (error) {
      console.error('Failed to connect to Freighter wallet:', error);
      setState(prev => ({ 
        ...prev, 
        isConnecting: false,
        isConnected: false,
        address: null 
      }));
      
      // More specific error handling
      let errorMessage = 'Failed to connect to wallet';
      if (error instanceof Error) {
        if (error.message.includes('User declined access')) {
          errorMessage = 'User declined wallet access';
        } else if (error.message.includes('No account')) {
          errorMessage = 'No account found in Freighter';
        } else {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }, [getFreighter, fetchBalances]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      address: null,
      xlmBalance: '0',
      usdcBalance: '0',
      isConnecting: false,
      isFreighterInstalled: state.isFreighterInstalled,
      networkPassphrase: null,
    });
    
    // Clear localStorage
    localStorage.removeItem('walletConnected');
    localStorage.removeItem('walletAddress');
    
    console.log('Disconnected from wallet');
  }, [state.isFreighterInstalled]);

  // Sign transaction with Freighter
  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    const freighter = getFreighter();
    
    if (!freighter) {
      throw new Error('Freighter wallet is not installed');
    }

    if (!state.isConnected) {
      throw new Error('Wallet is not connected');
    }

    try {
      const signedXDR = await freighter.signTransaction(xdr, {
        networkPassphrase: STELLAR_TESTNET_PASSPHRASE
      });
      
      console.log('Transaction signed successfully');
      return signedXDR;
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      
      let errorMessage = 'Failed to sign transaction';
      if (error instanceof Error) {
        if (error.message.includes('User declined')) {
          errorMessage = 'Transaction rejected by user';
        } else {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }, [getFreighter, state.isConnected]);

  // Refresh balances
  const refreshBalances = useCallback(async () => {
    if (!state.address) return;
    
    try {
      const balances = await fetchBalances(state.address);
      setState(prev => ({
        ...prev,
        xlmBalance: balances.xlmBalance,
        usdcBalance: balances.usdcBalance,
      }));
    } catch (error) {
      console.error('Failed to refresh balances:', error);
    }
  }, [state.address, fetchBalances]);

  // Auto-reconnect on page load
  useEffect(() => {
    const autoReconnect = async () => {
      checkFreighterInstallation();
      
      const wasConnected = localStorage.getItem('walletConnected') === 'true';
      const savedAddress = localStorage.getItem('walletAddress');
      
      if (wasConnected && savedAddress && checkFreighterInstallation()) {
        try {
          const freighter = getFreighter();
          if (freighter) {
            const isStillConnected = await freighter.isConnected();
            if (isStillConnected) {
              await connect();
            } else {
              // Clear stale data
              disconnect();
            }
          }
        } catch (error) {
          console.warn('Failed to auto-reconnect:', error);
          disconnect();
        }
      }
    };

    autoReconnect();
  }, [connect, disconnect, checkFreighterInstallation, getFreighter]);

  // Periodic balance refresh
  useEffect(() => {
    if (!state.isConnected || !state.address) return;

    const interval = setInterval(refreshBalances, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [state.isConnected, state.address, refreshBalances]);

  return (
    <WalletContext.Provider value={{ 
      ...state, 
      connect, 
      disconnect, 
      signTransaction, 
      refreshBalances 
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

// Type augmentation for window.freighter
declare global {
  interface Window {
    freighter?: FreighterModule;
  }
}

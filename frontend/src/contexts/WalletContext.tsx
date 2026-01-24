import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { WalletType, FreighterModule, RabetModule } from '@/types/wallet';
import { connectRabet, signWithRabet, setupRabetEventListeners, disconnectRabet, isRabetAvailable } from '@/wallet/connectRabet';

// Stellar network constants
const STELLAR_NETWORKS = {
  PUBLIC: 'Public Global Stellar Network ; September 2015',
  TESTNET: 'Test SDF Network ; September 2015'
};

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
  isRabetInstalled: boolean;
  connectedWallet: WalletType | null;
  networkPassphrase: string | null;
  network: 'mainnet' | 'testnet';
}

interface WalletContextType extends WalletState {
  publicKey: string | null; // Add publicKey alias for address
  connect: (walletType?: WalletType) => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
  refreshBalances: () => Promise<void>;
  switchNetwork: (network: 'mainnet' | 'testnet') => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Stellar network configuration
const STELLAR_MAINNET_PASSPHRASE = STELLAR_NETWORKS.PUBLIC;
const STELLAR_TESTNET_PASSPHRASE = STELLAR_NETWORKS.TESTNET;
const HORIZON_MAINNET_URL = 'https://horizon.stellar.org';
const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    address: null,
    xlmBalance: '0',
    usdcBalance: '0',
    isConnecting: false,
    isFreighterInstalled: false,
    isRabetInstalled: false,
    connectedWallet: null,
    networkPassphrase: null,
    network: 'mainnet', // Default to mainnet
  });

  // Get current network configuration
  const getCurrentNetworkConfig = useCallback(() => {
    return {
      passphrase: state.network === 'mainnet' ? STELLAR_MAINNET_PASSPHRASE : STELLAR_TESTNET_PASSPHRASE,
      horizonUrl: state.network === 'mainnet' ? HORIZON_MAINNET_URL : HORIZON_TESTNET_URL,
    };
  }, [state.network]);

  // Check if wallets are installed
  const checkWalletInstallation = useCallback(() => {
    const isFreighterInstalled = typeof window !== 'undefined' && 'freighter' in window;
    const isRabetInstalled = isRabetAvailable();
    
    setState(prev => ({ 
      ...prev, 
      isFreighterInstalled: isFreighterInstalled,
      isRabetInstalled: isRabetInstalled
    }));
    
    return { isFreighterInstalled, isRabetInstalled };
  }, []);

  // Get Freighter API
  const getFreighter = useCallback((): FreighterModule | null => {
    if (typeof window === 'undefined' || !window.freighter) {
      return null;
    }
    return window.freighter as FreighterModule;
  }, []);

  // Get Rabet API
  const getRabet = useCallback((): RabetModule | null => {
    if (typeof window === 'undefined' || !window.rabet) {
      return null;
    }
    return window.rabet as RabetModule;
  }, []);

  // Fetch balances from Horizon API
  const fetchBalances = useCallback(async (publicKey: string) => {
    try {
      const { horizonUrl } = getCurrentNetworkConfig();
      const response = await fetch(`${horizonUrl}/accounts/${publicKey}`);
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
  }, [getCurrentNetworkConfig]);

  // Connect to wallet (Freighter, Rabet, or auto-detect)
  const connect = useCallback(async (walletType?: WalletType) => {
    setState(prev => ({ ...prev, isConnecting: true }));
    
    try {
      let publicKey: string;
      let networkDetails: any = null;
      let connectedWalletType: WalletType;
      const { passphrase } = getCurrentNetworkConfig();

      // If no wallet type specified, try to auto-detect
      if (!walletType) {
        const { isFreighterInstalled, isRabetInstalled } = checkWalletInstallation();
        
        if (isRabetInstalled) {
          walletType = 'rabet';
        } else if (isFreighterInstalled) {
          walletType = 'freighter';
        } else {
          throw new Error('No supported wallet found. Please install Freighter or Rabet wallet.');
        }
      }

      // Connect based on wallet type
      switch (walletType) {
        case 'rabet':
          if (!getRabet()) {
            throw new Error('Rabet wallet is not installed. Please install the Rabet browser extension.');
          }
          console.log('Connecting to Rabet wallet...');
          publicKey = await connectRabet();
          connectedWalletType = 'rabet';
          
          // Set up Rabet event listeners
          setupRabetEventListeners(
            () => {
              console.log('Rabet account changed - refreshing connection...');
              connect(walletType);
            },
            (networkId: string) => {
              console.log('Rabet network changed to:', networkId);
              // Handle network change if needed
            }
          );
          break;

        case 'freighter':
          const freighter = getFreighter();
          if (!freighter) {
            throw new Error('Freighter wallet is not installed. Please install Freighter extension.');
          }
          
          console.log('Connecting to Freighter wallet...');
          
          // Check if already connected
          const isAlreadyConnected = await freighter.isConnected();
          
          if (isAlreadyConnected) {
            publicKey = await freighter.getPublicKey();
          } else {
            // Request connection
            publicKey = await freighter.getPublicKey();
          }

          // Get network details
          networkDetails = await freighter.getNetworkDetails();
          connectedWalletType = 'freighter';
          
          // Validate network for Freighter
          if (state.network === 'testnet' && networkDetails.networkPassphrase !== STELLAR_TESTNET_PASSPHRASE) {
            console.warn('Freighter is not connected to Stellar testnet. Please switch networks in Freighter.');
          } else if (state.network === 'mainnet' && networkDetails.networkPassphrase !== STELLAR_MAINNET_PASSPHRASE) {
            console.warn('Freighter is not connected to Stellar mainnet. Please switch networks in Freighter.');
          }
          break;

        default:
          throw new Error(`Unsupported wallet type: ${walletType}`);
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
        connectedWallet: connectedWalletType,
        networkPassphrase: networkDetails?.networkPassphrase || passphrase,
      }));

      // Store connection in localStorage for persistence
      localStorage.setItem('walletConnected', 'true');
      localStorage.setItem('walletAddress', publicKey);
      localStorage.setItem('connectedWallet', connectedWalletType);
      localStorage.setItem('walletNetwork', state.network);
      
      console.log(`Connected to ${connectedWalletType} wallet:`, {
        address: publicKey,
        network: state.network,
        networkPassphrase: networkDetails?.networkPassphrase || passphrase,
        balances
      });
    } catch (error) {
      console.error('Failed to connect to wallet:', error);
      setState(prev => ({ 
        ...prev, 
        isConnecting: false,
        isConnected: false,
        address: null,
        connectedWallet: null 
      }));
      
      // More specific error handling
      let errorMessage = 'Failed to connect to wallet';
      if (error instanceof Error) {
        if (error.message.includes('User declined') || error.message.includes('rejected')) {
          errorMessage = 'User declined wallet access';
        } else if (error.message.includes('No account')) {
          errorMessage = 'No account found in wallet';
        } else {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }, [getFreighter, getRabet, fetchBalances, checkWalletInstallation, getCurrentNetworkConfig, state.network]);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    // Disconnect from specific wallet if connected
    if (state.connectedWallet === 'rabet') {
      try {
        await disconnectRabet();
      } catch (error) {
        console.warn('Error disconnecting from Rabet:', error);
      }
    }
    
    setState({
      isConnected: false,
      address: null,
      xlmBalance: '0',
      usdcBalance: '0',
      isConnecting: false,
      isFreighterInstalled: state.isFreighterInstalled,
      isRabetInstalled: state.isRabetInstalled,
      connectedWallet: null,
      networkPassphrase: null,
      network: state.network, // Keep current network setting
    });
    
    // Clear localStorage
    localStorage.removeItem('walletConnected');
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('connectedWallet');
    
    console.log('Disconnected from wallet');
  }, [state.connectedWallet, state.isFreighterInstalled, state.isRabetInstalled, state.network]);

  // Sign transaction with connected wallet
  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    if (!state.isConnected || !state.connectedWallet) {
      throw new Error('Wallet is not connected');
    }

    try {
      const { passphrase } = getCurrentNetworkConfig();
      let signedXDR: string;

      switch (state.connectedWallet) {
        case 'rabet':
          console.log(`Signing transaction with Rabet on ${state.network}...`);
          signedXDR = await signWithRabet(xdr, state.network);
          break;

        case 'freighter':
          const freighter = getFreighter();
          if (!freighter) {
            throw new Error('Freighter wallet is not available');
          }
          
          console.log(`Signing transaction with Freighter on ${state.network}...`);
          signedXDR = await freighter.signTransaction(xdr, {
            networkPassphrase: passphrase
          });
          break;

        default:
          throw new Error(`Signing not supported for wallet: ${state.connectedWallet}`);
      }
      
      console.log('Transaction signed successfully');
      return signedXDR;
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      
      let errorMessage = 'Failed to sign transaction';
      if (error instanceof Error) {
        if (error.message.includes('rejected') || error.message.includes('declined') || error.message.includes('denied')) {
          errorMessage = 'Transaction rejected by user';
        } else {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }, [getFreighter, state.isConnected, state.connectedWallet, state.network, getCurrentNetworkConfig]);

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

  // Switch network
  const switchNetwork = useCallback((network: 'mainnet' | 'testnet') => {
    setState(prev => ({ ...prev, network }));
    localStorage.setItem('walletNetwork', network);
    
    // If connected, refresh balances for new network
    if (state.address) {
      refreshBalances();
    }
    
    console.log(`Switched to ${network}`);
  }, [state.address, refreshBalances]);

  // Auto-reconnect on page load
  useEffect(() => {
    const autoReconnect = async () => {
      checkWalletInstallation();
      
      const wasConnected = localStorage.getItem('walletConnected') === 'true';
      const savedAddress = localStorage.getItem('walletAddress');
      const savedWallet = localStorage.getItem('connectedWallet') as WalletType;
      const savedNetwork = localStorage.getItem('walletNetwork') as 'mainnet' | 'testnet';
      
      // Restore network setting
      if (savedNetwork) {
        setState(prev => ({ ...prev, network: savedNetwork }));
      }
      
      if (wasConnected && savedAddress && savedWallet) {
        try {
          // Check if the wallet is still available and connected
          if (savedWallet === 'freighter') {
            const freighter = getFreighter();
            if (freighter) {
              const isStillConnected = await freighter.isConnected();
              if (isStillConnected) {
                await connect(savedWallet);
              } else {
                disconnect();
              }
            } else {
              disconnect();
            }
          } else if (savedWallet === 'rabet') {
            if (isRabetAvailable()) {
              // For Rabet, we'll try to reconnect directly since it doesn't have an isConnected method
              await connect(savedWallet);
            } else {
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
  }, [connect, disconnect, checkWalletInstallation, getFreighter]);

  // Periodic balance refresh
  useEffect(() => {
    if (!state.isConnected || !state.address) return;

    const interval = setInterval(refreshBalances, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [state.isConnected, state.address, refreshBalances]);

  return (
    <WalletContext.Provider value={{ 
      ...state, 
      publicKey: state.address, // Provide publicKey as alias for address
      connect, 
      disconnect, 
      signTransaction, 
      refreshBalances,
      switchNetwork 
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

// Type augmentation for window objects
declare global {
  interface Window {
    freighter?: FreighterModule;
    rabet?: RabetModule;
  }
}

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface WalletState {
  isConnected: boolean;
  address: string | null;
  xlmBalance: string;
  usdcBalance: string;
  isConnecting: boolean;
}

interface WalletContextType extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    address: null,
    xlmBalance: '0',
    usdcBalance: '0',
    isConnecting: false,
  });

  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true }));
    
    // Simulate wallet connection delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock connected state - in production, this would use Freighter
    setState({
      isConnected: true,
      address: 'GBXQ...7KLM',
      xlmBalance: '1,234.56',
      usdcBalance: '5,678.90',
      isConnecting: false,
    });
  }, []);

  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      address: null,
      xlmBalance: '0',
      usdcBalance: '0',
      isConnecting: false,
    });
  }, []);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect }}>
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

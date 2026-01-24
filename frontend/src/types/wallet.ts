// Wallet type definitions
export interface RabetModule {
  connect(): Promise<RabetConnectResult>;
  sign(xdr: string, network: string): Promise<RabetSignResult>;
  disconnect(): Promise<void>;
  isUnlocked(): Promise<boolean>;
  close(): Promise<void>;
  on(event: 'accountChanged' | 'networkChanged', handler: (data?: any) => void): void;
}

export interface RabetConnectResult {
  publicKey: string;
  error?: string;
}

export interface RabetSignResult {
  xdr: string;
  error?: string;
}

export interface FreighterModule {
  isConnected(): Promise<boolean>;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string, opts?: { networkPassphrase?: string }): Promise<string>;
  getNetworkDetails(): Promise<{ networkPassphrase: string; networkUrl: string }>;
}

export interface WalletInfo {
  id: string;
  name: string;
  type: 'extension' | 'web';
  available: boolean;
}

export type WalletType = 'freighter' | 'rabet' | 'albedo';

// Global window type extensions
declare global {
  interface Window {
    freighter?: FreighterModule;
    rabet?: RabetModule;
  }
}

// Stellar network constants
const STELLAR_NETWORKS = {
  PUBLIC: 'Public Global Stellar Network ; September 2015',
  TESTNET: 'Test SDF Network ; September 2015'
};

export async function connectRabet(): Promise<string> {
  // Check if Rabet is available
  if (typeof window === 'undefined' || !window.rabet) {
    throw new Error('Rabet wallet is not installed. Please install the Rabet browser extension.');
  }

  try {
    console.log('Attempting to connect to Rabet wallet...');
    
    // Connect to Rabet wallet
    const result = await window.rabet.connect();
    
    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.publicKey) {
      throw new Error('No public key received from Rabet wallet');
    }

    console.log('Successfully connected to Rabet wallet:', result.publicKey);
    return result.publicKey;
  } catch (error) {
    console.error('Failed to connect to Rabet wallet:', error);
    
    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('User denied access') || error.message.includes('rejected')) {
        throw new Error('Connection rejected by user');
      }
      throw error;
    }
    
    throw new Error('Unknown error occurred while connecting to Rabet');
  }
}

export async function signWithRabet(xdr: string, network: 'mainnet' | 'testnet' = 'mainnet'): Promise<string> {
  if (typeof window === 'undefined' || !window.rabet) {
    throw new Error('Rabet wallet is not available');
  }

  try {
    const networkPassphrase = network === 'mainnet' ? STELLAR_NETWORKS.PUBLIC : STELLAR_NETWORKS.TESTNET;
    console.log(`Signing transaction with Rabet on ${network}...`);
    
    const result = await window.rabet.sign(xdr, networkPassphrase);
    
    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.xdr) {
      throw new Error('No signed XDR received from Rabet wallet');
    }

    console.log('Transaction signed successfully with Rabet');
    return result.xdr;
  } catch (error) {
    console.error('Failed to sign transaction with Rabet:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('rejected') || error.message.includes('denied')) {
        throw new Error('Transaction rejected by user');
      }
      throw error;
    }
    
    throw new Error('Unknown error occurred while signing transaction');
  }
}

export function isRabetAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.rabet;
}

export async function isRabetUnlocked(): Promise<boolean> {
  if (!isRabetAvailable()) {
    return false;
  }

  try {
    return await window.rabet!.isUnlocked();
  } catch (error) {
    console.warn('Failed to check Rabet unlock status:', error);
    return false;
  }
}

export function setupRabetEventListeners(
  onAccountChanged: () => void,
  onNetworkChanged: (networkId: string) => void
): void {
  if (!isRabetAvailable()) {
    console.warn('Rabet not available for event listeners');
    return;
  }

  console.log('Setting up Rabet event listeners...');
  
  // Listen for account changes
  window.rabet!.on('accountChanged', () => {
    console.log('Rabet account changed');
    onAccountChanged();
  });

  // Listen for network changes
  window.rabet!.on('networkChanged', (networkId: string) => {
    console.log('Rabet network changed to:', networkId);
    onNetworkChanged(networkId);
  });
}

export async function disconnectRabet(): Promise<void> {
  if (!isRabetAvailable()) {
    return;
  }

  try {
    await window.rabet!.disconnect();
    console.log('Disconnected from Rabet wallet');
  } catch (error) {
    console.error('Error disconnecting from Rabet:', error);
  }
}
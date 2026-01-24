import { isConnected } from "@stellar/freighter-api";
import { WalletInfo } from "@/types/wallet";

export async function detectWallets(): Promise<WalletInfo[]> {
  const wallets: WalletInfo[] = [];

  // Check for Freighter wallet
  try {
    const freighterAvailable = typeof window !== 'undefined' && 'freighter' in window;
    if (freighterAvailable) {
      const isFreighterConnected = await isConnected();
      wallets.push({
        id: "freighter",
        name: "Freighter",
        type: "extension",
        available: isFreighterConnected
      });
    }
  } catch (error) {
    console.warn('Error checking Freighter availability:', error);
  }

  // Check for Rabet wallet
  try {
    const rabetAvailable = typeof window !== 'undefined' && 'rabet' in window;
    if (rabetAvailable) {
      wallets.push({
        id: "rabet",
        name: "Rabet",
        type: "extension",
        available: true
      });
    }
  } catch (error) {
    console.warn('Error checking Rabet availability:', error);
  }

  // Albedo is always available as a web wallet
  wallets.push({
    id: "albedo",
    name: "Albedo",
    type: "web",
    available: true
  });

  return wallets;
}

export function isRabetDetected(): boolean {
  if (typeof window === 'undefined') return false;
  
  if (window.rabet) {
    console.log('Rabet wallet detected!');
    return true;
  }
  
  console.log('Rabet wallet not detected');
  return false;
}

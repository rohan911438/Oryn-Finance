import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wallet, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { WalletType, WalletInfo } from '@/types/wallet';
import { detectWallets, isRabetDetected } from '@/wallet/detectStellarWallets';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface WalletSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WALLET_LOGOS: Record<string, string> = {
  freighter: '🚀',
  rabet: '🐰',
  albedo: '⭐'
};

const WALLET_DESCRIPTIONS: Record<string, string> = {
  freighter: 'Browser extension wallet for Stellar',
  rabet: 'Simple and secure Stellar wallet extension',
  albedo: 'Web-based keystore for Stellar network'
};

const WALLET_INSTALL_URLS: Record<string, string> = {
  freighter: 'https://freighter.app/',
  rabet: 'https://rabet.io/',
  albedo: 'https://albedo.link/'
};

export function WalletSelectionModal({ open, onOpenChange }: WalletSelectionModalProps) {
  const { connect, isConnecting, network, switchNetwork } = useWallet();
  const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Detect available wallets
  useEffect(() => {
    const detectAvailableWallets = async () => {
      try {
        const wallets = await detectWallets();
        setAvailableWallets(wallets);
        
        // Log Rabet detection specifically
        if (isRabetDetected()) {
          console.log('Rabet wallet is available!');
        }
      } catch (error) {
        console.error('Error detecting wallets:', error);
      }
    };

    if (open) {
      detectAvailableWallets();
    }
  }, [open]);

  const handleConnect = async (walletType: WalletType) => {
    setSelectedWallet(walletType);
    setError(null);

    try {
      await connect(walletType);
      onOpenChange(false);
      setSelectedWallet(null);
    } catch (error) {
      console.error('Connection failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to connect to wallet');
      setSelectedWallet(null);
    }
  };

  const handleInstallWallet = (walletId: string) => {
    const installUrl = WALLET_INSTALL_URLS[walletId];
    if (installUrl) {
      window.open(installUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const isWalletAvailable = (walletId: string): boolean => {
    const wallet = availableWallets.find(w => w.id === walletId);
    return wallet?.available || false;
  };

  const getWalletStatus = (walletId: string): 'available' | 'installed' | 'not-installed' => {
    const wallet = availableWallets.find(w => w.id === walletId);
    if (!wallet) return 'not-installed';
    
    if (walletId === 'albedo') return 'available'; // Web wallet is always available
    
    // For browser extensions, check if they're detected
    if (walletId === 'freighter' && typeof window !== 'undefined' && window.freighter) {
      return 'available';
    }
    if (walletId === 'rabet' && typeof window !== 'undefined' && window.rabet) {
      return 'available';
    }
    
    return 'not-installed';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border-white/20 text-white backdrop-blur-xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold bg-gradient-to-r from-[#FF8C00] via-[#5F9EA0] to-[#7a57db] bg-clip-text text-transparent">
            Connect Your Wallet
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Network Selection */}
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
            <span className="text-sm text-muted-foreground">Network:</span>
            <div className="flex gap-1">
              <Button
                variant={network === 'mainnet' ? 'default' : 'outline'}
                size="sm"
                onClick={() => switchNetwork('mainnet')}
                className="text-xs"
              >
                Mainnet
              </Button>
              <Button
                variant={network === 'testnet' ? 'default' : 'outline'}
                size="sm"
                onClick={() => switchNetwork('testnet')}
                className="text-xs"
              >
                Testnet
              </Button>
            </div>
          </div>

          {/* Rabet Wallet - Prominently featured */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Browser Extensions</h3>
            
            {/* Rabet Wallet */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-orange-500/10 to-blue-500/10 border border-orange-500/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{WALLET_LOGOS.rabet}</div>
                  <div>
                    <h4 className="font-semibold text-white">Rabet</h4>
                    <p className="text-xs text-muted-foreground">{WALLET_DESCRIPTIONS.rabet}</p>
                  </div>
                </div>
                <Badge 
                  variant={getWalletStatus('rabet') === 'available' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {getWalletStatus('rabet') === 'available' ? 'Ready' : 'Not Installed'}
                </Badge>
              </div>

              {getWalletStatus('rabet') === 'available' ? (
                <Button
                  onClick={() => handleConnect('rabet')}
                  disabled={isConnecting}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {isConnecting && selectedWallet === 'rabet' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Connect Rabet
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => handleInstallWallet('rabet')}
                  variant="outline"
                  className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Install Rabet
                </Button>
              )}
            </div>

            {/* Freighter Wallet */}
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{WALLET_LOGOS.freighter}</div>
                  <div>
                    <h4 className="font-semibold">Freighter</h4>
                    <p className="text-xs text-muted-foreground">{WALLET_DESCRIPTIONS.freighter}</p>
                  </div>
                </div>
                <Badge 
                  variant={getWalletStatus('freighter') === 'available' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {getWalletStatus('freighter') === 'available' ? 'Ready' : 'Not Installed'}
                </Badge>
              </div>

              {getWalletStatus('freighter') === 'available' ? (
                <Button
                  onClick={() => handleConnect('freighter')}
                  disabled={isConnecting}
                  variant="outline"
                  className="w-full border-white/20 hover:bg-white/10"
                >
                  {isConnecting && selectedWallet === 'freighter' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4 mr-2" />
                      Connect Freighter
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => handleInstallWallet('freighter')}
                  variant="outline"
                  className="w-full border-white/20 text-muted-foreground hover:bg-white/10"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Install Freighter
                </Button>
              )}
            </div>
          </div>

          {/* Albedo Web Wallet */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Web Wallets</h3>
            
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{WALLET_LOGOS.albedo}</div>
                  <div>
                    <h4 className="font-semibold">Albedo</h4>
                    <p className="text-xs text-muted-foreground">{WALLET_DESCRIPTIONS.albedo}</p>
                  </div>
                </div>
                <Badge variant="default" className="text-xs">
                  Available
                </Badge>
              </div>

              <Button
                onClick={() => handleConnect('albedo')}
                disabled={isConnecting}
                variant="outline"
                className="w-full border-white/20 hover:bg-white/10"
              >
                {isConnecting && selectedWallet === 'albedo' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Connect Albedo
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert className="border-red-500/20 bg-red-500/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-red-400">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Network Information */}
          {network === 'mainnet' && (
            <Alert className="border-orange-500/20 bg-orange-500/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-orange-400">
                You are connecting to Stellar Mainnet. Please ensure you're using real funds.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

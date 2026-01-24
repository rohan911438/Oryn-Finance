import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, Wallet, RefreshCw } from 'lucide-react';
import { connectRabet, isRabetAvailable, isRabetUnlocked } from '@/wallet/connectRabet';
import { isRabetDetected } from '@/wallet/detectStellarWallets';

export function RabetWalletTest() {
  const [rabetStatus, setRabetStatus] = useState<{
    available: boolean;
    unlocked: boolean | null;
    publicKey: string | null;
    error: string | null;
  }>({
    available: false,
    unlocked: null,
    publicKey: null,
    error: null
  });

  const [balances, setBalances] = useState<{
    xlm: string;
    usdc: string;
    loading: boolean;
    error: string | null;
  }>({
    xlm: '0',
    usdc: '0',
    loading: false,
    error: null
  });

  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch balances from Horizon API
  const fetchBalances = async (publicKey: string) => {
    setBalances(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Using testnet since your wallet address appears to be on testnet
      const horizonUrl = 'https://horizon-testnet.stellar.org';
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
          xlmBalance = parseFloat(balance.balance).toFixed(4);
        } else if (balance.asset_code === 'USDC') {
          usdcBalance = parseFloat(balance.balance).toFixed(4);
        }
      }
      
      setBalances({
        xlm: xlmBalance,
        usdc: usdcBalance,
        loading: false,
        error: null
      });
    } catch (error) {
      console.warn('Failed to fetch balances:', error);
      setBalances(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balances'
      }));
    }
  };

  // Check Rabet status on component mount
  useEffect(() => {
    const checkRabetStatus = async () => {
      const available = isRabetAvailable();
      let unlocked = null;
      
      if (available) {
        try {
          unlocked = await isRabetUnlocked();
        } catch (error) {
          console.warn('Failed to check unlock status:', error);
        }
      }

      setRabetStatus({
        available,
        unlocked,
        publicKey: null,
        error: null
      });
    };

    checkRabetStatus();

    // Check periodically for installation changes
    const interval = setInterval(checkRabetStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleConnectRabet = async () => {
    setIsConnecting(true);
    setRabetStatus(prev => ({ ...prev, error: null }));

    try {
      console.log('Testing Rabet connection...');
      const publicKey = await connectRabet();
      
      setRabetStatus(prev => ({
        ...prev,
        publicKey,
        error: null
      }));

      console.log('Rabet connection successful!', publicKey);

      // Fetch balances after successful connection
      if (publicKey) {
        await fetchBalances(publicKey);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Rabet connection failed:', errorMessage);
      
      setRabetStatus(prev => ({
        ...prev,
        publicKey: null,
        error: errorMessage
      }));
      
      // Reset balances on connection error
      setBalances({
        xlm: '0',
        usdc: '0',
        loading: false,
        error: null
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefreshStatus = async () => {
    const available = isRabetAvailable();
    const detected = isRabetDetected();
    let unlocked = null;
    
    if (available) {
      try {
        unlocked = await isRabetUnlocked();
      } catch (error) {
        console.warn('Failed to check unlock status:', error);
      }
    }

    setRabetStatus(prev => ({
      ...prev,
      available,
      unlocked
    }));

    console.log('Rabet Status Check:', { available, detected, unlocked });
  };

  const handleRefreshBalances = async () => {
    if (rabetStatus.publicKey) {
      await fetchBalances(rabetStatus.publicKey);
    }
  };

  return (
    <div className="p-6 bg-black/80 border border-white/20 rounded-lg max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">🐰</div>
        <h2 className="text-xl font-bold text-white">Rabet Wallet Test</h2>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-3 bg-white/5 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            {rabetStatus.available ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
            <span className="text-sm font-medium">Installation</span>
          </div>
          <Badge variant={rabetStatus.available ? 'default' : 'destructive'} className="text-xs">
            {rabetStatus.available ? 'Detected' : 'Not Found'}
          </Badge>
        </div>

        <div className="p-3 bg-white/5 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            {rabetStatus.unlocked === true ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : rabetStatus.unlocked === false ? (
              <AlertCircle className="w-4 h-4 text-yellow-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-sm font-medium">Unlock Status</span>
          </div>
          <Badge 
            variant={rabetStatus.unlocked === true ? 'default' : rabetStatus.unlocked === false ? 'secondary' : 'outline'}
            className="text-xs"
          >
            {rabetStatus.unlocked === true ? 'Unlocked' : rabetStatus.unlocked === false ? 'Locked' : 'Unknown'}
          </Badge>
        </div>

        <div className="p-3 bg-white/5 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            {rabetStatus.publicKey ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-sm font-medium">Connection</span>
          </div>
          <Badge variant={rabetStatus.publicKey ? 'default' : 'outline'} className="text-xs">
            {rabetStatus.publicKey ? 'Connected' : 'Not Connected'}
          </Badge>
        </div>
      </div>

      {/* Connected Account */}
      {rabetStatus.publicKey && (
        <div className="mb-4 space-y-3">
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-sm text-green-400 font-medium mb-1">Connected via Rabet</p>
            <p className="text-xs text-green-300 mb-2">testnet</p>
            <code className="text-xs text-green-300 break-all font-mono">
              {rabetStatus.publicKey}
            </code>
          </div>
          
          {/* Balance Display */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">XLM</p>
                  <p className="text-lg font-bold text-white">
                    {balances.loading ? (
                      <div className="flex items-center">
                        <RefreshCw className="w-4 h-4 animate-spin mr-1" />
                        Loading...
                      </div>
                    ) : (
                      balances.xlm
                    )}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">USDC</p>
                  <p className="text-lg font-bold text-white">
                    {balances.loading ? (
                      <div className="flex items-center">
                        <RefreshCw className="w-4 h-4 animate-spin mr-1" />
                        Loading...
                      </div>
                    ) : (
                      balances.usdc
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {balances.error && (
            <Alert className="border-yellow-500/20 bg-yellow-500/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-yellow-400">
                <strong>Balance Error:</strong> {balances.error}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Error Display */}
      {rabetStatus.error && (
        <Alert className="mb-4 border-red-500/20 bg-red-500/10">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-red-400">
            <strong>Connection Error:</strong> {rabetStatus.error}
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        <Button
          onClick={handleConnectRabet}
          disabled={!rabetStatus.available || isConnecting}
          className="bg-orange-600 hover:bg-orange-700"
        >
          {isConnecting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4 mr-2" />
              Connect Rabet
            </>
          )}
        </Button>

        <Button onClick={handleRefreshStatus} variant="outline" size="sm">
          Refresh Status
        </Button>

        {rabetStatus.publicKey && (
          <Button 
            onClick={handleRefreshBalances} 
            variant="outline" 
            size="sm"
            disabled={balances.loading}
          >
            {balances.loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Balances
              </>
            )}
          </Button>
        )}
      </div>

      {/* Installation Help */}
      {!rabetStatus.available && (
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-sm text-blue-400 mb-2">
            <strong>Rabet Not Detected</strong>
          </p>
          <p className="text-xs text-blue-300 mb-3">
            To test Rabet wallet integration, please install the Rabet browser extension first.
          </p>
          <Button
            onClick={() => window.open('https://rabet.io/', '_blank')}
            size="sm"
            variant="outline"
            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          >
            Install Rabet Extension
          </Button>
        </div>
      )}

      {/* Technical Details */}
      <details className="mt-4">
        <summary className="text-sm text-muted-foreground cursor-pointer hover:text-white">
          Technical Details
        </summary>
        <div className="mt-2 p-3 bg-white/5 rounded text-xs font-mono text-muted-foreground">
          <div>window.rabet: {typeof window !== 'undefined' && window.rabet ? '✓ Present' : '✗ Missing'}</div>
          <div>isRabetAvailable(): {isRabetAvailable() ? '✓ True' : '✗ False'}</div>
          <div>isRabetDetected(): {isRabetDetected() ? '✓ True' : '✗ False'}</div>
          <div>User Agent: {navigator.userAgent.split(' ').slice(-2).join(' ')}</div>
        </div>
      </details>
    </div>
  );
}
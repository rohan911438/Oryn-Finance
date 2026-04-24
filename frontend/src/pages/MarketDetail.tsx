import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Users, Calendar, Clock, ExternalLink, Info, Loader2, AlertTriangle } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Market } from '@/data/mockData';
import { apiService } from '@/services/apiService';
import { useWallet } from '@/contexts/WalletContext';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import { TradeConfirmationModal } from '@/components/ui/ConfirmationModal';
import { CountdownTimer } from '@/components/ui/CountdownTimer';

function formatVolume(volume: number): string {
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(2)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
  return `$${volume}`;
}

export default function MarketDetail() {
  const { id } = useParams();
  const { isConnected, connect, publicKey, signTransaction } = useWallet();
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [position, setPosition] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [txProgress, setTxProgress] = useState<{
    phase: 'idle' | 'building' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';
    message: string;
    txHash?: string;
  }>({ phase: 'idle', message: '' });

  // Demo markets data
  const demoMarkets: { [key: string]: Market } = {
    '1': {
      id: '1',
      question: 'Will SpaceX land humans on Mars by 2030?',
      category: 'Technology',
      yesPrice: 0.25,
      noPrice: 0.75,
      volume: 31000,
      liquidity: 100000,
      expirationDate: '2030-12-31T23:59:59Z',
      status: 'Active',
      creator: 'GD...XYZ',
      createdAt: '2025-01-20T10:00:00Z',
      traders: 156,
      resolutionSource: 'SpaceX Official',
      description: 'Resolves YES if SpaceX successfully lands human crew on Mars surface by December 31, 2030.'
    },
    'openai-gpt5-2026': {
      id: 'openai-gpt5-2026',
      question: 'Will OpenAI release GPT-5 by December 2026?',
      category: 'Technology',
      yesPrice: 0.72,
      noPrice: 0.28,
      volume: 22000,
      liquidity: 80000,
      expirationDate: '2026-12-31T23:59:59Z',
      status: 'Active',
      creator: 'GA...ABC',
      createdAt: '2025-01-18T15:30:00Z',
      traders: 89,
      resolutionSource: 'OpenAI Official',
      description: 'Resolves YES if OpenAI officially releases a model named GPT-5 by December 31, 2026. This includes any publicly announced model with the official name GPT-5 from OpenAI.'
    },
    'spacex-mars-2030': {
      id: 'spacex-mars-2030',
      question: 'Will SpaceX land humans on Mars by 2030?',
      category: 'Technology',
      yesPrice: 0.25,
      noPrice: 0.75,
      volume: 31000,
      liquidity: 100000,
      expirationDate: '2030-12-31T23:59:59Z',
      status: 'Active',
      creator: 'GD...XYZ',
      createdAt: '2025-01-20T10:00:00Z',
      traders: 156,
      resolutionSource: 'SpaceX Official',
      description: 'Resolves YES if SpaceX successfully lands human crew on Mars surface by December 31, 2030.'
    }
  };

  // Get the current market
  const currentMarket = demoMarkets[id || ''] || demoMarkets['openai-gpt5-2026'];
  
  // Calculate liquidity imbalance
  const imbalanceRatio = Math.max(currentMarket.yesPrice, currentMarket.noPrice);
  const isImbalanced = imbalanceRatio >= 0.8;
  const imbalancedSide = currentMarket.yesPrice > currentMarket.noPrice ? 'YES' : 'NO';

  // Generate price history
  const priceHistory = Array.from({ length: 24 }, (_, i) => {
    const time = new Date(Date.now() - (23 - i) * 60 * 60 * 1000).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return {
      time,
      yes: Math.max(0.2, Math.min(0.8, currentMarket.yesPrice + Math.sin(i * 0.3) * 0.1 + (Math.random() - 0.5) * 0.05)),
      no: Math.max(0.2, Math.min(0.8, currentMarket.noPrice - Math.sin(i * 0.3) * 0.1 + (Math.random() - 0.5) * 0.05))
    };
  });

  // Generate demo trades
  const recentTrades = [
    { 
      id: '1',
      type: 'Buy', 
      position: 'YES', 
      amount: 100, 
      price: currentMarket.yesPrice, 
      timestamp: new Date(Date.now() - 300000).toLocaleTimeString()
    },
    { 
      id: '2',
      type: 'Sell', 
      position: 'NO', 
      amount: 50, 
      price: currentMarket.noPrice, 
      timestamp: new Date(Date.now() - 600000).toLocaleTimeString()
    },
    { 
      id: '3',
      type: 'Buy', 
      position: 'YES', 
      amount: 75, 
      price: currentMarket.yesPrice - 0.05, 
      timestamp: new Date(Date.now() - 900000).toLocaleTimeString()
    }
  ];

  const price = position === 'YES' ? currentMarket.yesPrice : currentMarket.noPrice;
  const tokensReceived = amount ? (parseFloat(amount) / price).toFixed(2) : '0';
  const priceImpact = amount ? Math.min(parseFloat(amount) * 0.001, 2).toFixed(2) : '0';
  const estimatedFee = amount ? (parseFloat(amount) * 0.005).toFixed(4) : '0';

  const handleTradeStart = () => {
    if (!isConnected) {
      connect();
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleTradeConfirm = async () => {
    setIsConfirmModalOpen(false);
    if (!publicKey) {
      toast.error('Wallet not connected properly');
      return;
    }

    setIsLoading(true);

    const pollTransaction = async (txHash: string) => {
      const maxAttempts = 12;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await apiService.network.getTransactionStatus(txHash);
        const status = String(result?.status || '').toUpperCase();

        if (status === 'SUCCESS') return result;
        if (status === 'FAILED' || status === 'NOT_FOUND') {
          throw new Error(`Transaction ${status.toLowerCase()}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      throw new Error('Transaction confirmation timed out');
    };
    
    try {
      setTxProgress({ phase: 'building', message: 'Building transaction...' });
      toast.loading('Building transaction...', { id: 'trade-toast' });

      // Build transaction using backend API
      const transactionData = tradeType === 'buy'
        ? await apiService.transactions.buildBuyTokens({
            marketId: currentMarket.id,
            tokenType: position.toLowerCase() as 'yes' | 'no',
            amount: parseFloat(amount),
            maxSlippage: 1.0 // 1% slippage tolerance
          }, publicKey)
        : await apiService.transactions.buildSellTokens({
            marketId: currentMarket.id,
            tokenType: position.toLowerCase() as 'yes' | 'no',
            amount: parseFloat(amount),
            maxSlippage: 1.0 // 1% slippage tolerance
          }, publicKey);

      if (!transactionData?.xdr) {
        throw new Error('Failed to build transaction');
      }

      setTxProgress({ phase: 'signing', message: 'Waiting for wallet signature...' });
      toast.loading('Please sign the transaction in your wallet...', { id: 'trade-toast' });

      const signedXdr = await signTransaction(transactionData.xdr);

      setTxProgress({ phase: 'submitting', message: 'Submitting transaction to network...' });
      toast.loading('Submitting transaction to network...', { id: 'trade-toast' });

      const submitResult = await apiService.transactions.submitSignedTransaction({
        signedXdr
      });

      const txHash = submitResult?.transactionHash;
      if (!txHash) {
        throw new Error('Transaction submitted but no hash returned');
      }

      setTxProgress({ phase: 'confirming', message: 'Confirming transaction...', txHash });
      await pollTransaction(txHash);

      setTxProgress({ phase: 'success', message: 'Transaction confirmed', txHash });
      toast.success(`${tradeType.charAt(0).toUpperCase() + tradeType.slice(1)} order successful!`, {
        id: 'trade-toast',
        description: `${tradeType === 'buy' ? 'Bought' : 'Sold'} ${tokensReceived} ${position} tokens`
      });

      setAmount('');
    } catch (error) {
      console.error('Trade error:', error);
      setTxProgress({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Transaction failed'
      });
      toast.error(error instanceof Error ? error.message : 'Transaction failed', { id: 'trade-toast' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Link to="/markets" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Markets
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Market Header */}
            <div className="glass-card p-6">
              <div className="flex items-start justify-between mb-4">
                <Badge variant="outline" className="text-primary border-primary/30">
                  {currentMarket.category}
                </Badge>
                {currentMarket.status === 'Trending' && (
                  <Badge className="bg-gradient-to-r from-primary to-secondary">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Trending
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-4">{currentMarket.question}</h1>
              <div className="flex flex-wrap gap-4 items-center mb-4">
                <CountdownTimer expiryDate={currentMarket.expirationDate} showLabels className="px-3 py-1.5 text-xs" />
                {isImbalanced && (
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 flex items-center gap-1.5 animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    Liquidity Imbalance: {imbalancedSide} heavy
                  </Badge>
                )}
              </div>
              {currentMarket.description && (
                <p className="text-muted-foreground mb-4">{currentMarket.description}</p>
              )}
              
              {/* Current Prices */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                  <div className="text-sm text-muted-foreground mb-1">YES Price</div>
                  <div className="text-3xl font-bold text-success">{Math.round(currentMarket.yesPrice * 100)}¢</div>
                </div>
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                  <div className="text-sm text-muted-foreground mb-1">NO Price</div>
                  <div className="text-3xl font-bold text-destructive">{Math.round(currentMarket.noPrice * 100)}¢</div>
                </div>
              </div>
            </div>

            {/* Price Chart */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">Price History</h2>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceHistory}>
                    <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 1]} tickFormatter={(v) => `${v * 100}¢`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="yes" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="YES" />
                    <Line type="monotone" dataKey="no" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="NO" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Trades */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Trades</h2>
              <div className="space-y-3">
                {recentTrades.map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-3">
                      <Badge variant={trade.type === 'Buy' ? 'default' : 'outline'} className={trade.type === 'Buy' ? 'bg-success/20 text-success' : ''}>
                        {trade.type}
                      </Badge>
                      <span className={trade.position === 'YES' ? 'text-success' : 'text-destructive'}>
                        {trade.position}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">${trade.amount}</div>
                      <div className="text-xs text-muted-foreground">{trade.timestamp}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Trading Interface */}
            <div className="glass-card p-6 sticky top-24">
              <Tabs value={tradeType} onValueChange={(v) => setTradeType(v as 'buy' | 'sell')}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="buy">Buy</TabsTrigger>
                  <TabsTrigger value="sell">Sell</TabsTrigger>
                </TabsList>

                <TabsContent value="buy" className="space-y-4">
                  {/* Position Selection */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={position === 'YES' ? 'default' : 'outline'}
                      className={position === 'YES' ? 'bg-success hover:bg-success/90' : 'hover:border-success hover:text-success'}
                      onClick={() => setPosition('YES')}
                    >
                      YES {Math.round(currentMarket.yesPrice * 100)}¢
                    </Button>
                    <Button
                      variant={position === 'NO' ? 'default' : 'outline'}
                      className={position === 'NO' ? 'bg-destructive hover:bg-destructive/90' : 'hover:border-destructive hover:text-destructive'}
                      onClick={() => setPosition('NO')}
                    >
                      NO {Math.round(currentMarket.noPrice * 100)}¢
                    </Button>
                  </div>

                  {/* Amount Input */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Amount (USDC)</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="input-dark text-lg"
                    />
                  </div>

                  {/* Trade Summary */}
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">You receive</span>
                      <span className="font-medium">{tokensReceived} {position}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price per token</span>
                      <span>{Math.round(price * 100)}¢</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Est. price impact</span>
                      <span className="text-warning">{priceImpact}%</span>
                    </div>
                  </div>

                  {/* Trade Button */}
                  <Button 
                    className="w-full btn-primary-gradient"
                    onClick={handleTradeStart}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Confirming...
                      </>
                    ) : !isConnected ? (
                      'Connect Wallet'
                    ) : (
                      `Buy ${position}`
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Est. settlement: ~5 seconds
                  </p>

                  {txProgress.phase !== 'idle' && (
                    <div className={`p-3 rounded-lg border ${txProgress.phase === 'error' ? 'bg-red-500/10 border-red-500/20' : 'bg-primary/10 border-primary/20'}`}>
                      <p className="text-xs font-medium mb-1">Transaction Status</p>
                      <p className="text-xs text-muted-foreground">{txProgress.message}</p>
                      <div className="w-full h-1.5 rounded bg-muted/50 mt-2 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${txProgress.phase === 'error' ? 'bg-red-500' : 'bg-primary'}`}
                          style={{
                            width:
                              txProgress.phase === 'building' ? '20%' :
                              txProgress.phase === 'signing' ? '40%' :
                              txProgress.phase === 'submitting' ? '65%' :
                              txProgress.phase === 'confirming' ? '85%' :
                              txProgress.phase === 'success' ? '100%' : '100%'
                          }}
                        />
                      </div>
                      {txProgress.txHash && (
                        <p className="text-[10px] text-muted-foreground mt-2 break-all">Hash: {txProgress.txHash}</p>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="sell" className="space-y-4">
                  <p className="text-center text-muted-foreground py-8">
                    Connect wallet to view your positions to sell
                  </p>
                </TabsContent>
              </Tabs>
            </div>

            {/* Market Info */}
            <div className="glass-card p-6 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Info className="w-4 h-4" />
                Market Info
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Total Volume
                  </span>
                  <span className="font-medium">{formatVolume(currentMarket.volume)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Traders
                  </span>
                  <span className="font-medium">{currentMarket.traders}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Created
                  </span>
                  <span className="font-medium">{new Date(currentMarket.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Expires
                  </span>
                  <div className="text-right">
                    <div className="font-medium">{new Date(currentMarket.expirationDate).toLocaleDateString()}</div>
                    <CountdownTimer expiryDate={currentMarket.expirationDate} className="mt-1" />
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Resolution Source</p>
                <p className="text-sm">{currentMarket.resolutionSource}</p>
              </div>
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">Creator</p>
                <a href="#" className="text-sm text-primary flex items-center gap-1 hover:underline">
                  {currentMarket.creator}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TradeConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleTradeConfirm}
        isLoading={isLoading}
        tradeDetails={{
          type: tradeType,
          position: position,
          amount: amount,
          price: price,
          tokensReceived: tokensReceived,
          priceImpact: priceImpact,
          fee: estimatedFee,
          slippage: "1.0",
        }}
      />
    </Layout>
  );
}
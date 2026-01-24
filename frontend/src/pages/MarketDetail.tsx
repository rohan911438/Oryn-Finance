import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Users, Calendar, Clock, ExternalLink, Info, Loader2 } from 'lucide-react';
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

function formatVolume(volume: number): string {
  if (volume >= 1000000) return `$${(volume / 1000000).toFixed(2)}M`;
  if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
  return `$${volume}`;
}

export default function MarketDetail() {
  const { id } = useParams();
  const { isConnected, connect, publicKey } = useWallet();
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [position, setPosition] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [market, setMarket] = useState<Market | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch market data from API
  const fetchMarketData = async () => {
    if (!id) return;
    
    try {
      setLoadingMarket(true);
      setError(null);
      
      // Fetch market details
      const marketData = await apiService.markets.getMarket(id);
      setMarket(marketData);
      
      // Fetch market trades
      const tradesData = await apiService.markets.getMarketTrades(id);
      setRecentTrades(tradesData || []);
      
      // For now, generate mock price history since this might not be available yet
      const mockHistory = Array.from({ length: 24 }, (_, i) => {
        const time = new Date(Date.now() - (23 - i) * 60 * 60 * 1000).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        return {
          time,
          yes: Math.max(0.2, Math.min(0.8, 0.5 + Math.sin(i * 0.3) * 0.2 + (Math.random() - 0.5) * 0.1)),
          no: Math.max(0.2, Math.min(0.8, 0.5 - Math.sin(i * 0.3) * 0.2 + (Math.random() - 0.5) * 0.1))
        };
      });
      setPriceHistory(mockHistory);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch market data');
      console.error('Error fetching market data:', err);
    } finally {
      setLoadingMarket(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
  }, [id]);

  if (loadingMarket) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Loading market...</h1>
        </div>
      </Layout>
    );
  }

  if (error || !market) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">{error || 'Market not found'}</h1>
          <Link to="/markets">
            <Button>Back to Markets</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const price = position === 'YES' ? market.yesPrice : market.noPrice;
  const tokensReceived = amount ? (parseFloat(amount) / price).toFixed(2) : '0';
  const priceImpact = amount ? Math.min(parseFloat(amount) * 0.001, 2).toFixed(2) : '0';

  const handleTrade = async () => {
    if (!isConnected) {
      connect();
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!publicKey) {
      toast.error('Wallet not connected properly');
      return;
    }
    if (!market) {
      toast.error('Market data not loaded');
      return;
    }

    setIsLoading(true);
    try {
      // Build transaction using backend
      const transactionData = tradeType === 'buy'
        ? await apiService.transactions.buildBuyTokens({
            marketId: market.id,
            tokenType: position.toLowerCase() as 'yes' | 'no',
            amount: parseFloat(amount),
            maxSlippage: 0.01 // 1% slippage
          }, publicKey)
        : await apiService.transactions.buildSellTokens({
            marketId: market.id,
            tokenType: position.toLowerCase() as 'yes' | 'no',
            amount: parseFloat(amount),
            maxSlippage: 0.01
          }, publicKey);

      if (transactionData.success) {
        // Here you would sign the transaction with the wallet
        // For now, we'll simulate success
        toast.success(`Transaction built successfully`, {
          description: `Ready to ${tradeType} ${tokensReceived} ${position} tokens`,
        });
        
        // Reset form after successful trade
        setAmount('');
        
        // Refresh market data
        fetchMarketData();
      } else {
        toast.error(transactionData.message || 'Failed to build transaction');
      }
    } catch (error) {
      console.error('Trade error:', error);
      toast.error(error instanceof Error ? error.message : 'Transaction failed');
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
                  {market.category}
                </Badge>
                {market.status === 'Trending' && (
                  <Badge className="bg-gradient-to-r from-primary to-secondary">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Trending
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-4">{market.question}</h1>
              {market.description && (
                <p className="text-muted-foreground mb-4">{market.description}</p>
              )}
              
              {/* Current Prices */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                  <div className="text-sm text-muted-foreground mb-1">YES Price</div>
                  <div className="text-3xl font-bold text-success">{Math.round(market.yesPrice * 100)}¢</div>
                </div>
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                  <div className="text-sm text-muted-foreground mb-1">NO Price</div>
                  <div className="text-3xl font-bold text-destructive">{Math.round(market.noPrice * 100)}¢</div>
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
                      YES {Math.round(market.yesPrice * 100)}¢
                    </Button>
                    <Button
                      variant={position === 'NO' ? 'default' : 'outline'}
                      className={position === 'NO' ? 'bg-destructive hover:bg-destructive/90' : 'hover:border-destructive hover:text-destructive'}
                      onClick={() => setPosition('NO')}
                    >
                      NO {Math.round(market.noPrice * 100)}¢
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
                    onClick={handleTrade}
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
                  <span className="font-medium">{formatVolume(market.volume)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Traders
                  </span>
                  <span className="font-medium">{market.traders}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Created
                  </span>
                  <span className="font-medium">{new Date(market.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Expires
                  </span>
                  <span className="font-medium">{new Date(market.expirationDate).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Resolution Source</p>
                <p className="text-sm">{market.resolutionSource}</p>
              </div>
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">Creator</p>
                <a href="#" className="text-sm text-primary flex items-center gap-1 hover:underline">
                  {market.creator}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

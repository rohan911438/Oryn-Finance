import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Wallet, TrendingUp, TrendingDown, PieChart, History, ArrowRight, RefreshCw, ExternalLink } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWallet } from '@/contexts/WalletContext';
import { apiService } from '@/services/apiService';
import { Position } from '@/data/mockData';
import { MagicCard } from '@/components/magicui/magic-card';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export default function Portfolio() {
  const { isConnected, connect, publicKey, xlmBalance, usdcBalance } = useWallet();
  const [userPositions, setUserPositions] = useState<Position[]>([]);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [userStats, setUserStats] = useState({
    totalTrades: 0,
    winRate: 0,
    totalProfitLoss: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    netPnL: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user portfolio data from API
  const fetchPortfolioData = async () => {
    if (!publicKey || !isConnected) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const [positionsData, statsData, profile, tradesData] = await Promise.all([
        apiService.users.getUserPositions(publicKey, { status: 'active', limit: 50 }),
        apiService.users.getUserStats(publicKey, { timeframe: '30d' }),
        apiService.users.getUserByAddress(publicKey),
        apiService.trades.getTradeHistory(publicKey, { limit: 10 }).catch(() => [])
      ]);

      const mappedPositions: Position[] = (positionsData || []).map((position: any) => {
        const currentPrice = Number(position.currentPrice ?? position.averageEntryPrice ?? 0.5);
        const averageEntryPrice = Number(position.averageEntryPrice ?? 0.5);
        const shares = Number(position.availableShares ?? position.totalShares ?? 0);
        const tokenType = String(position.tokenType || 'yes').toUpperCase();

        return {
          marketId: position.marketId?.marketId || position.marketId,
          marketQuestion: position.marketId?.question || 'Prediction market',
          position: tokenType === 'YES' ? 'YES' : 'NO',
          amount: shares,
          avgPrice: averageEntryPrice,
          currentPrice,
          unrealizedPnL: Number(position.unrealizedPnL || 0)
        };
      });

      setUserPositions(mappedPositions);
      setTradeHistory(tradesData?.trades || tradesData || []);

      const winRatePercent = Number((profile?.statistics?.winRate || 0) * 100);

      setUserStats({
        totalTrades: Number(statsData?.trades?.totalTrades || 0),
        winRate: winRatePercent,
        totalProfitLoss: Number(statsData?.netPnL || 0),
        realizedPnL: Number(statsData?.positions?.totalRealizedPnL || 0),
        unrealizedPnL: Number(statsData?.positions?.totalUnrealizedPnL || 0),
        netPnL: Number(statsData?.netPnL || 0)
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch portfolio data');
      console.error('Error fetching portfolio data:', err);
      // Use empty data on error
      setUserPositions([]);
      setTradeHistory([]);
      setUserStats({ totalTrades: 0, winRate: 0, totalProfitLoss: 0, realizedPnL: 0, unrealizedPnL: 0, netPnL: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && publicKey) {
      fetchPortfolioData();
    }
  }, [isConnected, publicKey]);

  if (!isConnected) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-md mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Wallet className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-4">Connect Your Wallet</h1>
            <p className="text-muted-foreground mb-8">
              Connect your Freighter wallet to view your portfolio, positions, and trading history.
            </p>
            <Button onClick={connect} className="btn-primary-gradient">
              <Wallet className="w-4 h-4 mr-2" />
              Connect Wallet
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const totalValue = userPositions.reduce((sum, p) => sum + (p.amount * p.currentPrice), 0);
  const totalPnL = userStats.unrealizedPnL;
  const totalInvested = userPositions.reduce((sum, p) => sum + (p.amount * p.avgPrice), 0);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">Portfolio</h1>
            {isConnected && (
              <Button
                onClick={fetchPortfolioData}
                disabled={loading}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
          </div>
          <p className="text-muted-foreground">
            Connected: {publicKey || 'Not connected'}
          </p>
          {error && (
            <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              Error: {error}
            </div>
          )}
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <MagicCard className="glass-card p-6" gradientColor="#262626">
            <p className="text-sm text-muted-foreground mb-1">XLM Balance</p>
            <p className="text-2xl font-bold">{xlmBalance}</p>
          </MagicCard>
          <MagicCard className="glass-card p-6" gradientColor="#262626">
            <p className="text-sm text-muted-foreground mb-1">USDC Balance</p>
            <p className="text-2xl font-bold">{usdcBalance}</p>
          </MagicCard>
          <MagicCard className="glass-card p-6" gradientColor="#262626">
            <p className="text-sm text-muted-foreground mb-1">Portfolio Value</p>
            <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
          </MagicCard>
          <MagicCard className="glass-card p-6" gradientColor="#262626">
            <p className="text-sm text-muted-foreground mb-1">Unrealized P&L</p>
            <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
            </p>
          </MagicCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <MagicCard className="glass-card p-5" gradientColor="#262626">
            <p className="text-sm text-muted-foreground mb-1">Realized Gains</p>
            <p className={`text-xl font-bold ${userStats.realizedPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
              {userStats.realizedPnL >= 0 ? '+' : ''}{formatCurrency(userStats.realizedPnL)}
            </p>
          </MagicCard>
          <MagicCard className="glass-card p-5" gradientColor="#262626">
            <p className="text-sm text-muted-foreground mb-1">Unrealized Gains</p>
            <p className={`text-xl font-bold ${userStats.unrealizedPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
              {userStats.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(userStats.unrealizedPnL)}
            </p>
          </MagicCard>
          <MagicCard className="glass-card p-5" gradientColor="#262626">
            <p className="text-sm text-muted-foreground mb-1">Net P&L</p>
            <p className={`text-xl font-bold ${userStats.netPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
              {userStats.netPnL >= 0 ? '+' : ''}{formatCurrency(userStats.netPnL)}
            </p>
          </MagicCard>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="p-4 rounded-lg bg-muted/30 text-center">
            <PieChart className="w-5 h-5 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{userPositions.length}</p>
            <p className="text-xs text-muted-foreground">Active Positions</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 text-center">
            <History className="w-5 h-5 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{userStats.totalTrades}</p>
            <p className="text-xs text-muted-foreground">Total Trades</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-2 text-success" />
            <p className="text-2xl font-bold">{userStats.winRate.toFixed(0)}%</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 text-center">
            <TrendingDown className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-bold">{formatCurrency(totalInvested)}</p>
            <p className="text-xs text-muted-foreground">Total Invested</p>
          </div>
        </div>

        {/* Active Positions */}
        <MagicCard className="glass-card p-6 mb-8" gradientColor="#262626">
          <h2 className="text-xl font-semibold mb-6">Active Positions</h2>
          <div className="space-y-4">
            {userPositions.map((position) => {
              const currentValue = position.amount * position.currentPrice;
              const pnlPercent = ((position.currentPrice - position.avgPrice) / position.avgPrice) * 100;

              return (
                <Link
                  key={position.marketId}
                  to={`/market/${position.marketId}`}
                  className="block p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className={position.position === 'YES' ? 'bg-success/10 text-success border-success/30' : 'bg-destructive/10 text-destructive border-destructive/30'}
                        >
                          {position.position}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {position.amount} tokens @ {Math.round(position.avgPrice * 100)}¢
                        </span>
                      </div>
                      <p className="font-medium line-clamp-1">{position.marketQuestion}</p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Current Value</p>
                        <p className="font-semibold">{formatCurrency(currentValue)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Unrealized P&L</p>
                        <p className={`font-semibold ${position.unrealizedPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {position.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnL)}
                          <span className="text-xs ml-1">({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)</span>
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </MagicCard>

        {/* Trade History */}
        <MagicCard className="glass-card p-6" gradientColor="#262626">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Recent Trade History</h2>
          </div>
          {tradeHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Your completed trades will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tradeHistory.map((trade: any) => (
                <Link
                  key={trade.tradeId || trade._id}
                  to={`/trade/${trade.tradeId || trade._id}`}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${trade.tradeType === 'buy' ? 'bg-success' : 'bg-destructive'}`} />
                    <div>
                      <p className="text-sm font-medium capitalize">
                        {trade.tradeType} {trade.tokenType?.toUpperCase()} — {trade.amount} tokens
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(trade.timestamp || trade.createdAt).toLocaleDateString()}
                        {' · '}
                        {Math.round((trade.price ?? 0) * 100)}¢ per token
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(trade.totalCost ?? 0)}
                      </p>
                      <p className={`text-xs capitalize ${
                        trade.status === 'confirmed' ? 'text-success' :
                        trade.status === 'failed' ? 'text-destructive' : 'text-warning'
                      }`}>{trade.status}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </MagicCard>
      </div>
    </Layout>
  );
}

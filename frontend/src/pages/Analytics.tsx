import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, LineChart as LineChartIcon, RefreshCw, TrendingUp, UserCircle2 } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { MagicCard } from '@/components/magicui/magic-card';
import { useWallet } from '@/contexts/WalletContext';
import { apiService } from '@/services/apiService';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const TIMEFRAMES = ['24h', '7d', '30d', '1y'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value || 0);
}

export default function Analytics() {
  const { publicKey, isConnected } = useWallet();
  const [timeframe, setTimeframe] = useState<Timeframe>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformStats, setPlatformStats] = useState<any>(null);
  const [marketTrends, setMarketTrends] = useState<any[]>([]);
  const [priceTrends, setPriceTrends] = useState<any[]>([]);
  const [userInsights, setUserInsights] = useState<any>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const [stats, trends, prices, insights] = await Promise.all([
        apiService.analytics.getPlatformStats(timeframe),
        apiService.analytics.getMarketTrends({ timeframe }),
        apiService.analytics.getPriceTrends({ timeframe }),
        publicKey ? apiService.analytics.getUserInsights(publicKey, timeframe) : Promise.resolve(null)
      ]);

      setPlatformStats(stats);
      setMarketTrends(trends?.volumeTrends || []);
      setPriceTrends(prices?.priceTrends || []);
      setUserInsights(insights);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, publicKey]);

  const pnlTrend = useMemo(() => userInsights?.trend || [], [userInsights]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Analytics Dashboard</h1>
            <p className="text-muted-foreground">Market trends, price action, and personal trading insights.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {TIMEFRAMES.map((tf) => (
              <Button
                key={tf}
                variant={timeframe === tf ? 'default' : 'outline'}
                onClick={() => setTimeframe(tf)}
                disabled={loading}
                size="sm"
              >
                {tf}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            Error: {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MagicCard className="glass-card p-5" gradientColor="#262626">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Total Volume</p>
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{formatMoney(platformStats?.overview?.totalVolume || 0)}</p>
          </MagicCard>
          <MagicCard className="glass-card p-5" gradientColor="#262626">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Total Trades</p>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{platformStats?.overview?.totalTrades || 0}</p>
          </MagicCard>
          <MagicCard className="glass-card p-5" gradientColor="#262626">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Active Markets</p>
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{platformStats?.overview?.activeMarkets || 0}</p>
          </MagicCard>
          <MagicCard className="glass-card p-5" gradientColor="#262626">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Total Users</p>
              <UserCircle2 className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{platformStats?.overview?.totalUsers || 0}</p>
          </MagicCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
          <MagicCard className="glass-card p-6" gradientColor="#262626">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Volume & Trade Activity</h2>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marketTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="_id" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="volume" fill="hsl(var(--chart-volume))" name="Volume" />
                  <Bar dataKey="trades" fill="hsl(var(--chart-yes))" name="Trades" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </MagicCard>

          <MagicCard className="glass-card p-6" gradientColor="#262626">
            <div className="flex items-center gap-2 mb-4">
              <LineChartIcon className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">YES / NO Price Trends</h2>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="timestamp" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" domain={[0, 1]} />
                  <Tooltip
                    formatter={(value: any) => `${(Number(value || 0) * 100).toFixed(1)}c`}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="yesPrice" stroke="hsl(var(--chart-yes))" strokeWidth={2} dot={false} name="YES" />
                  <Line type="monotone" dataKey="noPrice" stroke="hsl(var(--chart-no))" strokeWidth={2} dot={false} name="NO" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </MagicCard>
        </div>

        <MagicCard className="glass-card p-6" gradientColor="#262626">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">User P&L Tracking</h2>
          </div>

          {!isConnected && (
            <p className="text-muted-foreground text-sm">Connect your wallet to see personalized P&L insights.</p>
          )}

          {isConnected && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">Realized P&L</p>
                  <p className={`text-xl font-bold ${(userInsights?.summary?.realizedPnL || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatMoney(userInsights?.summary?.realizedPnL || 0)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">Unrealized P&L</p>
                  <p className={`text-xl font-bold ${(userInsights?.summary?.unrealizedPnL || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatMoney(userInsights?.summary?.unrealizedPnL || 0)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">Net P&L</p>
                  <p className={`text-xl font-bold ${(userInsights?.summary?.netPnL || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatMoney(userInsights?.summary?.netPnL || 0)}
                  </p>
                </div>
              </div>

              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pnlTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="timestamp" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      formatter={(value: any) => formatMoney(Number(value || 0))}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="cashFlowPnL" stroke="hsl(var(--chart-no))" strokeWidth={2} dot={false} name="Daily Cashflow P&L" />
                    <Line type="monotone" dataKey="cumulativePnL" stroke="hsl(var(--chart-yes))" strokeWidth={3} dot={false} name="Cumulative P&L" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </MagicCard>
      </div>
    </Layout>
  );
}

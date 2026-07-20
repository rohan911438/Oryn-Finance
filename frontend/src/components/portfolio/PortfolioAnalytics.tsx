import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart2, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { MagicCard } from '@/components/magicui/magic-card';
import { Button } from '@/components/ui/button';
import { apiService } from '@/services/apiService';

type Timeframe = '24h' | '7d' | '30d' | '1y';

interface PerformanceSeries {
  date: string;
  totalCost: number;
  tradeCount: number;
  avgPrice: number;
  totalFees: number;
}

interface AllocationItem {
  tokenType: string;
  totalCost: number;
  tradeCount: number;
  percentage: number;
}

interface YieldData {
  totalInvested: number;
  totalReturns: number;
  realizedPnL: number;
  roi: number;
  fees: { total: number; platform: number; stellar: number };
  tradeCounts: { buys: number; sells: number };
  timeframe: string;
}

interface GrowthData {
  last7Days:    { volume: number; trades: number };
  last30Days:   { volume: number; trades: number };
  allTime:      { volume: number; trades: number; since: string | null };
  weekOverWeek: number;
}

const ALLOC_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444'];
const TIMEFRAMES: Timeframe[] = ['24h', '7d', '30d', '1y'];

function fmtUsd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export default function PortfolioAnalytics({ walletAddress }: { walletAddress: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('30d');
  const [series, setSeries]       = useState<PerformanceSeries[]>([]);
  const [allocation, setAllocation] = useState<AllocationItem[]>([]);
  const [yieldData, setYieldData] = useState<YieldData | null>(null);
  const [growth, setGrowth]       = useState<GrowthData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiService.get(`/portfolio/${walletAddress}/performance?timeframe=${timeframe}`),
      apiService.get(`/portfolio/${walletAddress}/allocation?timeframe=${timeframe}`),
      apiService.get(`/portfolio/${walletAddress}/yield?timeframe=${timeframe}`),
      apiService.get(`/portfolio/${walletAddress}/growth`),
    ])
      .then(([perf, alloc, yld, grw]) => {
        setSeries(perf.data?.series || []);
        setAllocation(alloc.data?.allocation || []);
        setYieldData(yld.data || null);
        setGrowth(grw.data || null);
      })
      .catch((err) => setError(err?.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [walletAddress, timeframe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading performance analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive text-center py-8">{error}</div>
    );
  }

  const hasYieldActivity = Boolean(
    yieldData &&
      (yieldData.totalInvested !== 0 ||
        yieldData.totalReturns !== 0 ||
        yieldData.realizedPnL !== 0 ||
        yieldData.roi !== 0 ||
        yieldData.fees.total !== 0 ||
        yieldData.tradeCounts.buys !== 0 ||
        yieldData.tradeCounts.sells !== 0)
  );

  const isEmpty = !hasYieldActivity && series.length === 0 && allocation.length === 0;

  const pnlPositive = (yieldData?.realizedPnL ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Timeframe picker */}
      <div className="flex gap-2 flex-wrap">
        {TIMEFRAMES.map((tf) => (
          <Button
            key={tf}
            size="sm"
            variant={timeframe === tf ? 'default' : 'outline'}
            onClick={() => setTimeframe(tf)}
          >
            {tf}
          </Button>
        ))}
      </div>

      {isEmpty && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No analytics data yet. Start trading to see your performance.
        </div>
      )}

      {/* Metric cards */}
      {!isEmpty && yieldData && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MagicCard className="p-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Invested
            </div>
            <p className="text-lg font-semibold">{fmtUsd(yieldData.totalInvested)}</p>
          </MagicCard>
          <MagicCard className="p-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Returns
            </div>
            <p className="text-lg font-semibold">{fmtUsd(yieldData.totalReturns)}</p>
          </MagicCard>
          <MagicCard className="p-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              {pnlPositive
                ? <TrendingUp className="w-3 h-3 text-success" />
                : <TrendingDown className="w-3 h-3 text-destructive" />}
              Realized P&amp;L
            </div>
            <p className={`text-lg font-semibold ${pnlPositive ? 'text-success' : 'text-destructive'}`}>
              {fmtUsd(yieldData.realizedPnL)}
            </p>
          </MagicCard>
          <MagicCard className="p-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <BarChart2 className="w-3 h-3" /> ROI
            </div>
            <p className={`text-lg font-semibold ${yieldData.roi >= 0 ? 'text-success' : 'text-destructive'}`}>
              {fmtPct(yieldData.roi)}
            </p>
          </MagicCard>
        </div>
      )}

      {/* Performance area chart */}
      {!isEmpty && series.length > 0 && (
        <MagicCard className="p-6">
          <h3 className="text-sm font-semibold mb-4">Trading Volume Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.05} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => fmtUsd(v)} />
              <Area type="monotone" dataKey="totalCost" stroke="#6366f1" fill="url(#perfGrad)" strokeWidth={2} dot={false} name="Volume" />
            </AreaChart>
          </ResponsiveContainer>
        </MagicCard>
      )}

      {/* Allocation + bar chart row */}
      {!isEmpty && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {allocation.length > 0 && (
          <MagicCard className="p-6">
            <h3 className="text-sm font-semibold mb-4">Position Allocation</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={allocation}
                  dataKey="totalCost"
                  nameKey="tokenType"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ tokenType, percentage }) => `${String(tokenType).toUpperCase()} ${percentage}%`}
                >
                  {allocation.map((_, i) => (
                    <Cell key={i} fill={ALLOC_COLORS[i % ALLOC_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtUsd(v)} />
              </PieChart>
            </ResponsiveContainer>
          </MagicCard>
        )}

        {series.length > 0 && (
          <MagicCard className="p-6">
            <h3 className="text-sm font-semibold mb-4">Trade Count by Period</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.05} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="tradeCount" name="Trades" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </MagicCard>
        )}
      </div>
      )}

      {/* Growth metrics */}
      {!isEmpty && growth && (
        <MagicCard className="p-6">
          <h3 className="text-sm font-semibold mb-4">Growth Metrics</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">7-day volume</p>
              <p className="text-base font-semibold mt-1">{fmtUsd(growth.last7Days.volume)}</p>
              <p className="text-xs text-muted-foreground">{growth.last7Days.trades} trades</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">30-day volume</p>
              <p className="text-base font-semibold mt-1">{fmtUsd(growth.last30Days.volume)}</p>
              <p className="text-xs text-muted-foreground">{growth.last30Days.trades} trades</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">All-time volume</p>
              <p className="text-base font-semibold mt-1">{fmtUsd(growth.allTime.volume)}</p>
              <p className="text-xs text-muted-foreground">{growth.allTime.trades} trades</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Week-over-week</p>
              <p className={`text-base font-semibold mt-1 ${growth.weekOverWeek >= 0 ? 'text-success' : 'text-destructive'}`}>
                {fmtPct(growth.weekOverWeek)}
              </p>
            </div>
          </div>
        </MagicCard>
      )}

      {/* Fee breakdown */}
      {yieldData && (
        <MagicCard className="p-4">
          <h3 className="text-sm font-semibold mb-3">Fee Breakdown</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Platform: </span>
              <span className="font-medium">{fmtUsd(yieldData.fees.platform)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Stellar: </span>
              <span className="font-medium">{fmtUsd(yieldData.fees.stellar)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total fees: </span>
              <span className="font-medium">{fmtUsd(yieldData.fees.total)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Trades: </span>
              <span className="font-medium">{yieldData.tradeCounts.buys} buys / {yieldData.tradeCounts.sells} sells</span>
            </div>
          </div>
        </MagicCard>
      )}
    </div>
  );
}

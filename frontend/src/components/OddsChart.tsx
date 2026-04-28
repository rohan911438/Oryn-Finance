import { useEffect, useRef, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { useMarketUpdates } from '@/contexts/WebSocketContext';

interface OddsPoint {
  time: string;
  yes: number; // probability 0–100
  no: number;
}

interface OddsChartProps {
  marketId: string;
  initialYesPrice: number; // AMM price 0–1
  initialNoPrice: number;
}

/** Convert AMM price (0–1) to probability percentage, clamped 1–99 */
function toProb(price: number): number {
  return Math.min(99, Math.max(1, Math.round(price * 100)));
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/** Seed 24-hour history from initial prices with slight noise */
function seedHistory(yesPrice: number, noPrice: number): OddsPoint[] {
  return Array.from({ length: 24 }, (_, i) => {
    const t = new Date(Date.now() - (23 - i) * 60 * 60 * 1000);
    const label = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const noise = (Math.random() - 0.5) * 0.04;
    const y = toProb(Math.min(0.99, Math.max(0.01, yesPrice + Math.sin(i * 0.3) * 0.05 + noise)));
    return { time: label, yes: y, no: 100 - y };
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const yes = payload.find((p: any) => p.dataKey === 'yes');
  const no = payload.find((p: any) => p.dataKey === 'no');
  return (
    <div className="glass-card px-3 py-2 text-xs border border-white/10 space-y-1">
      <p className="text-white/50 mb-1">{label}</p>
      {yes && <p className="text-emerald-400 font-semibold">YES {yes.value}%</p>}
      {no && <p className="text-red-400 font-semibold">NO {no.value}%</p>}
    </div>
  );
};

export function OddsChart({ marketId, initialYesPrice, initialNoPrice }: OddsChartProps) {
  const [history, setHistory] = useState<OddsPoint[]>(() =>
    seedHistory(initialYesPrice, initialNoPrice)
  );
  const [liveYes, setLiveYes] = useState(toProb(initialYesPrice));
  const [isLive, setIsLive] = useState(false);
  const MAX_POINTS = 60;

  const { marketData, connectionQuality } = useMarketUpdates(marketId);

  // Push new point whenever WebSocket delivers a price update
  useEffect(() => {
    if (!marketData) return;

    const rawYes =
      marketData.prices?.yes ??
      marketData.currentYesPrice ??
      marketData.yesPrice;

    if (rawYes == null) return;

    const yesProb = toProb(rawYes);
    setLiveYes(yesProb);
    setIsLive(true);

    setHistory(prev => {
      const next = [...prev, { time: nowLabel(), yes: yesProb, no: 100 - yesProb }];
      return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
    });
  }, [marketData]);

  const currentYes = history[history.length - 1]?.yes ?? liveYes;
  const currentNo = 100 - currentYes;

  return (
    <div className="space-y-3">
      {/* Live odds pills */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-bold text-emerald-400">YES {currentYes}%</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-sm font-bold text-red-400">NO {currentNo}%</span>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`text-[10px] ${
            isLive && connectionQuality === 'good'
              ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
              : 'border-white/20 text-white/40'
          }`}
        >
          {isLive && connectionQuality === 'good' ? '● LIVE' : 'HISTORICAL'}
        </Badge>
      </div>

      {/* Area chart */}
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradYes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradNo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="4 4" />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-white/60 capitalize">{value}</span>
              )}
            />
            <Area
              type="monotone"
              dataKey="yes"
              name="YES"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradYes)"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="no"
              name="NO"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#gradNo)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

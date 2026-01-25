import { Link } from 'react-router-dom';
import { TrendingUp, Clock, Users, ArrowRight } from 'lucide-react';
import { Market } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MagicCard } from '@/components/magicui/magic-card';
import { cn } from '@/lib/utils';

interface MarketCardProps {
  market: Market;
  featured?: boolean;
}

function formatVolume(volume: number): string {
  if (volume >= 1000000) {
    return `$${(volume / 1000000).toFixed(1)}M`;
  }
  if (volume >= 1000) {
    return `$${(volume / 1000).toFixed(0)}K`;
  }
  return `$${volume}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const categoryColors: Record<string, string> = {
  Crypto: 'bg-primary/20 text-primary border-primary/30',
  Sports: 'bg-success/20 text-success border-success/30',
  Politics: 'bg-secondary/20 text-secondary border-secondary/30',
  Entertainment: 'bg-warning/20 text-warning border-warning/30',
};

export function MarketCard({ market, featured = false }: MarketCardProps) {
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);

  console.log('MarketCard rendering with market:', market.id, market.question); // Debug log

  return (
    <Link to={`/market/${market.id}`} className="block group">
      <div className={cn(
        "relative p-6 rounded-[2rem] bg-[#0a0a0a] border border-white/5 overflow-hidden transition-all duration-500 hover:border-white/10 hover:bg-[#0f0f0f] shadow-2xl cursor-pointer",
        featured && "ring-1 ring-white/10"
      )}>
        {/* Glow Effect */}
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-32 h-32 bg-primary/5 rounded-full blur-[60px] group-hover:bg-primary/10 transition-colors" />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-2 mb-6">
            <span className={cn(
              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10 bg-white/5 text-white/70"
            )}>
              {market.category}
            </span>
            {market.status === 'Trending' && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                <TrendingUp className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase">Trending</span>
              </div>
            )}
          </div>

          <h3 className="text-lg font-bold mb-6 line-clamp-2 text-white leading-tight group-hover:text-primary transition-colors">
            {market.question}
          </h3>

          {/* Stats Grid - Matching image style */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
              <span className="block text-[10px] font-bold text-white/40 uppercase mb-1">Volume</span>
              <span className="text-sm font-bold text-white">{formatVolume(market.volume)}</span>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
              <span className="block text-[10px] font-bold text-white/40 uppercase mb-1">Traders</span>
              <span className="text-sm font-bold text-white">{market.traders}</span>
            </div>
          </div>

          {/* Price Layout */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                <span className="text-xs font-black text-success">YES</span>
              </div>
              <span className="text-sm font-black text-white">{yesPercent}¢</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                <span className="text-xs font-black text-destructive">NO</span>
              </div>
              <span className="text-sm font-black text-white">{noPercent}¢</span>
            </div>
          </div>

          {/* Trade Button */}
          <div className="w-full py-3 rounded-xl bg-white text-black text-center text-xs font-black uppercase tracking-tighter transition-all hover:bg-white/90 transform group-hover:translate-y-[-2px] shadow-xl shadow-white/5">
            Trade Predictions
          </div>
        </div>
      </div>
    </Link>
  );
}

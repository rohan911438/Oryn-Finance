import { Link } from 'react-router-dom';
import { TrendingUp, Clock, Users, ArrowRight } from 'lucide-react';
import { Market } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

  return (
    <Link to={`/market/${market.id}`}>
      <div className={`market-card ${featured ? 'gradient-border' : ''}`}>
        <div className="flex items-start justify-between gap-2 mb-4">
          <Badge 
            variant="outline" 
            className={`${categoryColors[market.category]} text-xs font-medium`}
          >
            {market.category}
          </Badge>
          {market.status === 'Trending' && (
            <Badge className="bg-gradient-to-r from-primary to-secondary text-primary-foreground text-xs">
              <TrendingUp className="w-3 h-3 mr-1" />
              Trending
            </Badge>
          )}
        </div>

        <h3 className="text-base font-semibold mb-4 line-clamp-2 group-hover:text-primary transition-colors">
          {market.question}
        </h3>

        {/* Price Bars */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-success">YES</span>
            <span className="text-sm font-bold text-success">{yesPercent}¢</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-success to-success/70 rounded-full transition-all duration-500"
              style={{ width: `${yesPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-destructive">NO</span>
            <span className="text-sm font-bold text-destructive">{noPercent}¢</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-destructive to-destructive/70 rounded-full transition-all duration-500"
              style={{ width: `${noPercent}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{formatVolume(market.volume)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>{market.traders}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDate(market.expirationDate)}</span>
          </div>
        </div>

        {/* Quick Trade Button */}
        <Button 
          className="w-full mt-4 bg-muted hover:bg-primary hover:text-primary-foreground transition-all group"
          variant="ghost"
        >
          Trade Now
          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </Link>
  );
}

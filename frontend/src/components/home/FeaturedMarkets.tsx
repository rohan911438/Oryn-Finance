import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketCard } from '@/components/markets/MarketCard';
import { featuredMarkets } from '@/data/mockData';

export function FeaturedMarkets() {
  return (
    <section className="py-20 relative">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span className="text-sm text-primary font-medium">Hot Markets</span>
            </div>
            <h2 className="text-3xl font-bold">Trending Predictions</h2>
          </div>
          <Link to="/markets">
            <Button variant="ghost" className="group">
              View All Markets
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredMarkets.map((market, index) => (
            <div 
              key={market.id} 
              className="animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <MarketCard market={market} featured />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

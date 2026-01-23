import { useState, useMemo } from 'react';
import { Search, Filter, SortAsc } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { MarketCard } from '@/components/markets/MarketCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { allMarkets, categories, statusFilters } from '@/data/mockData';

type SortOption = 'volume' | 'newest' | 'ending';

export default function Markets() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('volume');

  const filteredMarkets = useMemo(() => {
    let markets = [...allMarkets];

    // Filter by search
    if (searchQuery) {
      markets = markets.filter(m => 
        m.question.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory !== 'All') {
      markets = markets.filter(m => m.category === selectedCategory);
    }

    // Filter by status
    if (selectedStatus !== 'All') {
      markets = markets.filter(m => m.status === selectedStatus);
    }

    // Sort
    switch (sortBy) {
      case 'volume':
        markets.sort((a, b) => b.volume - a.volume);
        break;
      case 'newest':
        markets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'ending':
        markets.sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime());
        break;
    }

    return markets;
  }, [searchQuery, selectedCategory, selectedStatus, sortBy]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">All Markets</h1>
          <p className="text-muted-foreground">
            Browse and trade on {allMarkets.length} prediction markets
          </p>
        </div>

        {/* Search and Filters */}
        <div className="glass-card p-4 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search markets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 input-dark"
              />
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap gap-2">
              <Filter className="w-5 h-5 text-muted-foreground self-center mr-2 hidden sm:block" />
              {categories.map((category) => (
                <Button
                  key={category}
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className={`tab-button ${selectedCategory === category ? 'active' : ''}`}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* Status Filters and Sort */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 mt-4 pt-4 border-t border-border/50">
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((status) => (
                <Button
                  key={status}
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStatus(status)}
                  className={`tab-button ${selectedStatus === status ? 'active' : ''}`}
                >
                  {status}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <SortAsc className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Sort:</span>
              {(['volume', 'newest', 'ending'] as SortOption[]).map((option) => (
                <Button
                  key={option}
                  variant="ghost"
                  size="sm"
                  onClick={() => setSortBy(option)}
                  className={`tab-button capitalize ${sortBy === option ? 'active' : ''}`}
                >
                  {option === 'ending' ? 'Ending Soon' : option}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground mb-6">
          Showing {filteredMarkets.length} markets
        </p>

        {/* Markets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredMarkets.map((market, index) => (
            <div 
              key={market.id}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <MarketCard market={market} />
            </div>
          ))}
        </div>

        {filteredMarkets.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">No markets found matching your criteria</p>
            <Button 
              variant="ghost" 
              className="mt-4"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setSelectedStatus('All');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}

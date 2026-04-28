import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, SortAsc, RefreshCw, TrendingUp, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { MarketCard } from '@/components/markets/MarketCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiService } from '@/services/apiService';
import { Market } from '@/data/mockData';
import { useOffline } from '@/hooks/useOffline';

type SortOption = 'volume' | 'newest' | 'ending';

const categories = ['All', 'Crypto', 'Sports', 'Politics', 'Entertainment', 'Technology', 'Economics', 'Other'];
const statusFilters = ['All', 'Active', 'Resolved', 'Trending'];

// Demo markets data for fallback
const demoMarkets: Market[] = [
  {
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
    description: 'Resolves YES if SpaceX successfully lands human crew on Mars surface by December 31, 2030.',
    tags: ['space', 'mars', 'elon']
  },
  {
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
    description: 'Resolves YES if OpenAI officially releases a model named GPT-5 by December 31, 2026.',
    tags: ['ai', 'openai', 'gpt5']
  }
];

export default function Markets() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('volume');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const isOffline = useOffline();

  const fetchMarkets = async () => {
    try {
      setLoading(true);
      setError(null);
      
      try {
        const filters: any = {};
        if (selectedCategory !== 'All') filters.category = selectedCategory.toLowerCase();
        if (selectedStatus !== 'All') filters.status = selectedStatus.toLowerCase();
        if (searchQuery) filters.search = searchQuery;
        
        const response = await apiService.markets.getMarkets(filters);
        setIsCached(!!(response as any).cached);
        const marketsData = response?.data?.markets || response?.markets || response || [];
        const transformedMarkets = marketsData.map((market: any, index: number) => ({
          id: market.marketId || market._id || `api_${index + 1}`,
          question: market.question,
          category: market.category.charAt(0).toUpperCase() + market.category.slice(1),
          yesPrice: market.currentPrices?.yes || market.currentYesPrice || 0.5,
          noPrice: market.currentPrices?.no || market.currentNoPrice || 0.5,
          volume: market.totalVolume || 0,
          liquidity: market.initialLiquidity || 0,
          expirationDate: market.expiresAt,
          status: market.status.charAt(0).toUpperCase() + market.status.slice(1),
          creator: market.creatorWalletAddress,
          createdAt: market.createdAt,
          traders: market.statistics?.uniqueTraders || 0,
          resolutionSource: market.oracleSource || 'manual',
          description: market.metadata?.description || market.resolutionCriteria,
          tags: market.tags || []
        }));
        
        setMarkets(transformedMarkets);
      } catch (apiError) {
        setIsCached(true);
        setMarkets(demoMarkets);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
      setIsCached(true);
      setMarkets(demoMarkets);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, [selectedCategory, selectedStatus]);

  const trendingMarkets = useMemo(() => {
    return [...markets]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 4);
  }, [markets]);

  const filteredMarkets = useMemo(() => {
    let filtered = [...markets];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.question.toLowerCase().includes(q) || 
        m.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    switch (sortBy) {
      case 'volume':
        filtered.sort((a, b) => b.volume - a.volume);
        break;
      case 'newest':
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'ending':
        filtered.sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime());
        break;
    }
    return filtered;
  }, [markets, searchQuery, sortBy]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        {/* Trending Section */}
        {trendingMarkets.length > 0 && selectedCategory === 'All' && !searchQuery && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              Trending Markets
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {trendingMarkets.map((market) => (
                <MarketCard key={market.id} market={market} featured />
              ))}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
              Discover Markets
              {isCached && (
                <Badge variant="outline" className="text-xs border-warning/40 text-warning bg-warning/10 flex items-center gap-1">
                  <WifiOff className="w-3 h-3" />
                  Cached
                </Badge>
              )}
            </h1>
            <Button
              onClick={fetchMarkets}
              disabled={loading || isOffline}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 border-white/10 hover:bg-white/5 disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {isOffline ? 'Offline' : 'Refresh'}
            </Button>
          </div>
          <p className="text-muted-foreground">
            Browse and trade on {markets.length} prediction markets
          </p>
        </div>

        {/* Search and Filters */}
        <div className="glass-card p-4 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search by question or #tag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 input-dark border-white/10 focus:border-primary/50"
              />
            </div>
            <div className="flex flex-wrap gap-2">
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
          <div className="flex flex-col sm:flex-row justify-between gap-4 mt-4 pt-4 border-t border-white/5">
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

        {/* Results */}
        {!loading && (
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
        )}

        {!loading && filteredMarkets.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              {markets.length === 0 ? 'No markets available' : 'No markets found matching your criteria'}
            </p>
            {markets.length > 0 && (
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
            )}
          </div>
        )}

        {/* Debug Test Button */}
        <div className="fixed bottom-6 right-6 z-50">
          <Link to="/market/openai-gpt5-2026">
            <Button className="bg-primary text-white hover:bg-primary/90 shadow-lg px-6 py-6 h-auto rounded-full">
              🚀 Test Market Detail
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

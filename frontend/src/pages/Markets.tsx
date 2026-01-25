import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, SortAsc, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { MarketCard } from '@/components/markets/MarketCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiService } from '@/services/apiService';
import { Market } from '@/data/mockData';

type SortOption = 'volume' | 'newest' | 'ending';

const categories = ['All', 'Crypto', 'Sports', 'Politics', 'Entertainment', 'Technology', 'Economics'];
const statusFilters = ['All', 'Active', 'Resolved', 'Trending'];

export default function Markets() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('volume');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Demo markets for fallback when API is unavailable
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
      description: 'Resolves YES if SpaceX successfully lands human crew on Mars surface by December 31, 2030.'
    },
    {
      id: '2',
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
      description: 'Resolves YES if OpenAI officially releases a model named GPT-5 by December 31, 2026.'
    },
    {
      id: '3',
      question: 'Will Republicans control US Senate after 2026 midterms?',
      category: 'Politics',
      yesPrice: 0.52,
      noPrice: 0.48,
      volume: 19000,
      liquidity: 75000,
      expirationDate: '2026-11-30T23:59:59Z',
      status: 'Active',
      creator: 'GC...DEF',
      createdAt: '2025-01-15T12:00:00Z',
      traders: 234,
      resolutionSource: 'Election Results',
      description: 'Resolves YES if Republicans control majority of US Senate seats after 2026 midterm elections.'
    },
    {
      id: '4',
      question: 'Will Bitcoin reach $100,000 by March 2026?',
      category: 'Crypto',
      yesPrice: 0.60,
      noPrice: 0.40,
      volume: 15000,
      liquidity: 60000,
      expirationDate: '2026-03-31T23:59:59Z',
      status: 'Active',
      creator: 'GB...HIJ',
      createdAt: '2025-01-10T14:20:00Z',
      traders: 198,
      resolutionSource: 'CoinGecko',
      description: 'Resolves YES if Bitcoin price reaches $100,000 USD by March 31, 2026.'
    },
    {
      id: '5',
      question: 'Who will win Super Bowl LXI?',
      category: 'Sports',
      yesPrice: 0.22,
      noPrice: 0.78,
      volume: 13000,
      liquidity: 50000,
      expirationDate: '2027-02-15T23:59:59Z',
      status: 'Active',
      creator: 'GF...KLM',
      createdAt: '2025-01-08T09:15:00Z',
      traders: 167,
      resolutionSource: 'NFL Official',
      description: 'Resolves YES if the favored team wins Super Bowl LXI in February 2027.'
    },
    {
      id: '6',
      question: 'Will Tesla stock reach $300 by end of 2026?',
      category: 'Economics',
      yesPrice: 0.38,
      noPrice: 0.62,
      volume: 10000,
      liquidity: 40000,
      expirationDate: '2026-12-31T23:59:59Z',
      status: 'Active',
      creator: 'GH...NOP',
      createdAt: '2025-01-05T16:45:00Z',
      traders: 143,
      resolutionSource: 'NASDAQ',
      description: 'Resolves YES if Tesla stock price reaches $300 USD by December 31, 2026.'
    },
    {
      id: '7',
      question: 'Will Ethereum reach $5,000 by June 2026?',
      category: 'Crypto',
      yesPrice: 0.45,
      noPrice: 0.55,
      volume: 9000,
      liquidity: 35000,
      expirationDate: '2026-06-30T23:59:59Z',
      status: 'Active',
      creator: 'GJ...QRS',
      createdAt: '2025-01-03T11:30:00Z',
      traders: 112,
      resolutionSource: 'CoinGecko',
      description: 'Resolves YES if Ethereum price reaches $5,000 USD by June 30, 2026.'
    },
    {
      id: '8',
      question: 'Will \'The Brutalist\' win Best Picture Oscar 2027?',
      category: 'Entertainment',
      yesPrice: 0.28,
      noPrice: 0.72,
      volume: 5000,
      liquidity: 25000,
      expirationDate: '2027-03-31T23:59:59Z',
      status: 'Active',
      creator: 'GK...TUV',
      createdAt: '2024-12-28T20:00:00Z',
      traders: 87,
      resolutionSource: 'Academy Awards',
      description: 'Resolves YES if \'The Brutalist\' wins Best Picture at the 2027 Academy Awards.'
    }
  ];

  // Fetch markets from API with fallback to demo data
  const fetchMarkets = async () => {
    try {
      setLoading(true);
      setError(null);
      
      try {
        const response = await apiService.markets.getMarkets();
        
        // Transform API response to frontend format
        const marketsData = response?.markets || response || [];
        const transformedMarkets = marketsData.map((market: any, index: number) => ({
          id: market.marketId || market._id || `api_${index + 1}`, // Ensure unique ID
          question: market.question,
          category: market.category.charAt(0).toUpperCase() + market.category.slice(1), // Capitalize first letter
          yesPrice: market.currentYesPrice || 0.5,
          noPrice: market.currentNoPrice || 0.5,
          volume: market.totalVolume || 0,
          liquidity: market.initialLiquidity || 0,
          expirationDate: market.expiresAt,
          status: market.status.charAt(0).toUpperCase() + market.status.slice(1), // Capitalize first letter
          creator: market.creatorWalletAddress,
          createdAt: market.createdAt,
          traders: market.statistics?.uniqueTraders || 0,
          resolutionSource: market.oracleSource || 'manual',
          description: market.metadata?.description || market.resolutionCriteria
        }));
        
        setMarkets(transformedMarkets);
        console.log('Fetched and transformed markets:', transformedMarkets);
        console.log('Market IDs:', transformedMarkets.map(m => m.id)); // Debug log
      } catch (apiError) {
        console.log('API not available, using demo data');
        // Fallback to demo data when API is not available
        setMarkets(demoMarkets);
        console.log('Using demo markets with IDs:', demoMarkets.map(m => m.id)); // Debug log
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch markets');
      console.error('Error fetching markets:', err);
      // Use demo data as final fallback
      setMarkets(demoMarkets);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, []);

  const filteredMarkets = useMemo(() => {
    let filteredMarkets = [...markets];

    // Filter by search
    if (searchQuery) {
      filteredMarkets = filteredMarkets.filter(m => 
        m.question.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory !== 'All') {
      filteredMarkets = filteredMarkets.filter(m => m.category === selectedCategory);
    }

    // Filter by status
    if (selectedStatus !== 'All') {
      filteredMarkets = filteredMarkets.filter(m => m.status === selectedStatus);
    }

    // Sort
    switch (sortBy) {
      case 'volume':
        filteredMarkets.sort((a, b) => b.volume - a.volume);
        break;
      case 'newest':
        filteredMarkets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'ending':
        filteredMarkets.sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime());
        break;
    }

    return filteredMarkets;
  }, [markets, searchQuery, selectedCategory, selectedStatus, sortBy]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl md:text-4xl font-bold">All Markets</h1>
            <Button
              onClick={fetchMarkets}
              disabled={loading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <p className="text-muted-foreground">
            Browse and trade on {markets.length} prediction markets
          </p>
          {error && (
            <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              Error: {error}
            </div>
          )}
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

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-4 bg-muted rounded mb-2"></div>
                <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        )}

        {/* Markets Grid */}
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
          <Link to="/market/1">
            <Button className="bg-primary text-white hover:bg-primary/90 shadow-lg">
              🚀 Test Market Detail
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

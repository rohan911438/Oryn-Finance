export interface Market {
  id: string;
  question: string;
  category: 'Crypto' | 'Sports' | 'Politics' | 'Entertainment' | 'Technology' | 'Economics' | 'Other';
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  expirationDate: string;
  status: 'Active' | 'Resolved' | 'Trending';
  creator: string;
  createdAt: string;
  traders: number;
  resolutionSource: string;
  description?: string;
  tags?: string[];
}

export interface Trade {
  id: string;
  marketId: string;
  type: 'Buy' | 'Sell';
  position: 'YES' | 'NO';
  amount: number;
  price: number;
  timestamp: string;
  trader: string;
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  username?: string;
  totalProfit: number;
  trades: number;
  winRate: number;
  favoriteCategory: string;
}

export interface Position {
  marketId: string;
  marketQuestion: string;
  position: 'YES' | 'NO';
  amount: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
}

export const featuredMarkets: Market[] = [
  {
    id: '1',
    question: 'Will Bitcoin exceed $150,000 by end of 2025?',
    category: 'Crypto',
    yesPrice: 0.42,
    noPrice: 0.58,
    volume: 2450000,
    liquidity: 850000,
    expirationDate: '2025-12-31',
    status: 'Trending',
    creator: 'GBXQ...3KLM',
    createdAt: '2024-12-01',
    traders: 1234,
    resolutionSource: 'CoinGecko API',
    description: 'This market resolves to YES if the price of Bitcoin (BTC) exceeds $150,000 USD at any point before December 31, 2025, as reported by CoinGecko.',
  },
  {
    id: '2',
    question: 'Will the Fed cut rates in Q1 2025?',
    category: 'Politics',
    yesPrice: 0.65,
    noPrice: 0.35,
    volume: 1890000,
    liquidity: 620000,
    expirationDate: '2025-03-31',
    status: 'Active',
    creator: 'GCVR...8PLK',
    createdAt: '2024-11-15',
    traders: 892,
    resolutionSource: 'Federal Reserve Official Announcement',
    description: 'This market resolves to YES if the Federal Reserve announces any interest rate cut during Q1 2025.',
  },
  {
    id: '3',
    question: 'Will Ethereum flip Bitcoin market cap in 2025?',
    category: 'Crypto',
    yesPrice: 0.18,
    noPrice: 0.82,
    volume: 3200000,
    liquidity: 1100000,
    expirationDate: '2025-12-31',
    status: 'Trending',
    creator: 'GDJK...2MTR',
    createdAt: '2024-10-20',
    traders: 2156,
    resolutionSource: 'CoinMarketCap',
    description: 'This market resolves to YES if Ethereum\'s market capitalization exceeds Bitcoin\'s at any point during 2025.',
  },
  {
    id: '4',
    question: 'Super Bowl LIX: Will the Chiefs win?',
    category: 'Sports',
    yesPrice: 0.31,
    noPrice: 0.69,
    volume: 890000,
    liquidity: 340000,
    expirationDate: '2025-02-09',
    status: 'Active',
    creator: 'GHKL...9NRT',
    createdAt: '2024-12-10',
    traders: 567,
    resolutionSource: 'NFL Official Results',
    description: 'This market resolves to YES if the Kansas City Chiefs win Super Bowl LIX.',
  },
];

export const allMarkets: Market[] = [
  ...featuredMarkets,
  {
    id: '5',
    question: 'Will Apple announce AR glasses at WWDC 2025?',
    category: 'Entertainment',
    yesPrice: 0.55,
    noPrice: 0.45,
    volume: 567000,
    liquidity: 210000,
    expirationDate: '2025-06-15',
    status: 'Active',
    creator: 'GPQR...4WXY',
    createdAt: '2024-12-05',
    traders: 423,
    resolutionSource: 'Apple Official Announcement',
  },
  {
    id: '6',
    question: 'Will Solana reach $500 before mid-2025?',
    category: 'Crypto',
    yesPrice: 0.28,
    noPrice: 0.72,
    volume: 1450000,
    liquidity: 520000,
    expirationDate: '2025-06-30',
    status: 'Active',
    creator: 'GLMN...6QRS',
    createdAt: '2024-11-28',
    traders: 789,
    resolutionSource: 'CoinGecko API',
  },
  {
    id: '7',
    question: 'Will there be a major US bank failure in 2025?',
    category: 'Politics',
    yesPrice: 0.12,
    noPrice: 0.88,
    volume: 780000,
    liquidity: 290000,
    expirationDate: '2025-12-31',
    status: 'Active',
    creator: 'GTUV...1ABC',
    createdAt: '2024-12-01',
    traders: 345,
    resolutionSource: 'FDIC Official Records',
  },
  {
    id: '8',
    question: 'Oscar 2025: Will an AI-generated film win Best Picture?',
    category: 'Entertainment',
    yesPrice: 0.05,
    noPrice: 0.95,
    volume: 234000,
    liquidity: 85000,
    expirationDate: '2025-03-02',
    status: 'Active',
    creator: 'GDEF...7HIJ',
    createdAt: '2024-12-08',
    traders: 198,
    resolutionSource: 'Academy Awards Official',
  },
];

export const recentTrades: Trade[] = [
  { id: 't1', marketId: '1', type: 'Buy', position: 'YES', amount: 500, price: 0.42, timestamp: '2 min ago', trader: 'GBXQ...1ABC' },
  { id: 't2', marketId: '1', type: 'Sell', position: 'NO', amount: 1200, price: 0.58, timestamp: '5 min ago', trader: 'GCDE...2FGH' },
  { id: 't3', marketId: '1', type: 'Buy', position: 'YES', amount: 800, price: 0.41, timestamp: '12 min ago', trader: 'GIJK...3LMN' },
  { id: 't4', marketId: '1', type: 'Buy', position: 'NO', amount: 350, price: 0.59, timestamp: '18 min ago', trader: 'GOPQ...4RST' },
  { id: 't5', marketId: '1', type: 'Sell', position: 'YES', amount: 2000, price: 0.43, timestamp: '25 min ago', trader: 'GUVW...5XYZ' },
];

export const leaderboardData: LeaderboardEntry[] = [
  { rank: 1, address: 'GBXQ...7KLM', username: 'CryptoOracle', totalProfit: 45678.90, trades: 234, winRate: 72.5, favoriteCategory: 'Crypto' },
  { rank: 2, address: 'GCVR...8PLK', username: 'PredictionPro', totalProfit: 38245.50, trades: 189, winRate: 68.3, favoriteCategory: 'Politics' },
  { rank: 3, address: 'GDJK...2MTR', totalProfit: 31890.25, trades: 156, winRate: 65.8, favoriteCategory: 'Crypto' },
  { rank: 4, address: 'GHKL...9NRT', username: 'SportsBettor', totalProfit: 28456.80, trades: 298, winRate: 61.2, favoriteCategory: 'Sports' },
  { rank: 5, address: 'GPQR...4WXY', totalProfit: 24123.45, trades: 134, winRate: 63.5, favoriteCategory: 'Entertainment' },
  { rank: 6, address: 'GLMN...6QRS', username: 'MarketMaker', totalProfit: 21567.30, trades: 412, winRate: 58.9, favoriteCategory: 'Crypto' },
  { rank: 7, address: 'GTUV...1ABC', totalProfit: 18934.75, trades: 98, winRate: 70.1, favoriteCategory: 'Politics' },
  { rank: 8, address: 'GDEF...7HIJ', totalProfit: 15678.20, trades: 167, winRate: 55.4, favoriteCategory: 'Entertainment' },
  { rank: 9, address: 'GJKL...3MNO', totalProfit: 12456.90, trades: 78, winRate: 62.8, favoriteCategory: 'Crypto' },
  { rank: 10, address: 'GPRS...9TUV', username: 'WhaleTrades', totalProfit: 10234.55, trades: 45, winRate: 71.2, favoriteCategory: 'Crypto' },
];

export const userPositions: Position[] = [
  { marketId: '1', marketQuestion: 'Will Bitcoin exceed $150,000 by end of 2025?', position: 'YES', amount: 500, avgPrice: 0.38, currentPrice: 0.42, unrealizedPnL: 52.63 },
  { marketId: '2', marketQuestion: 'Will the Fed cut rates in Q1 2025?', position: 'NO', amount: 300, avgPrice: 0.40, currentPrice: 0.35, unrealizedPnL: -37.50 },
  { marketId: '3', marketQuestion: 'Will Ethereum flip Bitcoin market cap in 2025?', position: 'NO', amount: 1000, avgPrice: 0.78, currentPrice: 0.82, unrealizedPnL: 51.28 },
];

export const priceHistory = [
  { time: '12:00', yes: 0.35, no: 0.65, volume: 45000 },
  { time: '13:00', yes: 0.38, no: 0.62, volume: 62000 },
  { time: '14:00', yes: 0.36, no: 0.64, volume: 38000 },
  { time: '15:00', yes: 0.40, no: 0.60, volume: 85000 },
  { time: '16:00', yes: 0.42, no: 0.58, volume: 72000 },
  { time: '17:00', yes: 0.41, no: 0.59, volume: 54000 },
  { time: '18:00', yes: 0.43, no: 0.57, volume: 91000 },
  { time: '19:00', yes: 0.42, no: 0.58, volume: 67000 },
];

export const platformStats = {
  totalVolume: 24500000,
  activeMarkets: 156,
  totalUsers: 12847,
  totalTrades: 89234,
};

export const categories = ['All', 'Crypto', 'Sports', 'Politics', 'Entertainment'] as const;
export const statusFilters = ['All', 'Active', 'Resolved', 'Trending'] as const;

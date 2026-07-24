const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Configure dotenv before requiring config or models
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'backend', '.env') });

const connectDB = require('../../backend/src/config/database');
const { Market, User, Trade, Position, LiquidityPosition } = require('../../backend/src/models');

const WALLET_FILE = path.join(__dirname, 'wallets.json');

async function seedSandbox() {
  console.log('==========================================');
  console.log('Oryn Finance - Database Seeder');
  console.log('==========================================\n');

  // 1. Connect to MongoDB
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB Connection failed:', error);
    process.exit(1);
  }

  // 2. Load generated wallets
  let wallets = {};
  if (fs.existsSync(WALLET_FILE)) {
    try {
      wallets = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
      console.log('📂 Loaded developer wallets from wallets.json');
    } catch (e) {
      console.warn('⚠️ Error parsing wallets.json. Falling back to default placeholders.');
    }
  }

  // Fallbacks if wallets.json is missing or incomplete
  const defaultAddress = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const adminAddress = wallets.admin?.publicKey || defaultAddress;
  const creatorAddress = wallets.creator?.publicKey || defaultAddress;
  const trader1Address = wallets.trader1?.publicKey || defaultAddress;
  const trader2Address = wallets.trader2?.publicKey || defaultAddress;

  // 3. Clear existing collections to guarantee determinism
  console.log('🧹 Clearing existing database collections...');
  await User.deleteMany({});
  await Market.deleteMany({});
  await Trade.deleteMany({});
  await Position.deleteMany({});
  await LiquidityPosition.deleteMany({});
  console.log('✅ Collections cleared.');

  // 4. Seed Users
  console.log('\n👤 Seeding development users...');
  const devUsers = [
    {
      walletAddress: adminAddress,
      username: 'admin_dev',
      email: 'admin@oryn.finance',
      profile: { bio: 'Oryn Protocol Local Administrator', isVerified: true },
      reputationScore: 1000,
      level: 'diamond'
    },
    {
      walletAddress: creatorAddress,
      username: 'market_maker',
      email: 'creator@oryn.finance',
      profile: { bio: 'Primary Liquidity Provider & Creator', isVerified: true },
      reputationScore: 500,
      level: 'gold',
      statistics: { marketsCreated: 5 }
    },
    {
      walletAddress: trader1Address,
      username: 'bullish_trader',
      email: 'trader1@oryn.finance',
      profile: { bio: 'Always long crypto', isVerified: false },
      reputationScore: 150,
      level: 'silver',
      statistics: { totalVolume: 1200, totalTrades: 12 }
    },
    {
      walletAddress: trader2Address,
      username: 'bear_patrol',
      email: 'trader2@oryn.finance',
      profile: { bio: 'Hedging and arbitrage fan', isVerified: false },
      reputationScore: 120,
      level: 'rookie',
      statistics: { totalVolume: 850, totalTrades: 8 }
    }
  ];

  await User.insertMany(devUsers);
  console.log(`✅ Seeded ${devUsers.length} users.`);

  // 5. Seed Markets
  console.log('\n📊 Seeding prediction markets...');
  
  const sampleMarkets = [
    {
      marketId: 'market_btc_120k',
      question: 'Will Bitcoin (BTC) reach $120,000 by the end of March 2026?',
      category: 'crypto',
      region: 'global',
      creatorWalletAddress: creatorAddress,
      expiresAt: new Date('2026-03-31T23:59:59Z'),
      resolutionCriteria: 'Market resolves YES if BTC/USD trades at or above $120,000 on CoinGecko Simple Price before market expiration. Any other result resolves to NO.',
      oracleSource: 'coingecko',
      oracleConfig: { symbol: 'bitcoin', targetPrice: 120000, condition: 'above' },
      yesTokenAssetCode: 'YESBTC',
      noTokenAssetCode: 'NOBTC',
      yesTokenIssuer: creatorAddress,
      noTokenIssuer: creatorAddress,
      initialLiquidity: 10000,
      currentYesPrice: 0.65,
      currentNoPrice: 0.35,
      totalVolume: 4200,
      totalTrades: 3,
      status: 'active'
    },
    {
      marketId: 'market_eth_4k',
      question: 'Will Ethereum (ETH) maintain above $4,000 throughout February 2026?',
      category: 'crypto',
      region: 'global',
      creatorWalletAddress: creatorAddress,
      expiresAt: new Date('2026-02-28T23:59:59Z'),
      resolutionCriteria: 'Market resolves YES if ETH price never drops below $4,000 on CoinGecko simple price throughout the entire month of February 2026. Any drop below resolves to NO.',
      oracleSource: 'coingecko',
      oracleConfig: { symbol: 'ethereum', targetPrice: 4000, condition: 'above' },
      yesTokenAssetCode: 'YESETH',
      noTokenAssetCode: 'NOETH',
      yesTokenIssuer: creatorAddress,
      noTokenIssuer: creatorAddress,
      initialLiquidity: 5000,
      currentYesPrice: 0.45,
      currentNoPrice: 0.55,
      totalVolume: 1250,
      totalTrades: 2,
      status: 'active'
    },
    {
      marketId: 'market_lakers_nba',
      question: 'Will the Lakers make the NBA playoffs in the 2025-2026 season?',
      category: 'sports',
      region: 'north_america',
      creatorWalletAddress: creatorAddress,
      expiresAt: new Date('2026-04-20T23:59:59Z'),
      resolutionCriteria: 'Resolves YES if Los Angeles Lakers qualify for the NBA playoffs as reported by the Sports API game tracker for gameId lakers_nba_2026.',
      oracleSource: 'sports-api',
      oracleConfig: { gameId: 'lakers_nba_2026', condition: 'win', team: 'Los Angeles Lakers' },
      yesTokenAssetCode: 'YESLAL',
      noTokenAssetCode: 'NOLAL',
      yesTokenIssuer: creatorAddress,
      noTokenIssuer: creatorAddress,
      initialLiquidity: 3000,
      currentYesPrice: 0.70,
      currentNoPrice: 0.30,
      totalVolume: 800,
      totalTrades: 2,
      status: 'active'
    },
    {
      marketId: 'market_swift_album',
      question: 'Will Taylor Swift announce a new album in 2026?',
      category: 'entertainment',
      region: 'global',
      creatorWalletAddress: creatorAddress,
      expiresAt: new Date('2026-12-31T23:59:59Z'),
      resolutionCriteria: 'Resolves YES if News API sentiment check on Taylor Swift album keywords registers POSITIVE sentiment before expiration.',
      oracleSource: 'news-api',
      oracleConfig: { keywords: ['taylor swift', 'album'], condition: 'positive' },
      yesTokenAssetCode: 'YESSWIFT',
      noTokenAssetCode: 'NOSWIFT',
      yesTokenIssuer: creatorAddress,
      noTokenIssuer: creatorAddress,
      initialLiquidity: 4000,
      currentYesPrice: 0.50,
      currentNoPrice: 0.50,
      totalVolume: 0,
      totalTrades: 0,
      status: 'active'
    },
    {
      marketId: 'market_uk_pm',
      question: 'Will there be a new Prime Minister of the UK by December 2026?',
      category: 'politics',
      region: 'europe',
      creatorWalletAddress: creatorAddress,
      expiresAt: new Date('2026-12-31T23:59:59Z'),
      resolutionCriteria: 'Resolves YES if a new UK PM is sworn in, otherwise NO. Checked manually by admin.',
      oracleSource: 'manual',
      yesTokenAssetCode: 'YESUKPM',
      noTokenAssetCode: 'NOUKPM',
      yesTokenIssuer: creatorAddress,
      noTokenIssuer: creatorAddress,
      initialLiquidity: 2000,
      currentYesPrice: 0.30,
      currentNoPrice: 0.70,
      totalVolume: 500,
      totalTrades: 1,
      status: 'active'
    }
  ];

  await Market.insertMany(sampleMarkets);
  console.log(`✅ Seeded ${sampleMarkets.length} prediction markets.`);

  // 6. Seed Liquidity Positions for Creator
  console.log('\n💧 Seeding initial liquidity positions...');
  const sampleLiquidity = sampleMarkets.map((m, index) => ({
    positionId: `lp_${m.marketId}_creator`,
    marketId: m.marketId,
    userWalletAddress: creatorAddress,
    depositedYesAmount: m.initialLiquidity / 2,
    depositedNoAmount: m.initialLiquidity / 2,
    lpTokens: m.initialLiquidity,
    shareOfPool: 100,
    status: 'active',
    depositedAt: new Date(),
    lastUpdated: new Date()
  }));

  await LiquidityPosition.insertMany(sampleLiquidity);
  console.log(`✅ Seeded ${sampleLiquidity.length} initial liquidity positions.`);

  // 7. Seed Sample Trades and Trader Positions
  console.log('\n📈 Seeding sample trades & holding positions...');
  
  const sampleTrades = [
    // Trade 1: Trader 1 buys YES on BTC Market
    {
      tradeId: 't_btc_yes_trader1',
      marketId: 'market_btc_120k',
      userWalletAddress: trader1Address,
      nonce: '1',
      tradeType: 'buy',
      tokenType: 'yes',
      amount: 1000,
      price: 0.65,
      totalCost: 650,
      fees: { platformFee: 3.25, stellarFee: 0.01, total: 3.26 },
      stellarTransactionHash: '5b3c6084cca6826b01b278777d80234fc420264719667c4ccaeb6f268d90f6ee',
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 5) // 5 hrs ago
    },
    // Trade 2: Trader 2 buys NO on BTC Market
    {
      tradeId: 't_btc_no_trader2',
      marketId: 'market_btc_120k',
      userWalletAddress: trader2Address,
      nonce: '1',
      tradeType: 'buy',
      tokenType: 'no',
      amount: 500,
      price: 0.35,
      totalCost: 175,
      fees: { platformFee: 0.88, stellarFee: 0.01, total: 0.89 },
      stellarTransactionHash: 'c08e06068f92934733cd99655c970e693ca636da8eb4b880e8ca730815b56109',
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 3) // 3 hrs ago
    },
    // Trade 3: Trader 1 buys YES on ETH Market
    {
      tradeId: 't_eth_yes_trader1',
      marketId: 'market_eth_4k',
      userWalletAddress: trader1Address,
      nonce: '2',
      tradeType: 'buy',
      tokenType: 'yes',
      amount: 800,
      price: 0.45,
      totalCost: 360,
      fees: { platformFee: 1.80, stellarFee: 0.01, total: 1.81 },
      stellarTransactionHash: 'fc1ff7fdcf5d06567dfd67fef724ca9198be278f018465307331e405ffb46663',
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 2) // 2 hrs ago
    },
    // Trade 4: Trader 2 buys YES on NBA Market
    {
      tradeId: 't_lal_yes_trader2',
      marketId: 'market_lakers_nba',
      userWalletAddress: trader2Address,
      nonce: '2',
      tradeType: 'buy',
      tokenType: 'yes',
      amount: 600,
      price: 0.70,
      totalCost: 420,
      fees: { platformFee: 2.10, stellarFee: 0.01, total: 2.11 },
      stellarTransactionHash: '78d0cd8a33984d6e23dfc535b775eae0970e4a891c2a746d4588b5616eb34c1a',
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 1) // 1 hr ago
    }
  ];

  await Trade.insertMany(sampleTrades);
  console.log(`✅ Seeded ${sampleTrades.length} trade transactions.`);

  // 8. Seed corresponding positions for traders
  const samplePositions = [
    // Trader 1 BTC Yes
    {
      positionId: 'pos_btc_yes_trader1',
      marketId: 'market_btc_120k',
      userWalletAddress: trader1Address,
      tokenType: 'yes',
      totalShares: 1000,
      availableShares: 1000,
      averageEntryPrice: 0.65,
      totalCostBasis: 650,
      realizedPnL: 0,
      unrealizedPnL: 0,
      status: 'active',
      trades: [{
        tradeId: 't_btc_yes_trader1',
        type: 'buy',
        shares: 1000,
        price: 0.65,
        timestamp: new Date(Date.now() - 3600000 * 5),
        fees: 3.26
      }]
    },
    // Trader 2 BTC No
    {
      positionId: 'pos_btc_no_trader2',
      marketId: 'market_btc_120k',
      userWalletAddress: trader2Address,
      tokenType: 'no',
      totalShares: 500,
      availableShares: 500,
      averageEntryPrice: 0.35,
      totalCostBasis: 175,
      realizedPnL: 0,
      unrealizedPnL: 0,
      status: 'active',
      trades: [{
        tradeId: 't_btc_no_trader2',
        type: 'buy',
        shares: 500,
        price: 0.35,
        timestamp: new Date(Date.now() - 3600000 * 3),
        fees: 0.89
      }]
    },
    // Trader 1 ETH Yes
    {
      positionId: 'pos_eth_yes_trader1',
      marketId: 'market_eth_4k',
      userWalletAddress: trader1Address,
      tokenType: 'yes',
      totalShares: 800,
      availableShares: 800,
      averageEntryPrice: 0.45,
      totalCostBasis: 360,
      realizedPnL: 0,
      unrealizedPnL: 0,
      status: 'active',
      trades: [{
        tradeId: 't_eth_yes_trader1',
        type: 'buy',
        shares: 800,
        price: 0.45,
        timestamp: new Date(Date.now() - 3600000 * 2),
        fees: 1.81
      }]
    },
    // Trader 2 LAL Yes
    {
      positionId: 'pos_lal_yes_trader2',
      marketId: 'market_lakers_nba',
      userWalletAddress: trader2Address,
      tokenType: 'yes',
      totalShares: 600,
      availableShares: 600,
      averageEntryPrice: 0.70,
      totalCostBasis: 420,
      realizedPnL: 0,
      unrealizedPnL: 0,
      status: 'active',
      trades: [{
        tradeId: 't_lal_yes_trader2',
        type: 'buy',
        shares: 600,
        price: 0.70,
        timestamp: new Date(Date.now() - 3600000 * 1),
        fees: 2.11
      }]
    }
  ];

  await Position.insertMany(samplePositions);
  console.log(`✅ Seeded ${samplePositions.length} trader share positions.`);

  console.log('\n==========================================');
  console.log('🎉 Database Seeding Complete!');
  console.log('==========================================');
  
  await mongoose.disconnect();
}

if (require.main === module) {
  seedSandbox().catch(console.error);
}

module.exports = { seedSandbox };

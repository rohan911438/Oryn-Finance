const mongoose = require('mongoose');
const path = require('path');

// Connect to the same database the backend uses
const connectDB = async () => {
  try {
    const mongoURI = 'mongodb://localhost:27017/oryn-finance';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to database');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

// Define the market schema (simplified version)
const marketSchema = new mongoose.Schema({
  marketId: { type: String, required: true, unique: true, index: true },
  question: { type: String, required: true, maxlength: 500, trim: true },
  category: { 
    type: String, 
    required: true,
    enum: ['sports', 'politics', 'crypto', 'entertainment', 'economics', 'technology', 'other'],
    index: true 
  },
  creatorWalletAddress: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true },
  resolutionCriteria: { type: String, required: true, maxlength: 1000 },
  oracleSource: { type: String, enum: ['manual', 'coingecko', 'sports-api', 'news-api', 'chainlink'], default: 'manual' },
  oracleConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { 
    type: String, 
    enum: ['active', 'resolved', 'cancelled', 'expired', 'disputed'], 
    default: 'active', 
    index: true 
  },
  totalVolume: { type: Number, default: 0, min: 0 },
  totalTrades: { type: Number, default: 0, min: 0 },
  yesTokenAssetCode: { type: String, required: true },
  noTokenAssetCode: { type: String, required: true },
  yesTokenIssuer: { type: String, required: true },
  noTokenIssuer: { type: String, required: true },
  liquidityPoolId: String,
  initialLiquidity: { type: Number, required: true, min: 0 },
  currentYesPrice: { type: Number, default: 0.5, min: 0, max: 1 },
  currentNoPrice: { type: Number, default: 0.5, min: 0, max: 1 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
});

const Market = mongoose.model('Market', marketSchema);

// Sample markets data
const sampleMarkets = [
  {
    question: "Will Bitcoin (BTC) reach $120,000 by the end of March 2026?",
    category: "crypto",
    expiresAt: new Date('2026-03-31T23:59:59Z'),
    resolutionCriteria: "Market will resolve YES if Bitcoin (BTC) trades at or above $120,000 on any major exchange (Coinbase, Binance, or Kraken) at any point before market expiration. Price will be verified through CoinGecko API.",
    initialLiquidity: 5000
  },
  {
    question: "Will Ethereum (ETH) maintain above $4,000 throughout February 2026?",
    category: "crypto", 
    expiresAt: new Date('2026-02-28T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if ETH price never drops below $4,000 on CoinGecko throughout the entire month of February 2026. Any drop below $4,000 for even a moment resolves to NO.",
    initialLiquidity: 3000
  },
  {
    question: "Will Solana (SOL) outperform Ethereum (ETH) by price percentage in Q1 2026?",
    category: "crypto",
    expiresAt: new Date('2026-03-31T23:59:59Z'), 
    resolutionCriteria: "Market resolves YES if Solana's percentage price change from January 1, 2026 to March 31, 2026 is greater than Ethereum's percentage change over the same period. Prices sourced from CoinGecko.",
    initialLiquidity: 2500
  },
  {
    question: "Will the Lakers make the NBA playoffs in the 2025-2026 season?",
    category: "sports",
    expiresAt: new Date('2026-04-20T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if the Los Angeles Lakers qualify for the 2026 NBA playoffs. This includes play-in tournament qualification. Official NBA standings and playoff qualification announcement will be used for resolution.",
    initialLiquidity: 4000
  },
  {
    question: "Will Manchester City win the Premier League 2025-26 season?",
    category: "sports",
    expiresAt: new Date('2026-05-25T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if Manchester City FC wins the Premier League title for the 2025-26 season. Official Premier League final standings will be used for resolution.",
    initialLiquidity: 3500
  },
  {
    question: "Will there be a new Formula 1 World Champion in 2026 (not Verstappen)?",
    category: "sports",
    expiresAt: new Date('2026-11-30T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if anyone other than Max Verstappen wins the 2026 Formula 1 Drivers' Championship. Market resolves NO if Verstappen wins or if the season is cancelled/incomplete.",
    initialLiquidity: 2000
  },
  {
    question: "Will the US Federal Reserve cut interest rates below 4% by July 2026?",
    category: "politics",
    expiresAt: new Date('2026-07-31T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if the Federal Funds Rate target range upper bound is below 4.00% at any point before market expiration. Official Federal Reserve announcements will be used for resolution.",
    initialLiquidity: 6000
  },
  {
    question: "Will there be a new Prime Minister of the UK by December 2026?",
    category: "politics",
    expiresAt: new Date('2026-12-31T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if someone other than the current Prime Minister takes office before market expiration, whether through election, resignation, or other means. Official UK government announcements determine resolution.",
    initialLiquidity: 3500
  },
  {
    question: "Will Taylor Swift announce a new album in 2026?",
    category: "entertainment",
    expiresAt: new Date('2026-12-31T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if Taylor Swift officially announces a new studio album for release in 2026 or later. Re-recordings of previous albums do not count. Official announcements on verified social media or press releases count.",
    initialLiquidity: 2500
  },
  {
    question: "Will Marvel release more than 4 movies in theaters during 2026?",
    category: "entertainment", 
    expiresAt: new Date('2026-12-31T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if Marvel Studios releases 5 or more theatrical films in 2026. Disney+ exclusives and re-releases do not count. Only first-run theatrical releases in the US count toward the total.",
    initialLiquidity: 3000
  },
  {
    question: "Will OpenAI release GPT-5 or equivalent major model update by September 2026?",
    category: "technology",
    expiresAt: new Date('2026-09-30T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if OpenAI officially announces and releases GPT-5 or announces a successor model with significantly improved capabilities. Internal versions or limited releases don't count - must be generally available.",
    initialLiquidity: 4500
  },
  {
    question: "Will Apple announce the Apple Car or autonomous vehicle by WWDC 2026?",
    category: "technology",
    expiresAt: new Date('2026-06-15T23:59:59Z'),
    resolutionCriteria: "Market resolves YES if Apple officially announces the Apple Car, autonomous vehicle, or partnership for vehicle production at WWDC 2026 or earlier. Rumors and leaks don't count - must be official Apple announcement.",
    initialLiquidity: 5500
  }
];

async function createSampleMarkets() {
  await connectDB();
  
  console.log('🎯 Creating sample prediction markets...\n');
  
  let createdCount = 0;
  
  for (let i = 0; i < sampleMarkets.length; i++) {
    const marketData = sampleMarkets[i];
    
    const market = new Market({
      marketId: `market_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      question: marketData.question,
      category: marketData.category,
      creatorWalletAddress: 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      createdAt: new Date(),
      expiresAt: marketData.expiresAt,
      resolutionCriteria: marketData.resolutionCriteria,
      initialLiquidity: marketData.initialLiquidity,
      yesTokenAssetCode: `YES${i + 1}`,
      noTokenAssetCode: `NO${i + 1}`,
      yesTokenIssuer: 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      noTokenIssuer: 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      status: 'active',
      totalVolume: Math.floor(Math.random() * marketData.initialLiquidity * 0.8), // Random volume up to 80% of initial liquidity
      totalTrades: Math.floor(Math.random() * 50), // Random number of trades
      currentYesPrice: 0.45 + Math.random() * 0.1, // Price between 0.45-0.55
      currentNoPrice: 0.45 + Math.random() * 0.1,
      metadata: {
        contractAddress: null,
        featured: i < 3, // Make first 3 markets featured
        trending: Math.random() > 0.6 // 40% chance to be trending
      }
    });
    
    try {
      await market.save();
      createdCount++;
      console.log(`✅ Created market ${i + 1}/${sampleMarkets.length}: ${marketData.category.toUpperCase()} - ${marketData.question.substring(0, 60)}...`);
    } catch (error) {
      console.log(`❌ Failed to create market ${i + 1}: ${error.message}`);
    }
  }
  
  console.log(`\n🎉 Successfully created ${createdCount}/${sampleMarkets.length} sample markets!`);
  console.log('\n📊 Markets by category:');
  console.log('📈 Crypto: 3 markets'); 
  console.log('⚽ Sports: 3 markets');
  console.log('🏛️ Politics: 2 markets');
  console.log('🎬 Entertainment: 2 markets');
  console.log('💻 Technology: 2 markets');
  console.log('\n🔥 Now refresh your frontend to see the markets!');
  
  await mongoose.disconnect();
}

// Run the script
if (require.main === module) {
  createSampleMarkets().catch(console.error);
}

module.exports = { createSampleMarkets };
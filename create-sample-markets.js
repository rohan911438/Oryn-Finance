const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Sample markets data
const sampleMarkets = [
  // Crypto Markets
  {
    question: "Will Bitcoin (BTC) reach $120,000 by the end of March 2026?",
    category: "crypto",
    expiresAt: new Date('2026-03-31T23:59:59Z').toISOString(),
    resolutionCriteria: "Market will resolve YES if Bitcoin (BTC) trades at or above $120,000 on any major exchange (Coinbase, Binance, or Kraken) at any point before market expiration. Price will be verified through CoinGecko API.",
    initialLiquidity: 5000,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" // Placeholder
  },
  {
    question: "Will Ethereum (ETH) maintain above $4,000 throughout February 2026?",
    category: "crypto", 
    expiresAt: new Date('2026-02-28T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if ETH price never drops below $4,000 on CoinGecko throughout the entire month of February 2026. Any drop below $4,000 for even a moment resolves to NO.",
    initialLiquidity: 3000,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    question: "Will Solana (SOL) outperform Ethereum (ETH) by price percentage in Q1 2026?",
    category: "crypto",
    expiresAt: new Date('2026-03-31T23:59:59Z').toISOString(), 
    resolutionCriteria: "Market resolves YES if Solana's percentage price change from January 1, 2026 to March 31, 2026 is greater than Ethereum's percentage change over the same period. Prices sourced from CoinGecko.",
    initialLiquidity: 2500,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },

  // Sports Markets
  {
    question: "Will the Lakers make the NBA playoffs in the 2025-2026 season?",
    category: "sports",
    expiresAt: new Date('2026-04-20T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if the Los Angeles Lakers qualify for the 2026 NBA playoffs. This includes play-in tournament qualification. Official NBA standings and playoff qualification announcement will be used for resolution.",
    initialLiquidity: 4000,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    question: "Will Manchester City win the Premier League 2025-26 season?",
    category: "sports",
    expiresAt: new Date('2026-05-25T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if Manchester City FC wins the Premier League title for the 2025-26 season. Official Premier League final standings will be used for resolution.",
    initialLiquidity: 3500,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    question: "Will there be a new Formula 1 World Champion in 2026 (not Verstappen)?",
    category: "sports",
    expiresAt: new Date('2026-11-30T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if anyone other than Max Verstappen wins the 2026 Formula 1 Drivers' Championship. Market resolves NO if Verstappen wins or if the season is cancelled/incomplete.",
    initialLiquidity: 2000,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },

  // Politics Markets
  {
    question: "Will the US Federal Reserve cut interest rates below 4% by July 2026?",
    category: "politics",
    expiresAt: new Date('2026-07-31T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if the Federal Funds Rate target range upper bound is below 4.00% at any point before market expiration. Official Federal Reserve announcements will be used for resolution.",
    initialLiquidity: 6000,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    question: "Will there be a new Prime Minister of the UK by December 2026?",
    category: "politics",
    expiresAt: new Date('2026-12-31T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if someone other than the current Prime Minister takes office before market expiration, whether through election, resignation, or other means. Official UK government announcements determine resolution.",
    initialLiquidity: 3500,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },

  // Entertainment Markets
  {
    question: "Will Taylor Swift announce a new album in 2026?",
    category: "entertainment",
    expiresAt: new Date('2026-12-31T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if Taylor Swift officially announces a new studio album for release in 2026 or later. Re-recordings of previous albums do not count. Official announcements on verified social media or press releases count.",
    initialLiquidity: 2500,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    question: "Will Marvel release more than 4 movies in theaters during 2026?",
    category: "entertainment", 
    expiresAt: new Date('2026-12-31T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if Marvel Studios releases 5 or more theatrical films in 2026. Disney+ exclusives and re-releases do not count. Only first-run theatrical releases in the US count toward the total.",
    initialLiquidity: 3000,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },

  // Technology Markets
  {
    question: "Will OpenAI release GPT-5 or equivalent major model update by September 2026?",
    category: "technology",
    expiresAt: new Date('2026-09-30T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if OpenAI officially announces and releases GPT-5 or announces a successor model with significantly improved capabilities. Internal versions or limited releases don't count - must be generally available.",
    initialLiquidity: 4500,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    question: "Will Apple announce the Apple Car or autonomous vehicle by WWDC 2026?",
    category: "technology",
    expiresAt: new Date('2026-06-15T23:59:59Z').toISOString(),
    resolutionCriteria: "Market resolves YES if Apple officially announces the Apple Car, autonomous vehicle, or partnership for vehicle production at WWDC 2026 or earlier. Rumors and leaks don't count - must be official Apple announcement.",
    initialLiquidity: 5500,
    walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  }
];

// Mock authentication token (you'll need to replace this with actual auth)
const mockUser = {
  walletAddress: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  // This would normally come from proper authentication
};

async function createSampleMarkets() {
  console.log('Creating sample prediction markets...\n');
  
  for (let i = 0; i < sampleMarkets.length; i++) {
    const market = sampleMarkets[i];
    
    try {
      console.log(`Creating market ${i + 1}/${sampleMarkets.length}: ${market.question.substring(0, 50)}...`);
      
      // For now, we'll just create the markets directly in the database
      // In a real scenario, you'd need proper authentication
      const response = await axios.post(`${BASE_URL}/markets`, market, {
        headers: {
          'Authorization': `Bearer mock-token`,
          'Content-Type': 'application/json'
        }
      }).catch(error => {
        console.log(`❌ Failed to create market: ${error.message}`);
        if (error.response) {
          console.log('Response:', error.response.data);
        }
        return null;
      });
      
      if (response) {
        console.log(`✅ Created market: ${market.category.toUpperCase()} - ${market.question.substring(0, 60)}...`);
      }
      
    } catch (error) {
      console.error(`Failed to create market ${i + 1}:`, error.message);
    }
  }
  
  console.log('\n✅ Finished creating sample markets!');
  console.log('\nMarkets created across categories:');
  console.log('📈 Crypto: 3 markets'); 
  console.log('⚽ Sports: 3 markets');
  console.log('🏛️ Politics: 2 markets');
  console.log('🎬 Entertainment: 2 markets');
  console.log('💻 Technology: 2 markets');
}

// Alternative: Direct database insertion (if API auth is complex)
async function createMarketsDirectly() {
  const mongoose = require('mongoose');
  
  // Connect to database (you may need to update connection string)
  try {
    await mongoose.connect('mongodb://localhost:27017/oryn-markets');
    console.log('Connected to database');
    
    const { Market } = require('./backend/src/models');
    
    console.log('Creating sample markets directly in database...\n');
    
    for (let i = 0; i < sampleMarkets.length; i++) {
      const marketData = sampleMarkets[i];
      
      const market = new Market({
        marketId: `market_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        question: marketData.question,
        category: marketData.category,
        creatorWalletAddress: 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        expiresAt: new Date(marketData.expiresAt),
        resolutionCriteria: marketData.resolutionCriteria,
        initialLiquidity: marketData.initialLiquidity,
        yesTokenAssetCode: `YES${i + 1}`,
        noTokenAssetCode: `NO${i + 1}`,
        yesTokenIssuer: 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        noTokenIssuer: 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        status: 'active'
      });
      
      try {
        await market.save();
        console.log(`✅ Created market: ${marketData.category.toUpperCase()} - ${marketData.question.substring(0, 60)}...`);
      } catch (error) {
        console.log(`❌ Failed to create market: ${error.message}`);
      }
    }
    
    console.log('\n🎉 Sample markets created successfully!');
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

// Run the market creation
if (require.main === module) {
  console.log('Choose method:');
  console.log('1. Try API endpoint (requires auth)');
  console.log('2. Direct database insertion');
  
  // For now, let's try direct database insertion since auth might be complex
  createMarketsDirectly().catch(console.error);
}

module.exports = { sampleMarkets, createSampleMarkets, createMarketsDirectly };
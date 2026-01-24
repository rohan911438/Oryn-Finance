require('dotenv').config();
const connectDB = require('./src/config/database');
const Market = require('./src/models/Market');

const sampleMarkets = [
  {
    marketId: "btc-100k-march-2026",
    question: "Will Bitcoin reach $100,000 by March 2026?",
    category: "crypto",
    creatorWalletAddress: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    expiresAt: new Date('2026-03-31T23:59:59Z'),
    resolutionCriteria: "Bitcoin must reach or exceed $100,000 USD on at least one major exchange (Binance, Coinbase, Kraken) by March 31, 2026 23:59:59 UTC. Price will be verified using CoinGecko API.",
    yesTokenAssetCode: "BTCYES",
    noTokenAssetCode: "BTCNO",
    yesTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    noTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    initialLiquidity: 50000,
    currentYesPrice: 0.6,
    currentNoPrice: 0.4,
    totalVolume: 15420,
    totalTrades: 124,
    tags: ["bitcoin", "cryptocurrency", "price"],
    metadata: {
      description: "Prediction market on whether Bitcoin (BTC) will reach or exceed $100,000 USD by March 31, 2026. Resolution based on major exchange prices using CoinGecko API data.",
      imageUrl: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
      sourceUrls: ["https://coingecko.com", "https://coinbase.com", "https://binance.com"]
    },
    oracleSource: "coingecko",
    oracleConfig: { symbol: "bitcoin", targetPrice: 100000 }
  },
  {
    marketId: "eth-5k-june-2026",
    question: "Will Ethereum reach $5,000 by June 2026?",
    category: "crypto",
    creatorWalletAddress: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    expiresAt: new Date('2026-06-30T23:59:59Z'),
    resolutionCriteria: "Ethereum must reach or exceed $5,000 USD on at least one major exchange by June 30, 2026 23:59:59 UTC. Price verified using CoinGecko API.",
    yesTokenAssetCode: "ETHYES",
    noTokenAssetCode: "ETHNO",
    yesTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    noTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    initialLiquidity: 25000,
    currentYesPrice: 0.45,
    currentNoPrice: 0.55,
    totalVolume: 8930,
    totalTrades: 67,
    tags: ["ethereum", "cryptocurrency", "price"],
    metadata: {
      description: "Prediction on Ethereum price reaching $5,000 USD by June 30, 2026.",
      imageUrl: "https://cryptologos.cc/logos/ethereum-eth-logo.png"
    },
    oracleSource: "coingecko",
    oracleConfig: { symbol: "ethereum", targetPrice: 5000 }
  },
  {
    marketId: "superbowl-lxi-2027",
    question: "Who will win Super Bowl LXI?",
    category: "sports",
    creatorWalletAddress: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    expiresAt: new Date('2027-02-15T00:00:00Z'),
    resolutionCriteria: "The winner will be determined by the official NFL Super Bowl LXI result. Market resolves to 'yes' for Kansas City Chiefs, 'no' for all other teams.",
    yesTokenAssetCode: "KCYES",
    noTokenAssetCode: "KCNO",
    yesTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    noTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    initialLiquidity: 35000,
    currentYesPrice: 0.22,
    currentNoPrice: 0.78,
    totalVolume: 12560,
    totalTrades: 89,
    tags: ["superbowl", "nfl", "football", "chiefs"],
    metadata: {
      description: "Prediction market for Kansas City Chiefs winning Super Bowl LXI in 2027.",
      imageUrl: "https://static.www.nfl.com/image/private/f_auto/league/u9fltoslqdsyao8cpm0k"
    },
    oracleSource: "sports-api"
  },
  {
    marketId: "openai-gpt5-2026",
    question: "Will OpenAI release GPT-5 by December 2026?",
    category: "technology",
    creatorWalletAddress: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    expiresAt: new Date('2026-12-31T23:59:59Z'),
    resolutionCriteria: "OpenAI must officially announce and release GPT-5 or its equivalent next-generation model by December 31, 2026. Beta releases count if publicly available.",
    yesTokenAssetCode: "GPT5YES",
    noTokenAssetCode: "GPT5NO",
    yesTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    noTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    initialLiquidity: 75000,
    currentYesPrice: 0.72,
    currentNoPrice: 0.28,
    totalVolume: 22340,
    totalTrades: 156,
    tags: ["ai", "openai", "gpt", "technology"],
    metadata: {
      description: "Will OpenAI officially announce and release GPT-5 or its equivalent next-generation model by December 31, 2026?",
      sourceUrls: ["https://openai.com", "https://techcrunch.com", "https://theverge.com"]
    },
    oracleSource: "news-api"
  },
  {
    marketId: "us-midterm-senate-2026",
    question: "Will Republicans control US Senate after 2026 midterms?",
    category: "politics",
    creatorWalletAddress: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    expiresAt: new Date('2026-11-15T00:00:00Z'),
    resolutionCriteria: "Market resolves to 'yes' if Republicans have majority control of US Senate after 2026 midterm elections are certified. Independent senators count towards the party they caucus with.",
    yesTokenAssetCode: "REPYES",
    noTokenAssetCode: "REPNO", 
    yesTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    noTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    initialLiquidity: 60000,
    currentYesPrice: 0.52,
    currentNoPrice: 0.48,
    totalVolume: 18750,
    totalTrades: 203,
    tags: ["elections", "politics", "senate", "midterm", "republicans"],
    metadata: {
      description: "Which party will control the US Senate after the 2026 midterm elections?",
      sourceUrls: ["https://cnn.com", "https://reuters.com", "https://ap.org"]
    },
    oracleSource: "news-api"
  },
  {
    marketId: "tesla-300-2026",
    question: "Will Tesla stock reach $300 by end of 2026?",
    category: "economics",
    creatorWalletAddress: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    expiresAt: new Date('2026-12-31T23:59:59Z'),
    resolutionCriteria: "Tesla (TSLA) stock price must reach or exceed $300 per share during regular trading hours by December 31, 2026. Price verified using major financial data providers.",
    yesTokenAssetCode: "TSLAYES",
    noTokenAssetCode: "TSLANO",
    yesTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    noTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    initialLiquidity: 30000,
    currentYesPrice: 0.38,
    currentNoPrice: 0.62,
    totalVolume: 9870,
    totalTrades: 54,
    tags: ["tesla", "stocks", "tsla", "electric-vehicles"],
    metadata: {
      description: "Will Tesla (TSLA) stock price reach or exceed $300 per share by December 31, 2026?",
      sourceUrls: ["https://finance.yahoo.com", "https://marketwatch.com"]
    }
  },
  {
    marketId: "oscars-best-picture-2027",
    question: "Will 'The Brutalist' win Best Picture Oscar 2027?",
    category: "entertainment",
    creatorWalletAddress: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    expiresAt: new Date('2027-03-15T00:00:00Z'),
    resolutionCriteria: "Market resolves to 'yes' if 'The Brutalist' wins the Academy Award for Best Picture at the 2027 ceremony. Official announcement by Academy of Motion Picture Arts and Sciences required.",
    yesTokenAssetCode: "BRUTYES",
    noTokenAssetCode: "BRUTNO",
    yesTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    noTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    initialLiquidity: 18000,
    currentYesPrice: 0.28,
    currentNoPrice: 0.72,
    totalVolume: 5420,
    totalTrades: 42,
    tags: ["oscars", "academy-awards", "movies", "entertainment", "brutalist"],
    metadata: {
      description: "Prediction market for 'The Brutalist' winning Best Picture at the 2027 Academy Awards.",
      sourceUrls: ["https://oscars.org", "https://variety.com", "https://hollywoodreporter.com"]
    }
  },
  {
    marketId: "spacex-mars-landing-2030",
    question: "Will SpaceX land humans on Mars by 2030?",
    category: "technology",
    creatorWalletAddress: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    expiresAt: new Date('2030-12-31T23:59:59Z'),
    resolutionCriteria: "SpaceX must achieve a successful crewed landing on Mars by December 31, 2030. Landing must be confirmed by SpaceX and verified by independent space agencies. Crew must survive landing.",
    yesTokenAssetCode: "MARSYES",
    noTokenAssetCode: "MARSNO",
    yesTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    noTokenIssuer: "GADMIN123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    initialLiquidity: 95000,
    currentYesPrice: 0.25,
    currentNoPrice: 0.75,
    totalVolume: 31200,
    totalTrades: 287,
    tags: ["spacex", "mars", "space", "technology", "musk"],
    metadata: {
      description: "Will SpaceX achieve a successful crewed landing on Mars by December 31, 2030?",
      sourceUrls: ["https://spacex.com", "https://nasa.gov", "https://space.com"]
    },
    isFeatured: true
  }
];

async function populateMarkets() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    
    console.log('Clearing existing markets...');
    await Market.deleteMany({});
    
    console.log('Creating sample markets...');
    const createdMarkets = await Market.insertMany(sampleMarkets);
    
    console.log(`✅ Successfully created ${createdMarkets.length} sample markets:`);
    createdMarkets.forEach((market, index) => {
      console.log(`${index + 1}. ${market.title} (${market.category})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error populating markets:', error);
    process.exit(1);
  }
}

populateMarkets();
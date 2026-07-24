const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

// In-memory databases for mock values (reset on restart)
const priceDatabase = {
  bitcoin: 125000,
  ethereum: 4200,
  solana: 185
};

const gameDatabase = {
  // Default mocks for NBA/Premier League/F1 resolved markets
  lakers_nba_2026: {
    gameId: 'lakers_nba_2026',
    winner: 'Los Angeles Lakers',
    totalScore: 210,
    finished: true,
    isDraw: false,
    timestamp: new Date().toISOString()
  },
  mancity_epl_2026: {
    gameId: 'mancity_epl_2026',
    winner: 'Manchester City',
    totalScore: 3,
    finished: true,
    isDraw: false,
    timestamp: new Date().toISOString()
  },
  f1_champion_2026: {
    gameId: 'f1_champion_2026',
    winner: 'Hamilton', // Verstappen lost, resolves to YES ("someone other than Max Verstappen")
    totalScore: 0,
    finished: true,
    isDraw: false,
    timestamp: new Date().toISOString()
  }
};

const newsDatabase = {
  default: [
    {
      source: { id: 'mock-news', name: 'Mock News Network' },
      author: 'Financial Reporter',
      title: 'Taylor Swift announces a stunning, successful, great new album, boosting profits and growth',
      description: 'The music industry experiences a massive surge as the new release shows excellent, positive momentum and bullish gains.',
      url: 'https://mocknews.com/taylor-swift-new-album',
      publishedAt: new Date().toISOString()
    },
    {
      source: { id: 'mock-tech', name: 'Mock Tech Review' },
      author: 'AI Enthusiast',
      title: 'OpenAI releases GPT-5 with excellent capabilities, achieving massive success',
      description: 'The new model beats all benchmarks. Tech stocks rise rapidly, demonstrating bullish growth and positive market response.',
      url: 'https://mocknews.com/gpt-5-released',
      publishedAt: new Date().toISOString()
    }
  ]
};

// 1. Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'oryn-mock-oracles', timestamp: new Date().toISOString() });
});

// 2. CoinGecko simple price mock
// GET /coingecko/simple/price?ids=bitcoin,ethereum&vs_currencies=usd
app.get('/coingecko/simple/price', (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',') : [];
  const vs_currencies = req.query.vs_currencies ? req.query.vs_currencies.split(',') : ['usd'];
  
  const response = {};
  
  ids.forEach(id => {
    const lowerId = id.toLowerCase();
    const price = priceDatabase[lowerId] !== undefined ? priceDatabase[lowerId] : 100.0;
    
    response[lowerId] = {};
    vs_currencies.forEach(currency => {
      response[lowerId][currency.toLowerCase()] = price;
    });
  });
  
  console.log(`[CoinGecko Mock] Requested ids: ${ids.join(', ')} -> Prices:`, response);
  res.json(response);
});

// 3. News API mock
// GET /news-api/everything?q=keywords
app.get('/news-api/everything', (req, res) => {
  const query = req.query.q ? req.query.q.toLowerCase() : '';
  
  // Find matching articles, or return default ones
  let results = [];
  
  if (newsDatabase[query]) {
    results = newsDatabase[query];
  } else {
    // Basic filter of default articles matching keyword
    results = newsDatabase.default.filter(art => {
      return (art.title + ' ' + art.description).toLowerCase().includes(query);
    });
    
    // If no articles match, generate a generic one based on keywords
    if (results.length === 0) {
      results = [
        {
          source: { id: 'mock-generic', name: 'Mock Industry Feed' },
          author: 'Market Analyst',
          title: `Latest trends on ${req.query.q || 'general topic'} show excellent results`,
          description: `Industry analysts are positive and report significant growth, high success rates, and bullish increases overall.`,
          url: 'https://mocknews.com/generic-trends',
          publishedAt: new Date().toISOString()
        }
      ];
    }
  }
  
  console.log(`[News API Mock] Requested query: "${req.query.q}" -> Found ${results.length} articles`);
  res.json({
    status: 'ok',
    totalResults: results.length,
    articles: results
  });
});

// 4. Sports API mock
// GET /sports-api/games/:gameId
app.get('/sports-api/games/:gameId', (req, res) => {
  const { gameId } = req.params;
  
  const gameResult = gameDatabase[gameId] || {
    gameId,
    winner: 'Team A',
    totalScore: 45,
    finished: true,
    isDraw: false,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[Sports API Mock] Requested gameId: ${gameId} -> Result:`, gameResult);
  res.json(gameResult);
});

/* ============================================================
   CONTROL ENDPOINTS FOR TESTING
   ============================================================ */

// Set mock price for a token
// POST /control/price
app.post('/control/price', (req, res) => {
  const { symbol, price } = req.body;
  if (!symbol || price === undefined) {
    return res.status(400).json({ error: 'Missing symbol or price in request body' });
  }
  
  priceDatabase[symbol.toLowerCase()] = parseFloat(price);
  console.log(`[Control] Set price for ${symbol} to $${price}`);
  res.json({ success: true, priceDatabase });
});

// Set mock game results
// POST /control/game
app.post('/control/game', (req, res) => {
  const { gameId, winner, totalScore, finished, isDraw } = req.body;
  if (!gameId) {
    return res.status(400).json({ error: 'Missing gameId in request body' });
  }
  
  gameDatabase[gameId] = {
    gameId,
    winner: winner || 'Team A',
    totalScore: totalScore !== undefined ? parseInt(totalScore) : 45,
    finished: finished !== undefined ? finished : true,
    isDraw: isDraw !== undefined ? isDraw : false,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[Control] Set game status for ${gameId} to:`, gameDatabase[gameId]);
  res.json({ success: true, gameDatabase });
});

// Set mock articles for a news query
// POST /control/news
app.post('/control/news', (req, res) => {
  const { query, articles } = req.body;
  if (!query || !Array.isArray(articles)) {
    return res.status(400).json({ error: 'Missing query or articles array in request body' });
  }
  
  newsDatabase[query.toLowerCase()] = articles;
  console.log(`[Control] Registered mock articles for news query: "${query}"`);
  res.json({ success: true, newsDatabase });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock Oracles Server listening on port ${PORT}`);
});

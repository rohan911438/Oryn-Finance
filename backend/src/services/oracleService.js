const axios = require('axios');
const logger = require('../config/logger');
const { Market } = require('../models');

const DEFAULT_WEIGHTS = {
  coingecko: 0.4,
  'sports-api': 0.35,
  'news-api': 0.25,
  chainlink: 0.5,
};

const OUTLIER_THRESHOLD = 0.15;
const ANOMALY_THRESHOLD = 0.25; // 25% price drift threshold
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Fallback sources for different market types
const FALLBACK_SOURCES = {
  crypto: ['coingecko', 'chainlink'],
  sports: ['sports-api'],
  news: ['news-api'],
  generic: ['coingecko', 'chainlink', 'sports-api']
};

class OracleService {
  constructor() {
    this.resolvers = {
      coingecko: this.resolveCrypto.bind(this),
      'sports-api': this.resolveSports.bind(this),
      'news-api': this.resolveNews.bind(this),
      chainlink: this.resolveChainlink.bind(this)
    };
    this.weights = { ...DEFAULT_WEIGHTS };
    this.resultCache = new Map(); // {marketId: {result, timestamp}}
    this.discrepancyLog = []; // Track all discrepancies
    this.sourceHealth = {}; // Track health of each source
    this.priceHistory = new Map(); // {symbol: [{price, timestamp}]}
    this.initializeSourceHealth();
  }

  initializeSourceHealth() {
    Object.keys(this.resolvers).forEach(source => {
      this.sourceHealth[source] = {
        successCount: 0,
        failureCount: 0,
        lastFailure: null,
        isHealthy: true,
        failureRate: 0
      };
    });
  }

  setWeights(sourceWeights) {
    this.weights = { ...DEFAULT_WEIGHTS, ...sourceWeights };
  }

  getWeights() {
    return this.weights;
  }

  /**
   * Get cached result if available and fresh
   */
  getCachedResult(marketId) {
    if (this.resultCache.has(marketId)) {
      const { result, timestamp } = this.resultCache.get(marketId);
      if (Date.now() - timestamp < CACHE_DURATION) {
        logger.oracle('Using cached oracle result', { marketId, cacheAge: Date.now() - timestamp });
        return result;
      }
    }
    return null;
  }

  /**
   * Cache a result with timestamp
   */
  cacheResult(marketId, result) {
    this.resultCache.set(marketId, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Resolve market with fallback sources if primary fails
   */
  async resolveWithFallback(market) {
    const marketId = market.marketId;
    
    // Try to use cache first
    const cachedResult = this.getCachedResult(marketId);
    if (cachedResult) {
      return cachedResult;
    }

    // Try primary sources first
    let results = [];
    const primarySources = market.oracleConfig?.sources || [market.oracleSource];
    
    logger.oracle('Starting oracle resolution with primary sources', {
      marketId,
      primarySources,
      category: market.category
    });

    for (const source of primarySources) {
      const result = await this.resolveSourceWithRetry(market, source);
      if (result) {
        results.push(result);
      }
    }

    // If primary sources fail, try fallback sources
    if (results.length === 0 && market.category) {
      logger.oracle('Primary sources failed, attempting fallback sources', {
        marketId,
        category: market.category
      });
      
      const fallbackSources = FALLBACK_SOURCES[market.category] || [];
      for (const source of fallbackSources) {
        if (!primarySources.includes(source)) {
          const result = await this.resolveSourceWithRetry(market, source);
          if (result) {
            results.push(result);
            logger.oracle('Fallback source succeeded', {
              marketId,
              fallbackSource: source
            });
            break; // Use first successful fallback
          }
        }
      }
    }

    if (results.length === 0) {
      logger.error('All oracle sources failed', {
        marketId,
        primarySources,
        fallbackSources: FALLBACK_SOURCES[market.category]
      });
      return null;
    }

    const aggregated = this.aggregateResults(results);
    
    // Detect anomalies in aggregated result
    this.detectAnomalies(marketId, aggregated, results);
    
    // Cache the result
    this.cacheResult(marketId, aggregated);

    logger.oracle('Aggregated oracle result with fallback handling', {
      marketId,
      sources: results.map(r => r.source),
      outcome: aggregated.outcome,
      confidence: aggregated.confidence,
      successfulSources: results.length
    });

    return aggregated;
  }

  /**
   * Resolve a single source with retry logic
   */
  async resolveSourceWithRetry(market, source, attempt = 1) {
    const marketId = market.marketId;
    
    if (attempt > MAX_RETRIES) {
      this.recordSourceFailure(source);
      logger.oracle('Max retries exceeded for source', { marketId, source, attempts: attempt - 1 });
      return null;
    }

    try {
      const resolver = this.resolvers[source];
      if (!resolver) {
        logger.oracle('Unknown oracle source', { source });
        return null;
      }

      const result = await resolver({ ...market, oracleSource: source });
      if (result) {
        this.recordSourceSuccess(source);
        return {
          source,
          outcome: result.outcome,
          confidence: result.confidence,
          data: result.data,
          timestamp: new Date().toISOString()
        };
      }
      this.recordSourceFailure(source);
      return null;
    } catch (error) {
      logger.oracle(`Source ${source} failed on attempt ${attempt}/${MAX_RETRIES}`, {
        error: error.message,
        marketId
      });

      this.recordSourceFailure(source);
      
      // Retry with exponential backoff
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        return this.resolveSourceWithRetry(market, source, attempt + 1);
      }
      
      return null;
    }
  }

  /**
   * Record successful resolution from a source
   */
  recordSourceSuccess(source) {
    if (!this.sourceHealth[source]) {
      this.sourceHealth[source] = {
        successCount: 0,
        failureCount: 0,
        lastFailure: null,
        isHealthy: true,
        failureRate: 0
      };
    }
    
    this.sourceHealth[source].successCount++;
    this.updateSourceHealth(source);
  }

  /**
   * Record failed resolution from a source
   */
  recordSourceFailure(source) {
    if (!this.sourceHealth[source]) {
      this.sourceHealth[source] = {
        successCount: 0,
        failureCount: 0,
        lastFailure: null,
        isHealthy: true,
        failureRate: 0
      };
    }
    
    this.sourceHealth[source].failureCount++;
    this.sourceHealth[source].lastFailure = new Date().toISOString();
    this.updateSourceHealth(source);
  }

  /**
   * Update health status of a source
   */
  updateSourceHealth(source) {
    const health = this.sourceHealth[source];
    const total = health.successCount + health.failureCount;
    
    if (total > 0) {
      health.failureRate = health.failureCount / total;
      health.isHealthy = health.failureRate < 0.3; // Mark unhealthy if >30% failure rate
    }
    
    logger.oracle('Source health updated', {
      source,
      successCount: health.successCount,
      failureCount: health.failureCount,
      failureRate: (health.failureRate * 100).toFixed(2) + '%',
      isHealthy: health.isHealthy
    });
  }

  /**
   * Get health status of all sources
   */
  getSourceHealthStatus() {
    return this.sourceHealth;
  }

  async resolveWithWeightedAggregation(market) {
    // Use the new fallback-aware resolution method
    return this.resolveWithFallback(market);
  }

  aggregateResults(results) {
    const outcomes = { yes: 0, no: 0 };
    let totalWeight = 0;
    const sourceBreakdown = [];

    for (const result of results) {
      const weight = (this.weights[result.source] || 0.5) * result.confidence;
      if (result.outcome === 'yes') {
        outcomes.yes += weight;
      } else {
        outcomes.no += weight;
      }
      totalWeight += weight;
      sourceBreakdown.push({
        source: result.source,
        outcome: result.outcome,
        confidence: result.confidence,
        weight: weight
      });
    }

    const filteredResults = this.filterOutliers(results, totalWeight);

    if (filteredResults.length < results.length) {
      // Log which results were filtered as outliers
      const filteredOutSources = results
        .filter(r => !filteredResults.includes(r))
        .map(r => r.source);
      
      logger.oracle('Outliers detected and filtered', {
        filteredOutSources,
        remainingResults: filteredResults.length,
        totalResults: results.length
      });

      return this.aggregateResults(filteredResults);
    }

    const confidence = Math.min(totalWeight / results.length, 1.0);
    const outcome = outcomes.yes > outcomes.no ? 'yes' : 'no';

    return {
      outcome,
      confidence,
      sources: results.length,
      data: {
        breakdown: sourceBreakdown,
        yesWeight: outcomes.yes,
        noWeight: outcomes.no,
        totalWeight,
        aggregationMethod: 'weighted'
      }
    };
  }

  filterOutliers(results, totalWeight) {
    if (results.length < 3) return results;

    const avgOutcome = totalWeight / results.length;
    const filtered = results.filter(result => {
      const weight = (this.weights[result.source] || 0.5) * result.confidence;
      const deviation = Math.abs(weight - avgOutcome) / avgOutcome;
      return deviation <= OUTLIER_THRESHOLD;
    });

    return filtered.length > 0 ? filtered : results; // Always return at least the original
  }

  /**
   * Detect anomalies in oracle results
   * Checks for:
   * - Significant discrepancies between sources
   * - Unusual price movements (drift detection)
   * - Low confidence results
   */
  detectAnomalies(marketId, aggregatedResult, individualResults) {
    const anomalies = {
      discrepancies: [],
      driftWarnings: [],
      lowConfidence: [],
      sourceDisagreement: []
    };

    // Check for source disagreements
    if (individualResults.length > 1) {
      const outcomes = individualResults.map(r => r.outcome);
      const uniqueOutcomes = new Set(outcomes);
      
      if (uniqueOutcomes.size > 1) {
        const disagreement = {
          marketId,
          timestamp: new Date().toISOString(),
          sources: individualResults.map(r => ({ source: r.source, outcome: r.outcome })),
          aggregatedOutcome: aggregatedResult.outcome
        };
        anomalies.sourceDisagreement.push(disagreement);
        
        logger.oracle('Oracle source disagreement detected', {
          marketId,
          disagreement,
          severity: 'warning'
        });
        
        this.discrepancyLog.push(disagreement);
      }
    }

    // Check for low confidence
    if (aggregatedResult.confidence < 0.6) {
      const lowConfAlert = {
        marketId,
        timestamp: new Date().toISOString(),
        confidence: aggregatedResult.confidence,
        sources: individualResults.length
      };
      anomalies.lowConfidence.push(lowConfAlert);
      
      logger.oracle('Low confidence oracle result', {
        marketId,
        confidence: aggregatedResult.confidence,
        severity: 'warning'
      });
      
      this.discrepancyLog.push(lowConfAlert);
    }

    // Check for price drift (crypto prices)
    if (aggregatedResult.data?.breakdown) {
      aggregatedResult.data.breakdown.forEach(item => {
        if (item.source === 'coingecko' && aggregatedResult.data.currentPrice) {
          this.detectPriceDrift(marketId, item.source, aggregatedResult.data.currentPrice);
        }
      });
    }

    return anomalies;
  }

  /**
   * Detect unusual price movements
   */
  detectPriceDrift(marketId, source, currentPrice) {
    const symbol = source; // Could be extended for multiple symbols
    
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol);
    
    if (history.length > 0) {
      const lastPrice = history[history.length - 1].price;
      const percentChange = Math.abs((currentPrice - lastPrice) / lastPrice);

      if (percentChange > ANOMALY_THRESHOLD) {
        const driftAlert = {
          marketId,
          timestamp: new Date().toISOString(),
          source,
          lastPrice,
          currentPrice,
          percentChange: (percentChange * 100).toFixed(2) + '%',
          severity: 'high'
        };

        logger.oracle('Significant price drift detected', driftAlert);
        this.discrepancyLog.push(driftAlert);
      }
    }

    // Keep only last 10 price points
    history.push({ price: currentPrice, timestamp: new Date() });
    if (history.length > 10) {
      history.shift();
    }
  }

  /**
   * Get all recorded discrepancies
   */
  getDiscrepancyLog(limit = 100) {
    return this.discrepancyLog.slice(-limit);
  }

  /**
   * Clear discrepancy log (e.g., for maintenance)
   */
  clearDiscrepancyLog() {
    const count = this.discrepancyLog.length;
    this.discrepancyLog = [];
    logger.oracle('Discrepancy log cleared', { clearedCount: count });
    return count;
  }

  async resolveMarket(market) {
    try {
      if (market.oracleConfig && market.oracleConfig.sources && market.oracleConfig.sources.length > 0) {
        return this.resolveWithFallback(market);
      }

      if (!market.oracleSource || market.oracleSource === 'manual') {
        logger.oracle('Manual resolution required', { marketId: market.marketId });
        return null;
      }

      const resolver = this.resolvers[market.oracleSource];
      if (!resolver) {
        logger.oracle('Unknown oracle source', { source: market.oracleSource, marketId: market.marketId });
        return null;
      }

      const result = await this.resolveSourceWithRetry(market, market.oracleSource);
      
      if (result) {
        logger.oracle('Market resolved by oracle', {
          marketId: market.marketId,
          source: market.oracleSource,
          outcome: result.outcome,
          confidence: result.confidence
        });
        this.cacheResult(market.marketId, result);
      }

      return result;
    } catch (error) {
      logger.error('Oracle resolution failed:', error);
      return null;
    }
  }

  async resolveCrypto(market) {
    try {
      const config = market.oracleConfig || {};
      const { symbol, targetPrice, condition } = config;

      if (!symbol || !targetPrice) {
        logger.oracle('Invalid crypto oracle config', { config, marketId: market.marketId });
        return null;
      }

      // Get current price from CoinGecko
      const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
        params: {
          ids: symbol.toLowerCase(),
          vs_currencies: 'usd'
        },
        headers: {
          'X-CG-Demo-API-Key': process.env.COINGECKO_API_KEY
        },
        timeout: 5000
      });

      const currentPrice = response.data[symbol.toLowerCase()]?.usd;
      
      if (!currentPrice) {
        logger.oracle('Failed to get crypto price', { symbol, marketId: market.marketId });
        return null;
      }

      // Track price history for drift detection
      this.trackPriceHistory(symbol, currentPrice);

      let outcome;
      switch (condition) {
        case 'above':
          outcome = currentPrice > targetPrice ? 'yes' : 'no';
          break;
        case 'below':
          outcome = currentPrice < targetPrice ? 'yes' : 'no';
          break;
        case 'equals':
          // Allow 1% tolerance for price equality
          const tolerance = targetPrice * 0.01;
          outcome = Math.abs(currentPrice - targetPrice) <= tolerance ? 'yes' : 'no';
          break;
        default:
          logger.oracle('Unknown crypto condition', { condition, marketId: market.marketId });
          return null;
      }

      logger.oracle('Crypto oracle resolved', {
        marketId: market.marketId,
        symbol,
        currentPrice,
        targetPrice,
        condition,
        outcome
      });

      return {
        outcome,
        confidence: 1.0,
        data: {
          currentPrice,
          targetPrice,
          symbol,
          condition,
          source: 'CoinGecko',
          priceDeviation: Math.abs((currentPrice - targetPrice) / targetPrice * 100).toFixed(2) + '%'
        }
      };
    } catch (error) {
      logger.error('Crypto oracle resolution failed:', { 
        error: error.message,
        marketId: market.marketId 
      });
      return null;
    }
  }

  /**
   * Track price history for anomaly detection
   */
  trackPriceHistory(symbol, price) {
    const key = `price_${symbol}`;
    if (!this.priceHistory.has(key)) {
      this.priceHistory.set(key, []);
    }
    
    const history = this.priceHistory.get(key);
    history.push({
      price,
      timestamp: Date.now()
    });
    
    // Keep only last 20 price points
    if (history.length > 20) {
      history.shift();
    }
  }

  /**
   * Get price history for a symbol
   */
  getPriceHistory(symbol) {
    return this.priceHistory.get(`price_${symbol}`) || [];
  }

  async resolveSports(market) {
    try {
      const config = market.oracleConfig || {};
      const { gameId, team, condition } = config;

      if (!gameId) {
        logger.oracle('Invalid sports oracle config', { config, marketId: market.marketId });
        return null;
      }

      // This would integrate with a sports API service
      // For demonstration, using a mock response
      const gameResult = await this.getSportsResult(gameId);
      
      if (!gameResult) {
        logger.oracle('Sports game not finished or not found', { gameId, marketId: market.marketId });
        return null;
      }

      let outcome;
      switch (condition) {
        case 'win':
          outcome = gameResult.winner === team ? 'yes' : 'no';
          break;
        case 'score_over':
          outcome = gameResult.totalScore > config.threshold ? 'yes' : 'no';
          break;
        case 'score_under':
          outcome = gameResult.totalScore < config.threshold ? 'yes' : 'no';
          break;
        default:
          logger.oracle('Unknown sports condition', { condition, marketId: market.marketId });
          return null;
      }

      logger.oracle('Sports oracle resolved', {
        marketId: market.marketId,
        gameId,
        outcome,
        gameResult
      });

      return {
        outcome,
        confidence: 0.95,
        data: {
          gameResult,
          team,
          condition,
          source: 'Sports API'
        }
      };
    } catch (error) {
      logger.error('Sports oracle resolution failed:', {
        error: error.message,
        marketId: market.marketId
      });
      return null;
    }
  }

  async resolveNews(market) {
    try {
      const config = market.oracleConfig || {};
      const { keywords, sentiment, sources } = config;

      if (!keywords || !keywords.length) {
        logger.oracle('Invalid news oracle config', { config, marketId: market.marketId });
        return null;
      }

      // Search for news articles
      const articles = await this.getNewsArticles(keywords, sources);
      
      if (!articles || articles.length === 0) {
        logger.oracle('No news articles found', { keywords, marketId: market.marketId });
        return null;
      }

      // Analyze sentiment (simplified)
      const sentimentScore = this.analyzeSentiment(articles);
      
      let outcome;
      switch (sentiment) {
        case 'positive':
          outcome = sentimentScore > 0.1 ? 'yes' : 'no';
          break;
        case 'negative':
          outcome = sentimentScore < -0.1 ? 'yes' : 'no';
          break;
        case 'neutral':
          outcome = Math.abs(sentimentScore) <= 0.1 ? 'yes' : 'no';
          break;
        default:
          logger.oracle('Unknown news sentiment', { sentiment, marketId: market.marketId });
          return null;
      }

      logger.oracle('News oracle resolved', {
        marketId: market.marketId,
        articlesAnalyzed: articles.length,
        sentimentScore: sentimentScore.toFixed(3),
        keywords,
        outcome
      });

      return {
        outcome,
        confidence: 0.7,
        data: {
          articlesAnalyzed: articles.length,
          sentimentScore,
          keywords,
          source: 'News API'
        }
      };
    } catch (error) {
      logger.error('News oracle resolution failed:', {
        error: error.message,
        marketId: market.marketId
      });
      return null;
    }
  }

  async getSportsResult(gameId) {
    // Mock sports API response
    // In a real implementation, this would call a sports API service
    return {
      gameId,
      winner: 'Team A',
      totalScore: 45,
      finished: true,
      timestamp: new Date()
    };
  }

  async getNewsArticles(keywords, sources = []) {
    try {
      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: keywords.join(' AND '),
          sources: sources.join(','),
          sortBy: 'relevancy',
          language: 'en',
          pageSize: 20
        },
        headers: {
          'X-API-Key': process.env.NEWS_API_KEY
        }
      });

      return response.data.articles || [];
    } catch (error) {
      logger.error('Failed to fetch news articles:', error);
      return [];
    }
  }

  analyzeSentiment(articles) {
    // Simplified sentiment analysis
    // In a real implementation, you'd use a proper NLP service
    let positiveWords = ['good', 'great', 'excellent', 'positive', 'up', 'rise', 'increase', 'success'];
    let negativeWords = ['bad', 'terrible', 'negative', 'down', 'fall', 'decrease', 'failure', 'crisis'];
    
    let sentimentScore = 0;
    let wordCount = 0;

    articles.forEach(article => {
      const text = `${article.title} ${article.description}`.toLowerCase();
      
      positiveWords.forEach(word => {
        if (text.includes(word)) {
          sentimentScore += 1;
          wordCount++;
        }
      });
      
      negativeWords.forEach(word => {
        if (text.includes(word)) {
          sentimentScore -= 1;
          wordCount++;
        }
      });
    });

    return wordCount > 0 ? sentimentScore / wordCount : 0;
  }

  // Chainlink oracle integration
  async resolveChainlink(market) {
    try {
      const config = market.oracleConfig || {};
      const { feedAddress, targetValue, operator } = config;

      if (!feedAddress) {
        logger.oracle('Invalid chainlink config', { config, marketId: market.marketId });
        return null;
      }

      logger.oracle('Chainlink oracle resolution initiated', {
        marketId: market.marketId,
        feedAddress,
        targetValue,
        operator
      });

      // In a real implementation, this would:
      // 1. Connect to a Chainlink price feed
      // 2. Fetch the latest round data
      // 3. Validate the data freshness
      // 4. Compare against target value
      
      // For now, log that it would integrate with Chainlink
      logger.oracle('Chainlink oracle integration pending', {
        marketId: market.marketId,
        message: 'Requires Chainlink smart contract integration'
      });

      return null;
    } catch (error) {
      logger.error('Chainlink oracle resolution failed:', {
        error: error.message,
        marketId: market.marketId
      });
      return null;
    }
  }
}

module.exports = new OracleService();
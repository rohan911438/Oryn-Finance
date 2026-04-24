const axios = require('axios');
const logger = require('../config/logger');
const { Market } = require('../models');

const DEFAULT_WEIGHTS = {
  coingecko: 0.4,
  cryptocompare: 0.35,
  'sports-api': 0.35,
  'theodds-api': 0.3,
  'news-api': 0.25,
  chainlink: 0.5,
};

const OUTLIER_THRESHOLD = 0.15;
const ANOMALY_THRESHOLD = 0.25; // 25% price drift threshold
const PRICE_DEVIATION_THRESHOLD = 0.05; // 5% cross-source deviation triggers discrepancy log
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Fallback sources per market category
const FALLBACK_SOURCES = {
  crypto: ['coingecko', 'cryptocompare', 'chainlink'],
  sports: ['sports-api', 'theodds-api'],
  news: ['news-api'],
  generic: ['coingecko', 'cryptocompare', 'chainlink', 'sports-api']
};

class OracleService {
  constructor() {
    this.resolvers = {
      coingecko: this.resolveCrypto.bind(this),
      cryptocompare: this.resolveCryptoCompare.bind(this),
      'sports-api': this.resolveSports.bind(this),
      'theodds-api': this.resolveTheOdds.bind(this),
      'news-api': this.resolveNews.bind(this),
      chainlink: this.resolveChainlink.bind(this)
    };
    this.weights = { ...DEFAULT_WEIGHTS };
    this.resultCache = new Map();
    this.discrepancyLog = [];
    this.sourceHealth = {};
    this.priceHistory = new Map();
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

  cacheResult(marketId, result) {
    this.resultCache.set(marketId, { result, timestamp: Date.now() });
  }

  async resolveWithFallback(market) {
    const marketId = market.marketId;

    const cachedResult = this.getCachedResult(marketId);
    if (cachedResult) return cachedResult;

    const primarySources = market.oracleConfig?.sources || [market.oracleSource];
    let results = [];

    logger.oracle('Starting oracle resolution with primary sources', {
      marketId,
      primarySources,
      category: market.category
    });

    for (const source of primarySources) {
      const result = await this.resolveSourceWithRetry(market, source);
      if (result) results.push(result);
    }

    // Try fallback sources if primary failed
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
            logger.oracle('Fallback source succeeded', { marketId, fallbackSource: source });
            break;
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
    this.detectAnomalies(marketId, aggregated, results);
    this.cacheResult(marketId, aggregated);

    logger.oracle('Aggregated oracle result', {
      marketId,
      sources: results.map(r => r.source),
      outcome: aggregated.outcome,
      confidence: aggregated.confidence
    });

    return aggregated;
  }

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

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        return this.resolveSourceWithRetry(market, source, attempt + 1);
      }
      return null;
    }
  }

  recordSourceSuccess(source) {
    if (!this.sourceHealth[source]) {
      this.sourceHealth[source] = { successCount: 0, failureCount: 0, lastFailure: null, isHealthy: true, failureRate: 0 };
    }
    this.sourceHealth[source].successCount++;
    this.updateSourceHealth(source);
  }

  recordSourceFailure(source) {
    if (!this.sourceHealth[source]) {
      this.sourceHealth[source] = { successCount: 0, failureCount: 0, lastFailure: null, isHealthy: true, failureRate: 0 };
    }
    this.sourceHealth[source].failureCount++;
    this.sourceHealth[source].lastFailure = new Date().toISOString();
    this.updateSourceHealth(source);
  }

  updateSourceHealth(source) {
    const health = this.sourceHealth[source];
    const total = health.successCount + health.failureCount;
    if (total > 0) {
      health.failureRate = health.failureCount / total;
      health.isHealthy = health.failureRate < 0.3;
    }
    logger.oracle('Source health updated', {
      source,
      successCount: health.successCount,
      failureCount: health.failureCount,
      failureRate: (health.failureRate * 100).toFixed(2) + '%',
      isHealthy: health.isHealthy
    });
  }

  getSourceHealthStatus() {
    return this.sourceHealth;
  }

  async resolveWithWeightedAggregation(market) {
    return this.resolveWithFallback(market);
  }

  aggregateResults(results) {
    const outcomes = { yes: 0, no: 0 };
    let totalWeight = 0;
    const sourceBreakdown = [];

    for (const result of results) {
      const weight = (this.weights[result.source] || 0.5) * result.confidence;
      if (result.outcome === 'yes') outcomes.yes += weight;
      else outcomes.no += weight;
      totalWeight += weight;
      sourceBreakdown.push({ source: result.source, outcome: result.outcome, confidence: result.confidence, weight });
    }

    const filteredResults = this.filterOutliers(results, totalWeight);
    if (filteredResults.length < results.length) {
      const filteredOutSources = results.filter(r => !filteredResults.includes(r)).map(r => r.source);
      logger.oracle('Outliers detected and filtered', { filteredOutSources, remainingResults: filteredResults.length });
      return this.aggregateResults(filteredResults);
    }

    const confidence = Math.min(totalWeight / results.length, 1.0);
    const outcome = outcomes.yes > outcomes.no ? 'yes' : 'no';

    return {
      outcome,
      confidence,
      sources: results.length,
      data: { breakdown: sourceBreakdown, yesWeight: outcomes.yes, noWeight: outcomes.no, totalWeight, aggregationMethod: 'weighted' }
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
    return filtered.length > 0 ? filtered : results;
  }

  /**
   * Detect anomalies: source disagreements, low confidence, price drift, cross-source price deviation
   */
  detectAnomalies(marketId, aggregatedResult, individualResults) {
    const anomalies = { discrepancies: [], driftWarnings: [], lowConfidence: [], sourceDisagreement: [] };

    // Source outcome disagreement
    if (individualResults.length > 1) {
      const uniqueOutcomes = new Set(individualResults.map(r => r.outcome));
      if (uniqueOutcomes.size > 1) {
        const disagreement = {
          marketId,
          timestamp: new Date().toISOString(),
          sources: individualResults.map(r => ({ source: r.source, outcome: r.outcome })),
          aggregatedOutcome: aggregatedResult.outcome
        };
        anomalies.sourceDisagreement.push(disagreement);
        logger.oracleDiscrepancy('Oracle source disagreement detected', { ...disagreement, severity: 'warning' });
        this.discrepancyLog.push({ type: 'source_disagreement', ...disagreement });
      }
    }

    // Low confidence
    if (aggregatedResult.confidence < 0.6) {
      const alert = {
        marketId,
        timestamp: new Date().toISOString(),
        confidence: aggregatedResult.confidence,
        sources: individualResults.length
      };
      anomalies.lowConfidence.push(alert);
      logger.oracleAnomaly('Low confidence oracle result', { ...alert, severity: 'warning' });
      this.discrepancyLog.push({ type: 'low_confidence', ...alert });
    }

    // Cross-source price deviation (for crypto sources with numeric prices)
    const cryptoPrices = individualResults
      .filter(r => r.data?.currentPrice != null)
      .map(r => ({ source: r.source, price: r.data.currentPrice }));

    if (cryptoPrices.length >= 2) {
      const prices = cryptoPrices.map(p => p.price);
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const deviation = (maxPrice - minPrice) / minPrice;

      if (deviation > PRICE_DEVIATION_THRESHOLD) {
        const deviationAlert = {
          marketId,
          timestamp: new Date().toISOString(),
          sources: cryptoPrices,
          deviation: (deviation * 100).toFixed(2) + '%',
          severity: deviation > ANOMALY_THRESHOLD ? 'high' : 'medium'
        };
        anomalies.discrepancies.push(deviationAlert);
        logger.oracleDiscrepancy('Cross-source price deviation detected', deviationAlert);
        this.discrepancyLog.push({ type: 'price_deviation', ...deviationAlert });
      }
    }

    // Price drift detection
    if (aggregatedResult.data?.breakdown) {
      aggregatedResult.data.breakdown.forEach(item => {
        if (item.source === 'coingecko' && aggregatedResult.data.currentPrice) {
          this.detectPriceDrift(marketId, item.source, aggregatedResult.data.currentPrice);
        }
      });
    }

    return anomalies;
  }

  detectPriceDrift(marketId, source, currentPrice) {
    const symbol = source;
    if (!this.priceHistory.has(symbol)) this.priceHistory.set(symbol, []);
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
        logger.oracleAnomaly('Significant price drift detected', driftAlert);
        this.discrepancyLog.push({ type: 'price_drift', ...driftAlert });
      }
    }

    history.push({ price: currentPrice, timestamp: new Date() });
    if (history.length > 10) history.shift();
  }

  getDiscrepancyLog(limit = 100) {
    return this.discrepancyLog.slice(-limit);
  }

  clearDiscrepancyLog() {
    const count = this.discrepancyLog.length;
    this.discrepancyLog = [];
    logger.oracle('Discrepancy log cleared', { clearedCount: count });
    return count;
  }

  async resolveMarket(market) {
    try {
      if (market.oracleConfig?.sources?.length > 0) {
        return this.resolveWithFallback(market);
      }
      if (!market.oracleSource || market.oracleSource === 'manual') {
        logger.oracle('Manual resolution required', { marketId: market.marketId });
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

  // --- CoinGecko (primary crypto source) ---
  async resolveCrypto(market) {
    try {
      const config = market.oracleConfig || {};
      const { symbol, targetPrice, condition } = config;
      if (!symbol || !targetPrice) {
        logger.oracle('Invalid crypto oracle config', { config, marketId: market.marketId });
        return null;
      }

      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: symbol.toLowerCase(), vs_currencies: 'usd' },
        headers: { 'X-CG-Demo-API-Key': process.env.COINGECKO_API_KEY },
        timeout: 5000
      });

      const currentPrice = response.data[symbol.toLowerCase()]?.usd;
      if (!currentPrice) {
        logger.oracle('Failed to get crypto price from CoinGecko', { symbol, marketId: market.marketId });
        return null;
      }

      this.trackPriceHistory(symbol, currentPrice);
      const outcome = this.evaluatePriceCondition(currentPrice, targetPrice, condition);
      if (outcome === null) {
        logger.oracle('Unknown crypto condition', { condition, marketId: market.marketId });
        return null;
      }

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
      logger.error('CoinGecko oracle resolution failed:', { error: error.message, marketId: market.marketId });
      return null;
    }
  }

  // --- CryptoCompare (fallback crypto source) ---
  async resolveCryptoCompare(market) {
    try {
      const config = market.oracleConfig || {};
      const { symbol, targetPrice, condition } = config;
      if (!symbol || !targetPrice) {
        logger.oracle('Invalid crypto oracle config for CryptoCompare', { config, marketId: market.marketId });
        return null;
      }

      // CryptoCompare uses ticker symbols (e.g. BTC) not CoinGecko IDs
      const ticker = this.coinGeckoIdToTicker(symbol);
      const response = await axios.get('https://min-api.cryptocompare.com/data/price', {
        params: { fsym: ticker.toUpperCase(), tsyms: 'USD' },
        headers: process.env.CRYPTOCOMPARE_API_KEY
          ? { Authorization: `Apikey ${process.env.CRYPTOCOMPARE_API_KEY}` }
          : {},
        timeout: 5000
      });

      const currentPrice = response.data?.USD;
      if (!currentPrice) {
        logger.oracle('Failed to get crypto price from CryptoCompare', { symbol, marketId: market.marketId });
        return null;
      }

      this.trackPriceHistory(`${symbol}_cc`, currentPrice);
      const outcome = this.evaluatePriceCondition(currentPrice, targetPrice, condition);
      if (outcome === null) {
        logger.oracle('Unknown crypto condition', { condition, marketId: market.marketId });
        return null;
      }

      logger.oracle('CryptoCompare oracle resolved', { marketId: market.marketId, symbol, currentPrice, outcome });

      return {
        outcome,
        confidence: 0.95,
        data: {
          currentPrice,
          targetPrice,
          symbol,
          condition,
          source: 'CryptoCompare',
          priceDeviation: Math.abs((currentPrice - targetPrice) / targetPrice * 100).toFixed(2) + '%'
        }
      };
    } catch (error) {
      logger.error('CryptoCompare oracle resolution failed:', { error: error.message, marketId: market.marketId });
      return null;
    }
  }

  // --- Sports API (primary sports source) ---
  async resolveSports(market) {
    try {
      const config = market.oracleConfig || {};
      const { gameId, team, condition } = config;
      if (!gameId) {
        logger.oracle('Invalid sports oracle config', { config, marketId: market.marketId });
        return null;
      }

      const gameResult = await this.getSportsResult(gameId);
      if (!gameResult) {
        logger.oracle('Sports game not finished or not found', { gameId, marketId: market.marketId });
        return null;
      }

      const outcome = this.evaluateSportsCondition(gameResult, team, condition, config);
      if (outcome === null) {
        logger.oracle('Unknown sports condition', { condition, marketId: market.marketId });
        return null;
      }

      return { outcome, confidence: 0.95, data: { gameResult, team, condition, source: 'Sports API' } };
    } catch (error) {
      logger.error('Sports oracle resolution failed:', { error: error.message, marketId: market.marketId });
      return null;
    }
  }

  // --- TheOdds API (fallback sports source) ---
  async resolveTheOdds(market) {
    try {
      const config = market.oracleConfig || {};
      const { sport, team, condition } = config;
      if (!sport) {
        logger.oracle('Invalid TheOdds oracle config', { config, marketId: market.marketId });
        return null;
      }

      const apiKey = process.env.THEODDS_API_KEY || process.env.SPORTS_API_KEY;
      if (!apiKey) {
        logger.oracle('TheOdds API key not configured', { marketId: market.marketId });
        return null;
      }

      const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sport}/scores`, {
        params: { apiKey, daysFrom: 1 },
        timeout: 5000
      });

      const games = response.data || [];
      const game = games.find(g =>
        g.home_team === team || g.away_team === team
      );

      if (!game || !game.completed) {
        logger.oracle('TheOdds: game not found or not completed', { sport, team, marketId: market.marketId });
        return null;
      }

      const homeScore = game.scores?.find(s => s.name === game.home_team)?.score;
      const awayScore = game.scores?.find(s => s.name === game.away_team)?.score;
      const winner = homeScore > awayScore ? game.home_team : game.away_team;

      let outcome;
      if (condition === 'win') {
        outcome = winner === team ? 'yes' : 'no';
      } else {
        logger.oracle('Unsupported TheOdds condition', { condition, marketId: market.marketId });
        return null;
      }

      logger.oracle('TheOdds oracle resolved', { marketId: market.marketId, sport, team, outcome });

      return {
        outcome,
        confidence: 0.9,
        data: { game, team, condition, source: 'TheOdds API' }
      };
    } catch (error) {
      logger.error('TheOdds oracle resolution failed:', { error: error.message, marketId: market.marketId });
      return null;
    }
  }

  async resolveNews(market) {
    try {
      const config = market.oracleConfig || {};
      const { keywords, sentiment, sources } = config;
      if (!keywords?.length) {
        logger.oracle('Invalid news oracle config', { config, marketId: market.marketId });
        return null;
      }

      const articles = await this.getNewsArticles(keywords, sources);
      if (!articles?.length) {
        logger.oracle('No news articles found', { keywords, marketId: market.marketId });
        return null;
      }

      const sentimentScore = this.analyzeSentiment(articles);
      let outcome;
      switch (sentiment) {
        case 'positive': outcome = sentimentScore > 0.1 ? 'yes' : 'no'; break;
        case 'negative': outcome = sentimentScore < -0.1 ? 'yes' : 'no'; break;
        case 'neutral': outcome = Math.abs(sentimentScore) <= 0.1 ? 'yes' : 'no'; break;
        default:
          logger.oracle('Unknown news sentiment', { sentiment, marketId: market.marketId });
          return null;
      }

      return { outcome, confidence: 0.7, data: { articlesAnalyzed: articles.length, sentimentScore, keywords, source: 'News API' } };
    } catch (error) {
      logger.error('News oracle resolution failed:', { error: error.message, marketId: market.marketId });
      return null;
    }
  }

  async resolveChainlink(market) {
    try {
      const config = market.oracleConfig || {};
      const { feedAddress } = config;
      if (!feedAddress) {
        logger.oracle('Invalid chainlink config', { config, marketId: market.marketId });
        return null;
      }
      logger.oracle('Chainlink oracle integration pending', { marketId: market.marketId, message: 'Requires Chainlink smart contract integration' });
      return null;
    } catch (error) {
      logger.error('Chainlink oracle resolution failed:', { error: error.message, marketId: market.marketId });
      return null;
    }
  }

  // --- Helpers ---

  evaluatePriceCondition(currentPrice, targetPrice, condition) {
    switch (condition) {
      case 'above': return currentPrice > targetPrice ? 'yes' : 'no';
      case 'below': return currentPrice < targetPrice ? 'yes' : 'no';
      case 'equals': {
        const tolerance = targetPrice * 0.01;
        return Math.abs(currentPrice - targetPrice) <= tolerance ? 'yes' : 'no';
      }
      default: return null;
    }
  }

  evaluateSportsCondition(gameResult, team, condition, config) {
    switch (condition) {
      case 'win': return gameResult.winner === team ? 'yes' : 'no';
      case 'score_over': return gameResult.totalScore > config.threshold ? 'yes' : 'no';
      case 'score_under': return gameResult.totalScore < config.threshold ? 'yes' : 'no';
      default: return null;
    }
  }

  // Map common CoinGecko IDs to CryptoCompare tickers
  coinGeckoIdToTicker(id) {
    const map = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', ripple: 'XRP', stellar: 'XLM' };
    return map[id.toLowerCase()] || id.toUpperCase();
  }

  trackPriceHistory(symbol, price) {
    const key = `price_${symbol}`;
    if (!this.priceHistory.has(key)) this.priceHistory.set(key, []);
    const history = this.priceHistory.get(key);
    history.push({ price, timestamp: Date.now() });
    if (history.length > 20) history.shift();
  }

  getPriceHistory(symbol) {
    return this.priceHistory.get(`price_${symbol}`) || [];
  }

  async getSportsResult(gameId) {
    return { gameId, winner: 'Team A', totalScore: 45, finished: true, timestamp: new Date() };
  }

  async getNewsArticles(keywords, sources = []) {
    try {
      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: { q: keywords.join(' AND '), sources: sources.join(','), sortBy: 'relevancy', language: 'en', pageSize: 20 },
        headers: { 'X-API-Key': process.env.NEWS_API_KEY }
      });
      return response.data.articles || [];
    } catch (error) {
      logger.error('Failed to fetch news articles:', error);
      return [];
    }
  }

  analyzeSentiment(articles) {
    const positiveWords = ['good', 'great', 'excellent', 'positive', 'up', 'rise', 'increase', 'success'];
    const negativeWords = ['bad', 'terrible', 'negative', 'down', 'fall', 'decrease', 'failure', 'crisis'];
    let sentimentScore = 0, wordCount = 0;
    articles.forEach(article => {
      const text = `${article.title} ${article.description}`.toLowerCase();
      positiveWords.forEach(w => { if (text.includes(w)) { sentimentScore++; wordCount++; } });
      negativeWords.forEach(w => { if (text.includes(w)) { sentimentScore--; wordCount++; } });
    });
    return wordCount > 0 ? sentimentScore / wordCount : 0;
  }
}

module.exports = new OracleService();

const logger = require('../config/logger');
const { Market } = require('../models');
const OracleProviderLoader = require('./oracle/OracleProviderLoader');
const consensusEngine = require('./oracle/ConsensusEngine');
const auditService = require('./auditService');

const ANOMALY_THRESHOLD = 0.25; // 25% price drift threshold
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const QUEUE_RETRY_DELAY = 30 * 1000; // 30 seconds
const MAX_QUEUE_ATTEMPTS = 5;
const DEFAULT_MAX_STALENESS_MS = 5 * 60 * 1000; // reject responses older than 5 minutes by default
const DEFAULT_CONSENSUS_THRESHOLD = 0.6; // 60% of weighted votes required to reach consensus

// Fallback sources for different market types
const FALLBACK_SOURCES = {
  crypto: ['coingecko', 'chainlink'],
  sports: ['sports-api'],
  news: ['news-api'],
  generic: ['coingecko', 'chainlink', 'sports-api']
};

/**
 * OracleService
 * 
 * Main oracle service that coordinates with pluggable oracle providers.
 * Uses a plugin-based architecture for flexible oracle provider integration.
 * 
 * New providers can be added without modifying this class.
 * See OracleProviderLoader for registering and managing providers.
 */
class OracleService {
  constructor() {
    this.providerLoader = OracleProviderLoader;
    this.registry = this.providerLoader.getRegistry();
    this.resultCache = new Map(); // {marketId: {result, timestamp}}
    this.discrepancyLog = []; // Track all discrepancies
    this.sourceHealth = {}; // Track health of each source
    this.priceHistory = new Map(); // {symbol: [{price, timestamp}]}
    this.retryQueue = [];
    this.retryHistory = [];
    this.isProcessingRetryQueue = false;
    this.initializeSourceHealth();
  }

  /**
   * Initialize the oracle service with providers
   * Must be called before using the service
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize default providers
      const results = await this.providerLoader.initializeDefaultProviders();
      
      // Initialize fallback chains
      this.providerLoader.initializeFallbackChains();

      // Log initialization results
      const successful = results.filter(r => r.status === 'registered').length;
      const failed = results.filter(r => r.status === 'failed').length;

      logger.oracle('OracleService initialized', {
        providersLoaded: successful,
        providersFailed: failed,
        totalProviders: results.length
      });

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize OracleService', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   */
  ensureInitialized() {
    if (!this.initialized && !this.legacyReady) {
      throw new Error('OracleService not initialized. Call initialize() first.');
    }
  }

  initializeSourceHealth() {
    const defaultHealth = {
      successCount: 0,
      failureCount: 0,
      lastFailure: null,
      isHealthy: true,
      failureRate: 0
    };

    this.sourceHealth = {
      coingecko: { ...defaultHealth },
      'sports-api': { ...defaultHealth },
      'news-api': { ...defaultHealth },
      chainlink: { ...defaultHealth }
    };

    this.resolvers = {
      coingecko: this.resolveCrypto.bind(this),
      'sports-api': this.resolveSports.bind(this),
      'news-api': this.resolveNews.bind(this)
    };

    this.registry.weights = {
      coingecko: 0.4,
      'sports-api': 0.35,
      'news-api': 0.25,
      chainlink: 0.5,
      ...this.registry.weights
    };
    this.legacyReady = true;
  }

  /**
   * Set provider weights for aggregation
   */
  setWeights(sourceWeights) {
    this.ensureInitialized();
    this.registry.setWeights(sourceWeights);
    logger.oracle('Oracle provider weights updated', { weights: sourceWeights });
  }

  /**
   * Get provider weights
   */
  getWeights() {
    this.ensureInitialized();
    const providers = Array.from(new Set([
      ...this.registry.getProviderNames(),
      ...Object.keys(this.registry.weights || {}),
      ...Object.keys(this.resolvers || {})
    ]));
    const weights = {};
    providers.forEach(name => {
      weights[name] = this.registry.getWeight(name);
    });
    return weights;
  }

  /**
   * Register a custom provider
   */
  registerCustomProvider(name, ProviderClass, options = {}) {
    this.ensureInitialized();
    return this.providerLoader.registerCustomProvider(name, ProviderClass, options);
  }

  /**
   * Get a provider instance
   */
  getProvider(name) {
    this.ensureInitialized();
    return this.registry.getProvider(name);
  }

  /**
   * List all available providers
   */
  listProviders() {
    this.ensureInitialized();
    return this.registry.listProviders();
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

  getFallbackSources(category) {
    const normalizedCategory = String(category || 'generic').toLowerCase();
    return FALLBACK_SOURCES[normalizedCategory] || FALLBACK_SOURCES.generic;
  }

  getResolutionSources(market) {
    const primarySources = (market.oracleConfig?.sources || [market.oracleSource])
      .filter(source => source && source !== 'manual');
    const fallbackSources = this.getFallbackSources(market.category)
      .filter(source => !primarySources.includes(source));

    return {
      primarySources,
      fallbackSources,
      candidateSources: [...primarySources, ...fallbackSources]
    };
  }

  cloneMarketForQueue(market) {
    const rawMarket = typeof market.toObject === 'function' ? market.toObject() : market;
    return JSON.parse(JSON.stringify(rawMarket));
  }

  async resolveCrypto(market) {
    try {
      const axios = require('axios');
      const config = market.oracleConfig || {};
      const symbol = String(config.symbol || '').toLowerCase();
      const targetPrice = Number(config.targetPrice);
      const condition = config.condition || 'above';

      if (!symbol || !Number.isFinite(targetPrice)) {
        return null;
      }

      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: symbol, vs_currencies: 'usd' },
        timeout: 5000
      });
      const currentPrice = Number(response?.data?.[symbol]?.usd);
      if (!Number.isFinite(currentPrice)) {
        return null;
      }

      let outcome = 'no';
      if (condition === 'above') outcome = currentPrice > targetPrice ? 'yes' : 'no';
      if (condition === 'below') outcome = currentPrice < targetPrice ? 'yes' : 'no';
      if (condition === 'equals') outcome = Math.abs(currentPrice - targetPrice) <= targetPrice * 0.01 ? 'yes' : 'no';

      return {
        outcome,
        confidence: 1,
        data: {
          source: 'coingecko',
          symbol,
          currentPrice,
          targetPrice,
          condition
        }
      };
    } catch (error) {
      logger.error('Legacy crypto oracle resolution failed', { error: error.message });
      return null;
    }
  }

  async resolveSports(market) {
    const config = market.oracleConfig || {};
    return {
      outcome: config.condition === 'lose' ? 'no' : 'yes',
      confidence: 0.8,
      data: {
        source: 'sports-api',
        gameId: config.gameId || null,
        team: config.team || null
      }
    };
  }

  async resolveNews(market) {
    try {
      const axios = require('axios');
      const config = market.oracleConfig || {};
      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: { q: (config.keywords || []).join(' '), sources: (config.sources || []).join(',') },
        timeout: 5000
      });

      const articles = response?.data?.articles || [];
      const text = articles
        .map(article => `${article.title || ''} ${article.description || ''}`)
        .join(' ')
        .toLowerCase();
      const positiveHits = ['good', 'great', 'rise', 'success', 'gain', 'positive'].filter(word => text.includes(word)).length;
      const negativeHits = ['bad', 'fall', 'loss', 'negative', 'decline'].filter(word => text.includes(word)).length;
      const sentiment = positiveHits >= negativeHits ? 'positive' : 'negative';

      return {
        outcome: sentiment === (config.sentiment || 'positive') ? 'yes' : 'no',
        confidence: articles.length > 0 ? 0.75 : 0.5,
        data: {
          source: 'news-api',
          sentiment,
          articleCount: articles.length
        }
      };
    } catch (error) {
      logger.error('Legacy news oracle resolution failed', { error: error.message });
      return null;
    }
  }

  async resolveSourceWithRetry(market, source) {
    const legacyResolver = this.resolvers?.[source];
    if (legacyResolver) {
      const result = await legacyResolver(market);
      if (!result) return null;
      return {
        source,
        outcome: result.outcome,
        confidence: result.confidence,
        data: {
          ...(result.data || {}),
          provider: source
        },
        timestamp: new Date().toISOString()
      };
    }

    const provider = this.registry.getProvider(source);
    if (!provider) return null;
    return provider.resolveWithRetry(market);
  }

  enqueueFailedRequest(market, metadata = {}) {
    const marketId = market.marketId || market._id?.toString();
    if (!marketId) {
      logger.oracle('Skipped oracle retry queue item without market id', { metadata });
      return null;
    }

    const existing = this.retryQueue.find(item => item.marketId === marketId && item.status === 'pending');
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      existing.lastError = metadata.lastError || existing.lastError;
      existing.sources = metadata.sources || existing.sources;
      logger.oracle('Oracle retry request already queued', {
        marketId,
        queueId: existing.id,
        attempts: existing.attempts,
        nextAttemptAt: existing.nextAttemptAt
      });
      return existing;
    }

    const now = Date.now();
    const item = {
      id: `${marketId}-${now}`,
      marketId,
      market: this.cloneMarketForQueue(market),
      status: 'pending',
      attempts: 0,
      maxAttempts: metadata.maxAttempts || MAX_QUEUE_ATTEMPTS,
      sources: metadata.sources || this.getResolutionSources(market).candidateSources,
      lastError: metadata.lastError || 'Oracle resolution failed',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      nextAttemptAt: new Date(now + (metadata.retryDelay || QUEUE_RETRY_DELAY)).toISOString(),
      history: []
    };

    this.retryQueue.push(item);
    logger.oracle('Queued failed oracle request', {
      queueId: item.id,
      marketId,
      sources: item.sources,
      nextAttemptAt: item.nextAttemptAt,
      reason: item.lastError
    });

    return item;
  }

  getRetryQueueStatus() {
    return {
      pending: this.retryQueue.filter(item => item.status === 'pending').length,
      processing: this.isProcessingRetryQueue,
      items: this.retryQueue.map(item => ({
        id: item.id,
        marketId: item.marketId,
        status: item.status,
        attempts: item.attempts,
        maxAttempts: item.maxAttempts,
        sources: item.sources,
        lastError: item.lastError,
        nextAttemptAt: item.nextAttemptAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      })),
      history: this.retryHistory.slice(-25)
    };
  }

  clearRetryQueue() {
    const count = this.retryQueue.length;
    this.retryQueue = [];
    this.retryHistory = [];
    logger.oracle('Oracle retry queue cleared', { clearedCount: count });
    return count;
  }

  async processRetryQueue(now = Date.now()) {
    if (this.isProcessingRetryQueue) {
      logger.oracle('Oracle retry queue processing already in progress');
      return [];
    }

    this.isProcessingRetryQueue = true;
    const processed = [];

    try {
      const dueItems = this.retryQueue.filter(item => (
        item.status === 'pending' && new Date(item.nextAttemptAt).getTime() <= now
      ));

      for (const item of dueItems) {
        const result = await this.processRetryItem(item);
        processed.push(result);
      }

      this.retryQueue = this.retryQueue.filter(item => item.status === 'pending');
      return processed;
    } finally {
      this.isProcessingRetryQueue = false;
    }
  }

  async processRetryItem(item) {
    item.attempts += 1;
    item.updatedAt = new Date().toISOString();

    logger.oracle('Processing queued oracle retry', {
      queueId: item.id,
      marketId: item.marketId,
      attempt: item.attempts,
      maxAttempts: item.maxAttempts,
      sources: item.sources
    });

    const results = [];
    for (const source of item.sources) {
      const result = await this.resolveSourceWithRetry(item.market, source);
      item.history.push({
        source,
        attempt: item.attempts,
        success: Boolean(result),
        timestamp: new Date().toISOString()
      });

      if (result) {
        results.push(result);
        break;
      }
    }

    if (results.length > 0) {
      const aggregated = this.aggregateResults(results, this.getConsensusOptions(item.marketId, item.market));
      this.detectAnomalies(item.marketId, aggregated, results);
      this.cacheResult(item.marketId, aggregated);
      item.status = 'resolved';
      item.result = aggregated;
      item.updatedAt = new Date().toISOString();
      this.retryHistory.push({
        queueId: item.id,
        marketId: item.marketId,
        status: 'resolved',
        attempts: item.attempts,
        timestamp: item.updatedAt,
        sources: results.map(result => result.source)
      });
      logger.oracle('Queued oracle retry resolved', {
        queueId: item.id,
        marketId: item.marketId,
        attempts: item.attempts,
        sources: results.map(result => result.source),
        outcome: aggregated.outcome
      });
      return { item, result: aggregated };
    }

    item.lastError = 'All retry sources failed';
    item.updatedAt = new Date().toISOString();

    if (item.attempts >= item.maxAttempts) {
      item.status = 'failed';
      this.retryHistory.push({
        queueId: item.id,
        marketId: item.marketId,
        status: 'failed',
        attempts: item.attempts,
        timestamp: item.updatedAt
      });
      logger.error('Queued oracle retry exhausted', {
        queueId: item.id,
        marketId: item.marketId,
        attempts: item.attempts,
        sources: item.sources
      });
    } else {
      item.nextAttemptAt = new Date(Date.now() + (QUEUE_RETRY_DELAY * item.attempts)).toISOString();
      logger.oracle('Queued oracle retry scheduled again', {
        queueId: item.id,
        marketId: item.marketId,
        attempts: item.attempts,
        nextAttemptAt: item.nextAttemptAt
      });
    }

    return { item, result: null };
  }

  /**
   * Resolve market with primary sources and fallback
   * Uses plugin-based providers from the registry
   */
  async resolveWithFallback(market, options = {}) {
    const marketId = market.marketId;

    // Try to use cache first
    const cachedResult = this.getCachedResult(marketId);
    if (cachedResult) {
      return cachedResult;
    }

    // Try primary sources first
    let results = [];
    const { primarySources, fallbackSources, candidateSources } = this.getResolutionSources(market);
    
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
    if (results.length === 0 && fallbackSources.length > 0) {
      logger.oracle('Primary sources failed, attempting fallback sources', {
        marketId,
        category: market.category,
        fallbackSources
      });
      
      for (const source of fallbackSources) {
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

    if (!results || results.length === 0) {
      logger.error('All oracle sources failed', {
        marketId,
        primarySources,
        fallbackSources
      });
      if (!options.skipQueue) {
        this.enqueueFailedRequest(market, {
          sources: candidateSources,
          lastError: 'All oracle sources failed'
        });
      }
      return null;
    }

    // Aggregate results through the consensus engine
    const aggregated = this.aggregateResults(results, this.getConsensusOptions(marketId, market));

    // Detect anomalies
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
   * Resolve the consensus configuration (staleness/threshold/min-responses) for
   * a market, falling back to platform defaults. Configurable per-market via
   * `market.oracleConfig`.
   */
  getConsensusOptions(marketId, market) {
    const config = market?.oracleConfig || {};
    return {
      marketId,
      maxAgeMs: Number.isFinite(config.maxStalenessMs) ? config.maxStalenessMs : DEFAULT_MAX_STALENESS_MS,
      consensusThreshold: Number.isFinite(config.consensusThreshold) ? config.consensusThreshold : DEFAULT_CONSENSUS_THRESHOLD,
      minResponses: Number.isFinite(config.minConsensusResponses) ? config.minConsensusResponses : 1,
      ...(Number.isFinite(config.outlierThreshold) ? { outlierThreshold: config.outlierThreshold } : {})
    };
  }

  /**
   * Aggregate results from multiple providers using the OracleConsensusEngine.
   * Validates responses, rejects stale/outlier responses, applies provider
   * weights, and checks the result against a configurable consensus threshold.
   */
  aggregateResults(results, options = {}) {
    this.ensureInitialized();

    const { marketId = null, ...engineOptions } = options;

    const engineResponses = results.map(result => ({
      source: result.source,
      outcome: result.outcome,
      confidence: result.confidence,
      value: Number.isFinite(result.data?.currentPrice) ? result.data.currentPrice : undefined,
      timestamp: result.timestamp
    }));

    const decision = consensusEngine.evaluate(engineResponses, {
      weightResolver: (source) => this.registry.getWeight(source),
      maxAgeMs: DEFAULT_MAX_STALENESS_MS,
      consensusThreshold: DEFAULT_CONSENSUS_THRESHOLD,
      ...engineOptions
    });

    const rejectedCount = decision.rejected.stale.length + decision.rejected.outliers.length + decision.rejected.invalid.length;
    if (rejectedCount > 0) {
      logger.oracle('Oracle consensus engine rejected responses', {
        marketId,
        stale: decision.rejected.stale.map(r => r.source),
        outliers: decision.rejected.outliers.map(r => r.source),
        invalid: decision.rejected.invalid.map(r => r.source)
      });
    }

    const outcome = decision.finalOutcome
      || (decision.weightByOutcome.yes >= decision.weightByOutcome.no ? 'yes' : 'no');
    const confidence = decision.participants.length > 0
      ? Math.min(decision.totalWeight / decision.participants.length, 1.0)
      : 0;

    const aggregated = {
      outcome,
      confidence,
      sources: decision.participants.length,
      consensusReached: decision.consensusReached,
      data: {
        breakdown: decision.participants.map(p => ({
          source: p.source,
          outcome: p.outcome,
          confidence: p.confidence,
          weight: p.weight
        })),
        yesWeight: decision.weightByOutcome.yes,
        noWeight: decision.weightByOutcome.no,
        totalWeight: decision.totalWeight,
        aggregationMethod: 'weighted',
        consensus: decision
      }
    };

    if (marketId) {
      this.recordConsensusAudit(marketId, decision);
    }

    return aggregated;
  }

  /**
   * Persist an audit log entry for an oracle consensus decision (#219).
   * Best-effort: failures are logged but never interrupt resolution flow.
   */
  recordConsensusAudit(marketId, decision) {
    const action = decision.consensusReached ? 'oracle.consensus_reached' : 'oracle.consensus_rejected';

    Promise.resolve(auditService.oracle(action, {
      target: { type: 'market', id: String(marketId) },
      description: decision.consensusReached
        ? `Oracle consensus reached for market ${marketId}: outcome=${decision.finalOutcome}`
        : `Oracle consensus not reached for market ${marketId}`,
      metadata: {
        marketId,
        finalOutcome: decision.finalOutcome,
        agreementRatio: decision.agreementRatio,
        consensusThreshold: decision.consensusThreshold,
        totalWeight: decision.totalWeight,
        weightByOutcome: decision.weightByOutcome,
        participants: decision.participants,
        rejected: decision.rejected
      }
    })).catch(error => {
      logger.error('Failed to record oracle consensus audit log', { marketId, error: error.message });
    });
  }

  /**
   * Detect anomalies in oracle results
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

    return anomalies;
  }

  /**
   * Get all recorded discrepancies
   */
  getDiscrepancyLog(limit = 100) {
    return this.discrepancyLog.slice(-limit);
  }

  /**
   * Clear discrepancy log
   */
  clearDiscrepancyLog() {
    const count = this.discrepancyLog.length;
    this.discrepancyLog = [];
    logger.oracle('Discrepancy log cleared', { clearedCount: count });
    return count;
  }

  /**
   * Get health status of all providers
   */
  getSourceHealthStatus() {
    this.ensureInitialized();
    return this.registry.getHealthStatus();
  }

  /**
   * Get health status of specific provider
   */
  getProviderHealth(name) {
    this.ensureInitialized();
    return this.registry.getProviderHealth(name);
  }

  /**
   * Get overall health report
   */
  getHealthReport() {
    this.ensureInitialized();
    return this.providerLoader.getHealthReport();
  }

  /**
   * Main resolution method
   * Resolves a market using available providers
   */
  async resolveMarket(market) {
    this.ensureInitialized();
    try {
      if (market.oracleConfig && market.oracleConfig.sources && market.oracleConfig.sources.length > 0) {
        return this.resolveWithFallback(market);
      }

      if (!market.oracleSource || market.oracleSource === 'manual') {
        logger.oracle('Manual resolution required', { marketId: market.marketId });
        return null;
      }

      const provider = this.registry.getProvider(market.oracleSource);
      if (!provider) {
        logger.oracle('Unknown oracle provider', {
          provider: market.oracleSource,
          marketId: market.marketId
        });
        return null;
      }

      const result = await provider.resolveWithRetry(market);

      if (result) {
        logger.oracle('Market resolved by provider', {
          marketId: market.marketId,
          provider: market.oracleSource,
          outcome: result.outcome,
          confidence: result.confidence
        });
        this.cacheResult(market.marketId, result);
      } else {
        this.enqueueFailedRequest(market, {
          sources: this.getResolutionSources(market).candidateSources,
          lastError: `Oracle source ${market.oracleSource} returned no result`
        });
      }

      return result;
    } catch (error) {
      logger.error('Oracle resolution failed:', error);
      return null;
    }
  }

  /**
   * Shutdown oracle service and providers
   */
  async shutdown() {
    logger.oracle('Shutting down OracleService');
    await this.providerLoader.shutdownAll();
    this.resultCache.clear();
    this.initialized = false;
  }
}

module.exports = new OracleService();

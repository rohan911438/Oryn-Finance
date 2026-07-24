/**
 * NewsApiProvider
 * 
 * Oracle provider for sentiment analysis based on news articles.
 * Analyzes sentiment and determines outcomes based on news trends.
 */

const axios = require('axios');
const BaseOracleProvider = require('../BaseOracleProvider');
const logger = require('../../../config/logger');

class NewsApiProvider extends BaseOracleProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'news-api';
    this.apiKey = process.env.NEWS_API_KEY;
    this.baseUrl = process.env.NEWS_API_URL || 'https://newsapi.org/v2';
    this.timeout = config.timeout || 8000;
    this.articleCache = new Map();
    this.cacheDuration = config.cacheDuration || 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Get provider metadata
   */
  getMetadata() {
    return {
      name: this.name,
      version: '1.0.0',
      displayName: 'News API',
      description: 'News sentiment oracle for event and trend resolution',
      weight: this.defaultWeight,
      supportedMarketTypes: this.getSupportedMarketTypes(),
      capabilities: this.getCapabilities(),
      documentation: 'https://newsapi.org/'
    };
  }

  /**
   * Get supported market types
   */
  getSupportedMarketTypes() {
    return ['news', 'generic'];
  }

  /**
   * Get provider capabilities
   */
  getCapabilities() {
    return {
      supportsMultipleConditions: true,
      supportsPriceData: false,
      supportsHistoricalData: true,
      requiresApiKey: true,
      supportedConditions: ['positive', 'negative', 'neutral'],
      sentimentThresholds: {
        positive: 0.1,
        negative: -0.1,
        neutral: 0.1
      }
    };
  }

  /**
   * Validate market configuration for News API
   */
  validateConfig(market) {
    const baseValidation = super.validateConfig(market);
    const errors = baseValidation.errors;
    const config = market.oracleConfig || {};

    if (!config.keywords || !Array.isArray(config.keywords) || config.keywords.length === 0) {
      errors.push('Missing or invalid keywords in oracleConfig');
    }

    if (!['positive', 'negative', 'neutral'].includes(config.sentiment)) {
      errors.push(`Invalid sentiment: ${config.sentiment}. Must be 'positive', 'negative', or 'neutral'`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Resolve market using sentiment analysis
   */
  async resolve(market) {
    try {
      const config = market.oracleConfig || {};
      const { keywords, sentiment, sources = [] } = config;

      // Validate configuration
      const validation = this.validateConfig(market);
      if (!validation.valid) {
        logger.oracle('Invalid News API config', {
          marketId: market.marketId,
          errors: validation.errors
        });
        throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
      }

      // Fetch and analyze news articles
      const articles = await this.getNewsArticles(keywords, sources);

      if (!articles || articles.length === 0) {
        logger.oracle('No news articles found', {
          keywords,
          marketId: market.marketId
        });
        throw new Error('No articles found for specified keywords');
      }

      // Analyze sentiment
      const sentimentScore = this.analyzeSentiment(articles);

      // Determine outcome based on sentiment threshold
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
          throw new Error(`Unknown sentiment: ${sentiment}`);
      }

      const confidence = Math.min(Math.abs(sentimentScore) + 0.5, 1.0);

      logger.oracle('News API oracle resolved', {
        marketId: market.marketId,
        articlesAnalyzed: articles.length,
        sentimentScore: sentimentScore.toFixed(3),
        keywords,
        outcome,
        confidence: confidence.toFixed(2)
      });

      return {
        outcome,
        confidence,
        data: {
          articlesAnalyzed: articles.length,
          sentimentScore: sentimentScore.toFixed(3),
          keywords,
          sentiment,
          sources: articles.map(a => a.source.name),
          source: 'News API',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('News API oracle resolution failed', {
        error: error.message,
        marketId: market.marketId
      });
      throw error;
    }
  }

  /**
   * Fetch news articles from News API
   */
  async getNewsArticles(keywords, sources = []) {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(keywords, sources);
      const cached = this.getCache(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await axios.get(`${this.baseUrl}/everything`, {
        params: {
          q: keywords.join(' AND '),
          sources: sources.length > 0 ? sources.join(',') : undefined,
          sortBy: 'relevancy',
          language: 'en',
          pageSize: 20
        },
        headers: {
          'X-API-Key': this.apiKey
        },
        timeout: this.timeout
      });

      const articles = response.data.articles || [];
      this.setCache(cacheKey, articles);

      return articles;
    } catch (error) {
      logger.error('Failed to fetch news articles', {
        error: error.message,
        keywords
      });
      throw error;
    }
  }

  /**
   * Analyze sentiment from articles
   */
  analyzeSentiment(articles) {
    const positiveWords = [
      'good', 'great', 'excellent', 'positive', 'up', 'rise', 'increase',
      'success', 'successful', 'gain', 'profit', 'growth', 'bullish',
      'outperform', 'beat', 'surge', 'rally', 'boom', 'thriving'
    ];

    const negativeWords = [
      'bad', 'terrible', 'negative', 'down', 'fall', 'decrease',
      'failure', 'loss', 'decline', 'bearish', 'underperform',
      'miss', 'plunge', 'crash', 'recession', 'crisis', 'slump'
    ];

    let sentimentScore = 0;
    let wordCount = 0;

    articles.forEach(article => {
      const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();

      // Count positive words
      positiveWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = text.match(regex) || [];
        sentimentScore += matches.length;
        wordCount += matches.length;
      });

      // Count negative words
      negativeWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = text.match(regex) || [];
        sentimentScore -= matches.length;
        wordCount += matches.length;
      });
    });

    // Normalize sentiment score to -1 to 1 range
    return wordCount > 0 ? sentimentScore / wordCount : 0;
  }

  /**
   * Get sentiment trends over time
   */
  async getSentimentTrend(keywords, days = 7) {
    try {
      const trends = [];
      
      for (let i = 0; i < days; i++) {
        const articles = await this.getNewsArticles(keywords);
        const sentiment = this.analyzeSentiment(articles);
        
        trends.push({
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
          sentiment
        });
      }

      return trends.reverse();
    } catch (error) {
      logger.error('Failed to fetch sentiment trend', {
        error: error.message,
        keywords
      });
      throw error;
    }
  }

  /**
   * Get cache key
   */
  getCacheKey(keywords, sources) {
    return `news_${keywords.join('_')}_${sources.join('_')}`;
  }

  /**
   * Get cached articles
   */
  getCache(key) {
    const cached = this.articleCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cached articles
   */
  setCache(key, data) {
    this.articleCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Reset provider state
   */
  resetHealth() {
    super.resetHealth();
    this.articleCache.clear();
  }
}

module.exports = NewsApiProvider;

const axios = require('axios');
const logger = require('../config/logger');
const { Market } = require('../models');

class OracleService {
  constructor() {
    this.resolvers = {
      coingecko: this.resolveCrypto.bind(this),
      'sports-api': this.resolveSports.bind(this),
      'news-api': this.resolveNews.bind(this)
    };
  }

  async resolveMarket(market) {
    try {
      if (!market.oracleSource || market.oracleSource === 'manual') {
        return null; // Requires manual resolution
      }

      const resolver = this.resolvers[market.oracleSource];
      if (!resolver) {
        logger.oracle('Unknown oracle source', { source: market.oracleSource });
        return null;
      }

      const result = await resolver(market);
      
      if (result) {
        logger.oracle('Market resolved by oracle', {
          marketId: market.marketId,
          source: market.oracleSource,
          outcome: result.outcome,
          confidence: result.confidence
        });
      }

      return result;
    } catch (error) {
      logger.error('Oracle resolution failed:', error);
      throw error;
    }
  }

  async resolveCrypto(market) {
    try {
      const config = market.oracleConfig || {};
      const { symbol, targetPrice, condition } = config;

      if (!symbol || !targetPrice) {
        logger.oracle('Invalid crypto oracle config', { config });
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
        }
      });

      const currentPrice = response.data[symbol.toLowerCase()]?.usd;
      
      if (!currentPrice) {
        logger.oracle('Failed to get crypto price', { symbol });
        return null;
      }

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
          logger.oracle('Unknown crypto condition', { condition });
          return null;
      }

      return {
        outcome,
        confidence: 1.0, // High confidence for price data
        data: {
          currentPrice,
          targetPrice,
          symbol,
          condition,
          source: 'CoinGecko'
        }
      };
    } catch (error) {
      logger.error('Crypto oracle resolution failed:', error);
      return null;
    }
  }

  async resolveSports(market) {
    try {
      const config = market.oracleConfig || {};
      const { gameId, team, condition } = config;

      if (!gameId) {
        logger.oracle('Invalid sports oracle config', { config });
        return null;
      }

      // This would integrate with a sports API service
      // For demonstration, using a mock response
      const gameResult = await this.getSportsResult(gameId);
      
      if (!gameResult) {
        logger.oracle('Sports game not finished', { gameId });
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
          logger.oracle('Unknown sports condition', { condition });
          return null;
      }

      return {
        outcome,
        confidence: 0.95, // High confidence for sports results
        data: {
          gameResult,
          team,
          condition,
          source: 'Sports API'
        }
      };
    } catch (error) {
      logger.error('Sports oracle resolution failed:', error);
      return null;
    }
  }

  async resolveNews(market) {
    try {
      const config = market.oracleConfig || {};
      const { keywords, sentiment, sources } = config;

      if (!keywords || !keywords.length) {
        logger.oracle('Invalid news oracle config', { config });
        return null;
      }

      // Search for news articles
      const articles = await this.getNewsArticles(keywords, sources);
      
      if (!articles || articles.length === 0) {
        logger.oracle('No news articles found', { keywords });
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
          logger.oracle('Unknown news sentiment', { sentiment });
          return null;
      }

      return {
        outcome,
        confidence: 0.7, // Lower confidence for sentiment analysis
        data: {
          articlesAnalyzed: articles.length,
          sentimentScore,
          keywords,
          source: 'News API'
        }
      };
    } catch (error) {
      logger.error('News oracle resolution failed:', error);
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

  // Chainlink oracle integration (placeholder)
  async resolveChainlink(market) {
    // This would integrate with Chainlink oracles for decentralized data feeds
    // Implementation depends on specific Chainlink integration requirements
    logger.oracle('Chainlink oracle not yet implemented');
    return null;
  }
}

module.exports = new OracleService();
/**
 * CoinGeckoProvider
 * 
 * Oracle provider for cryptocurrency price data from CoinGecko API.
 * Supports above/below/equals conditions for crypto assets.
 */

const axios = require('axios');
const BaseOracleProvider = require('../BaseOracleProvider');
const logger = require('../../../config/logger');

class CoinGeckoProvider extends BaseOracleProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'coingecko';
    this.apiKey = process.env.COINGECKO_API_KEY;
    this.baseUrl = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
    this.priceHistory = new Map();
    this.timeout = config.timeout || 5000;
  }

  /**
   * Get provider metadata
   */
  getMetadata() {
    return {
      name: this.name,
      version: '1.0.0',
      displayName: 'CoinGecko',
      description: 'Cryptocurrency price oracle from CoinGecko API',
      weight: this.defaultWeight,
      supportedMarketTypes: this.getSupportedMarketTypes(),
      capabilities: this.getCapabilities(),
      documentation: 'https://www.coingecko.com/en/api/documentation'
    };
  }

  /**
   * Get supported market types
   */
  getSupportedMarketTypes() {
    return ['crypto', 'generic'];
  }

  /**
   * Get provider capabilities
   */
  getCapabilities() {
    return {
      supportsMultipleConditions: true,
      supportsPriceData: true,
      supportsHistoricalData: false,
      requiresApiKey: false, // CoinGecko API key is optional
      supportedConditions: ['above', 'below', 'equals'],
      supportedAssets: 'Any asset available on CoinGecko'
    };
  }

  /**
   * Validate market configuration for CoinGecko
   */
  validateConfig(market) {
    const baseValidation = super.validateConfig(market);
    const errors = baseValidation.errors;
    const config = market.oracleConfig || {};

    if (!config.symbol) {
      errors.push('Missing symbol in oracleConfig');
    }

    if (!config.targetPrice && config.targetPrice !== 0) {
      errors.push('Missing targetPrice in oracleConfig');
    }

    if (!['above', 'below', 'equals'].includes(config.condition)) {
      errors.push(`Invalid condition: ${config.condition}. Must be 'above', 'below', or 'equals'`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Resolve market using CoinGecko price data
   */
  async resolve(market) {
    try {
      const config = market.oracleConfig || {};
      const { symbol, targetPrice, condition } = config;

      // Validate configuration
      const validation = this.validateConfig(market);
      if (!validation.valid) {
        logger.oracle('Invalid CoinGecko config', {
          marketId: market.marketId,
          errors: validation.errors
        });
        throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
      }

      // Get current price from CoinGecko
      const currentPrice = await this.fetchPrice(symbol);
      
      if (currentPrice === null) {
        logger.oracle('Failed to fetch cryptocurrency price', {
          symbol,
          marketId: market.marketId
        });
        throw new Error(`Failed to fetch price for ${symbol}`);
      }

      // Track price history for anomaly detection
      this.trackPriceHistory(symbol, currentPrice);

      // Determine outcome based on condition
      let outcome;
      switch (condition) {
        case 'above':
          outcome = currentPrice > targetPrice ? 'yes' : 'no';
          break;
        case 'below':
          outcome = currentPrice < targetPrice ? 'yes' : 'no';
          break;
        case 'equals': {
          // Allow 1% tolerance for price equality
          const tolerance = targetPrice * 0.01;
          outcome = Math.abs(currentPrice - targetPrice) <= tolerance ? 'yes' : 'no';
          break;
        }
        default:
          throw new Error(`Unknown condition: ${condition}`);
      }

      const priceDeviation = Math.abs((currentPrice - targetPrice) / targetPrice * 100);

      logger.oracle('CoinGecko oracle resolved', {
        marketId: market.marketId,
        symbol,
        currentPrice,
        targetPrice,
        condition,
        outcome,
        deviation: priceDeviation.toFixed(2) + '%'
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
          priceDeviation: priceDeviation.toFixed(2) + '%',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('CoinGecko oracle resolution failed', {
        error: error.message,
        marketId: market.marketId
      });
      throw error;
    }
  }

  /**
   * Fetch current price for a symbol from CoinGecko
   */
  async fetchPrice(symbol) {
    try {
      const response = await axios.get(`${this.baseUrl}/simple/price`, {
        params: {
          ids: symbol.toLowerCase(),
          vs_currencies: 'usd'
        },
        headers: this.apiKey ? { 'X-CG-Demo-API-Key': this.apiKey } : {},
        timeout: this.timeout
      });

      const price = response.data[symbol.toLowerCase()]?.usd;
      return price || null;
    } catch (error) {
      logger.error('CoinGecko API error', {
        symbol,
        error: error.message
      });
      throw error;
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

  /**
   * Detect price drift
   */
  detectPriceDrift(symbol, currentPrice, threshold = 0.25) {
    const history = this.getPriceHistory(symbol);
    if (history.length < 2) {
      return null;
    }

    const lastPrice = history[history.length - 2].price;
    const percentChange = Math.abs((currentPrice - lastPrice) / lastPrice);

    if (percentChange > threshold) {
      return {
        lastPrice,
        currentPrice,
        percentChange: (percentChange * 100).toFixed(2) + '%',
        severity: 'high'
      };
    }

    return null;
  }

  /**
   * Get historical price data
   */
  async getHistoricalPrice(symbol, days = 7) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/coins/${symbol.toLowerCase()}/market_chart`,
        {
          params: {
            vs_currency: 'usd',
            days
          },
          timeout: this.timeout
        }
      );

      return response.data.prices || [];
    } catch (error) {
      logger.error('Failed to fetch historical price', {
        symbol,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Reset provider state
   */
  resetHealth() {
    super.resetHealth();
    this.priceHistory.clear();
  }
}

module.exports = CoinGeckoProvider;

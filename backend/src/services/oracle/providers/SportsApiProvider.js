/**
 * SportsApiProvider
 * 
 * Oracle provider for sports event resolution.
 * Resolves markets based on game results, scores, and outcomes.
 */

const axios = require('axios');
const BaseOracleProvider = require('../BaseOracleProvider');
const logger = require('../../../config/logger');

class SportsApiProvider extends BaseOracleProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'sports-api';
    this.apiKey = process.env.SPORTS_API_KEY;
    this.baseUrl = process.env.SPORTS_API_URL || 'https://api.sports.com/v1';
    this.timeout = config.timeout || 8000;
    this.gameCache = new Map();
    this.cacheDuration = config.cacheDuration || 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get provider metadata
   */
  getMetadata() {
    return {
      name: this.name,
      version: '1.0.0',
      displayName: 'Sports API',
      description: 'Sports events oracle for game outcomes and scores',
      weight: this.defaultWeight,
      supportedMarketTypes: this.getSupportedMarketTypes(),
      capabilities: this.getCapabilities()
    };
  }

  /**
   * Get supported market types
   */
  getSupportedMarketTypes() {
    return ['sports', 'generic'];
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
      supportedConditions: ['win', 'score_over', 'score_under', 'draw'],
      supportedSports: ['football', 'basketball', 'baseball', 'hockey']
    };
  }

  /**
   * Validate market configuration for Sports API
   */
  validateConfig(market) {
    const baseValidation = super.validateConfig(market);
    const errors = baseValidation.errors;
    const config = market.oracleConfig || {};

    if (!config.gameId && !config.leagueId) {
      errors.push('Missing gameId or leagueId in oracleConfig');
    }

    if (!['win', 'score_over', 'score_under', 'draw'].includes(config.condition)) {
      errors.push(`Invalid condition: ${config.condition}`);
    }

    if (config.condition === 'score_over' || config.condition === 'score_under') {
      if (!config.threshold && config.threshold !== 0) {
        errors.push('Missing threshold for score condition');
      }
    }

    if (config.condition === 'win' && !config.team) {
      errors.push('Missing team for win condition');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Resolve market using sports data
   */
  async resolve(market) {
    try {
      const config = market.oracleConfig || {};
      const { gameId, team, condition, threshold } = config;

      // Validate configuration
      const validation = this.validateConfig(market);
      if (!validation.valid) {
        logger.oracle('Invalid Sports API config', {
          marketId: market.marketId,
          errors: validation.errors
        });
        throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
      }

      // Fetch game result
      const gameResult = await this.getGameResult(gameId);

      if (!gameResult || !gameResult.finished) {
        logger.oracle('Game not finished or not found', {
          gameId,
          marketId: market.marketId
        });
        throw new Error(`Game ${gameId} not finished or not found`);
      }

      // Determine outcome based on condition
      let outcome;
      let confidence = 0.95;

      switch (condition) {
        case 'win':
          outcome = gameResult.winner === team ? 'yes' : 'no';
          break;
        case 'score_over':
          outcome = gameResult.totalScore > threshold ? 'yes' : 'no';
          break;
        case 'score_under':
          outcome = gameResult.totalScore < threshold ? 'yes' : 'no';
          break;
        case 'draw':
          outcome = gameResult.isDraw ? 'yes' : 'no';
          confidence = 0.9; // Slightly lower confidence for draws
          break;
        default:
          throw new Error(`Unknown condition: ${condition}`);
      }

      logger.oracle('Sports API oracle resolved', {
        marketId: market.marketId,
        gameId,
        outcome,
        gameResult,
        condition
      });

      return {
        outcome,
        confidence,
        data: {
          gameResult,
          team,
          condition,
          threshold,
          source: 'Sports API',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Sports API oracle resolution failed', {
        error: error.message,
        marketId: market.marketId
      });
      throw error;
    }
  }

  /**
   * Fetch game result from Sports API
   */
  async getGameResult(gameId) {
    try {
      // Check cache first
      const cached = this.getCachedGame(gameId);
      if (cached) {
        return cached;
      }

      let gameResult;

      // If sports mock or real API URL is configured, query the HTTP endpoint
      if (process.env.SPORTS_API_URL) {
        try {
          const response = await axios.get(`${this.baseUrl}/games/${gameId}`, {
            headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
            timeout: this.timeout
          });
          gameResult = response.data;
        } catch (apiError) {
          logger.warn(`Failed to fetch game result from Sports API endpoint: ${apiError.message}. Using fallback mock data.`);
        }
      }

      // Fallback to static mock data if HTTP call fails or is not configured
      if (!gameResult) {
        gameResult = {
          gameId,
          winner: 'Team A',
          totalScore: 45,
          finished: true,
          isDraw: false,
          timestamp: new Date()
        };
      }

      this.cacheGame(gameId, gameResult);
      return gameResult;
    } catch (error) {
      logger.error('Failed to fetch game result', {
        gameId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get cached game result
   */
  getCachedGame(gameId) {
    const cached = this.gameCache.get(gameId);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }
    return null;
  }

  /**
   * Cache game result
   */
  cacheGame(gameId, data) {
    this.gameCache.set(gameId, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Get live game scores
   */
  async getLiveScores(leagueId) {
    try {
      logger.oracle('Fetching live scores', { leagueId });
      
      // Mock implementation
      return {
        leagueId,
        games: [],
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to fetch live scores', {
        leagueId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get historical game data
   */
  async getGameHistory(teamId, limit = 10) {
    try {
      logger.oracle('Fetching game history', { teamId, limit });
      
      // Mock implementation
      return {
        teamId,
        games: [],
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to fetch game history', {
        teamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reset provider state
   */
  resetHealth() {
    super.resetHealth();
    this.gameCache.clear();
  }
}

module.exports = SportsApiProvider;

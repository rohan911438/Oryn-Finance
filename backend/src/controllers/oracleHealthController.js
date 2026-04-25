const oracleService = require('../services/oracleService');
const logger = require('../config/logger');

class OracleHealthController {
  static async getOracleHealth(req, res) {
    const healthMap = oracleService.getSourceHealthStatus();

    if (healthMap == null) {
      logger.warn('Oracle service unavailable — getSourceHealthStatus returned null/undefined');
      return res.status(503).json({ success: false, message: 'Oracle service unavailable' });
    }

    const sources = Object.entries(healthMap).map(([sourceName, health]) => ({
      name: sourceName,
      successCount: health.successCount,
      failureCount: health.failureCount,
      failureRate: health.failureRate,
      isHealthy: health.failureRate <= 0.30,
      lastFailure: health.lastFailure || null
    }));

    logger.info('Oracle health status retrieved', { sourceCount: sources.length });

    return res.json({
      success: true,
      data: {
        sources
      }
    });
  }
}

module.exports = OracleHealthController;

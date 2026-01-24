const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const stellarService = require('../services/stellarService');
const mongoose = require('mongoose');

// Health check endpoint
router.get('/', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check database connection (optional)
    let dbStatus = 'disconnected';
    try {
      dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    } catch (error) {
      dbStatus = 'unavailable';
    }
    
    // Check Stellar network
    const stellarStatus = await stellarService.getNetworkStatus();
    
    // Check Soroban (if available)
    let sorobanStatus = { isConnected: false };
    try {
      const sorobanService = require('../services/sorobanService');
      sorobanStatus = await sorobanService.getHealth();
    } catch (error) {
      sorobanStatus = { isConnected: false, error: 'Service unavailable' };
    }
    
    const responseTime = Date.now() - startTime;
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      services: {
        database: {
          status: dbStatus,
          host: process.env.MONGODB_URI ? 'configured' : 'not configured'
        },
        stellar: {
          status: stellarStatus.isConnected ? 'connected' : 'disconnected',
          network: stellarStatus.network,
          latestLedger: stellarStatus.latestLedger
        },
        soroban: {
          status: sorobanStatus.status || 'unknown',
          latestLedger: sorobanStatus.latestLedger
        }
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024)
        },
        cpu: process.cpuUsage()
      }
    };

    // Determine overall health status
    if (dbStatus !== 'connected' || !stellarStatus.isConnected) {
      healthData.status = 'degraded';
    }

    const httpStatus = healthData.status === 'healthy' ? 200 : 503;
    
    logger.info('Health check requested', {
      status: healthData.status,
      responseTime,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(httpStatus).json({
      success: true,
      data: healthData
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: {
        message: 'Health check failed',
        details: error.message
      },
      responseTime: `${Date.now() - startTime}ms`
    });
  }
}));

// Liveness probe (for Kubernetes)
router.get('/live', asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString()
  });
}));

// Readiness probe (for Kubernetes)
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    // Check critical dependencies
    const dbReady = mongoose.connection.readyState === 1;
    const stellarReady = (await stellarService.getNetworkStatus()).isConnected;
    
    if (dbReady && stellarReady) {
      res.status(200).json({
        success: true,
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('Critical services not ready');
    }
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}));

// Metrics endpoint (basic metrics)
router.get('/metrics', asyncHandler(async (req, res) => {
  const { Market, User, Trade } = require('../models');
  
  try {
    const [
      totalMarkets,
      activeMarkets,
      totalUsers,
      activeUsers,
      totalTrades,
      totalVolume
    ] = await Promise.all([
      Market.countDocuments(),
      Market.countDocuments({ status: 'active' }),
      User.countDocuments(),
      User.countDocuments({ 
        lastActiveAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
      }),
      Trade.countDocuments({ status: 'confirmed' }),
      Trade.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$totalCost' } } }
      ])
    ]);

    const metrics = {
      platform: {
        totalMarkets,
        activeMarkets,
        totalUsers,
        activeUsers24h: activeUsers,
        totalTrades,
        totalVolume: totalVolume[0]?.total || 0
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve metrics'
    });
  }
}));

// Contract integration test endpoint
router.get('/contracts', asyncHandler(async (req, res) => {
  try {
    const sorobanService = require('../services/sorobanService');
    
    // Test basic connectivity
    const healthCheck = await sorobanService.getHealth();
    
    // Test contract integration
    const integrationResults = await sorobanService.testContractIntegration();
    
    // Test individual contract connectivity
    const contractTests = await Promise.all([
      sorobanService.pingContract('MARKET_FACTORY'),
      sorobanService.pingContract('AMM_POOL'),
      sorobanService.pingContract('ORACLE_RESOLVER'),
      sorobanService.pingContract('GOVERNANCE'),
      sorobanService.pingContract('REPUTATION')
    ]);

    res.json({
      success: true,
      data: {
        sorobanHealth: healthCheck,
        contractIntegration: integrationResults,
        contractConnectivity: contractTests,
        summary: {
          totalContracts: Object.keys(sorobanService.contracts).length,
          reachableContracts: contractTests.filter(test => test.isReachable).length,
          workingContracts: [
            integrationResults.marketFactory,
            integrationResults.ammPool, 
            integrationResults.oracleResolver
          ].filter(Boolean).length
        }
      }
    });
  } catch (error) {
    logger.error('Contract integration test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Contract integration test failed',
      error: error.message
    });
  }
}));

// Test specific contract endpoint
router.get('/contracts/:contractName/ping', asyncHandler(async (req, res) => {
  try {
    const { contractName } = req.params;
    const sorobanService = require('../services/sorobanService');
    
    const result = await sorobanService.pingContract(contractName.toUpperCase());
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`Failed to ping contract ${req.params.contractName}:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to ping contract ${req.params.contractName}`,
      error: error.message
    });
  }
}));

module.exports = router;
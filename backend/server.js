const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser'); // Issue #22: parse httpOnly cookies
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const connectDB = require('./src/config/database');
const logger = require('./src/config/logger');
const { validateEnv } = require('./src/config/envValidator');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const { detectAbuse } = require('./src/middleware/abuseDetection');
const { globalLimiter, sensitiveLimiter, tradeLimiter, burstLimiter } = require('./src/middleware/rateLimiter'); // Issue #198

// Import routes
const authRoutes = require('./src/routes/auth');       // Issue #22: httpOnly cookie auth
const healthRoutes = require('./src/routes/health');
const marketRoutes = require('./src/routes/markets');
const tradeRoutes = require('./src/routes/trades');
const transactionRoutes = require('./src/routes/transactions');
const userRoutes = require('./src/routes/users');
const leaderboardRoutes = require('./src/routes/leaderboard');
const analyticsRoutes = require('./src/routes/analytics');
const adminRoutes = require('./src/routes/admin');
const oracleRoutes = require('./src/routes/oracle');
const liquidityRoutes = require('./src/routes/liquidity');
const pushNotificationRoutes = require('./src/routes/pushNotifications');
const marketDepthRoutes = require('./src/routes/marketDepth');
const crossChainRoutes = require('./src/routes/crossChain');
const insuranceRoutes = require('./src/routes/insurance');
const riskAnalyticsRoutes = require('./src/routes/riskAnalytics');
const sentimentRoutes = require('./src/routes/sentiment');
const taxReportsRoutes = require('./src/routes/taxReports');
const treasuryRoutes = require('./src/routes/treasury');
const yieldRoutes = require('./src/routes/yield');
const volatilityRoutes = require('./src/routes/volatility');
const geoFailoverRoutes = require('./src/routes/geoFailover');
const explorerRoutes = require('./src/routes/explorer');                   // Issue #83
const contractVersionRoutes = require('./src/routes/contractVersions');    // Issue #150
const contractDependencyRoutes = require('./src/routes/contractDependencies'); // Issue #124
const liquidityRebalancingRoutes = require('./src/routes/liquidityRebalancing'); // Issue #163
const governanceTimelockRoutes = require('./src/routes/governanceTimelock'); // Issue #165
const timezonesRoutes = require('./src/routes/timezones'); // Issue #166
const whaleActivityRoutes = require('./src/routes/whaleActivity'); // Issue #169
const appealsRoutes = require('./src/routes/appeals'); // Issue #167
const mobileTradingRoutes = require('./src/routes/mobileTrading'); // Issue #168
const liquidityPositionRoutes = require('./src/routes/liquidityPositions');
const governanceDelegationRoutes = require('./src/routes/governanceDelegation');
const correlationRoutes = require('./src/routes/correlation');
const marketAlertsRoutes = require('./src/routes/marketAlerts');
const messagesRoutes = require('./src/routes/messages');
const reportsRoutes = require('./src/routes/reports');
const riskAssessmentRoutes = require('./src/routes/riskAssessment'); // Issue #187
const auditRoutes = require('./src/routes/audit'); // Issue #194
const rateLimitMetricsRoutes = require('./src/routes/rateLimitMetrics'); // Issue #198
const stateSnapshotRoutes = require('./src/routes/stateSnapshots'); // Issue #227
const indexerRoutes = require('./src/routes/indexer'); // Issue #244 - Deterministic Market State Indexer
const emergencyRoutes = require('./src/routes/emergency'); // Issue #245 - Emergency Control Plane


// Import services
const backgroundJobs = require('./src/services/backgroundJobs');
const websocketHandler = require('./src/services/websocketHandler');
const contractEventIndexer = require('./src/services/contractEventIndexer');
const eventReconciliationService = require('./src/services/eventReconciliationService');
const deterministicMarketStateIndexer = require('./src/services/deterministicMarketStateIndexer');
const emergencyControlService = require('./src/services/emergencyControlService');
const transactionRetryQueue = require('./src/services/transactionRetryQueue'); // Issue #23
const pushNotificationService = require('./src/services/pushNotificationService');
const encryptionService = require('./src/services/encryptionService');
const redisAdapter = require('./src/services/redisAdapter');
const tradeBatcher = require('./src/services/tradeBatcher');
const geoFailoverService = require('./src/services/geoFailoverService');

class OrynBackendServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      },
      perMessageDeflate: {
        threshold: 1024,
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10
      },
      maxHttpBufferSize: 1e6
    });
    this.port = process.env.PORT || 5001;
  }

  async initialize() {
    try {
      // Validate required environment variables before anything else
      validateEnv();

      // Initialize push notification VAPID keys
      pushNotificationService.initVapid();

      // Initialize encryption service
      encryptionService.initialize();

      // Connect to database (optional for now)
      try {
        await connectDB();
        logger.info('Database connected successfully');
      } catch (dbError) {
        logger.warn('Database connection skipped:', dbError.message);
        logger.warn('Server will run without database functionality');
      }

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup WebSocket handlers
      this.setupWebSocket();

      // Setup error handling
      this.setupErrorHandling();

      // Start background jobs
      this.startBackgroundJobs();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Initialize Redis adapter for scaling
      try {
        await redisAdapter.initialize();
        logger.info('Redis adapter initialized for WebSocket scaling');
      } catch (error) {
        logger.warn('Redis adapter initialization failed:', error.message);
        logger.warn('WebSocket scaling will be disabled');
      }

      logger.info('Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:3000',
        'https://oryn.finance'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Layer 1: abuse detection — blocks IPs exhibiting malicious request patterns
    this.app.use('/api/', detectAbuse);

    // Layer 2: burst limiter — prevents sudden traffic spikes (10-second window, Issue #198)
    this.app.use('/api/', burstLimiter);

    // Layer 3: global rate limit — sustained IP-based cap per 15-minute window (Issue #198)
    this.app.use('/api/', globalLimiter);

    // Trade limiter — per-user key gives authenticated users isolated headroom (Issue #198)
    this.app.use('/api/trades', tradeLimiter);

    // Body parser middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Cookie parser — required for httpOnly JWT cookie support (Issue #22)
    this.app.use(cookieParser());

    // Logging middleware
    if (process.env.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined', {
        stream: { write: message => logger.info(message.trim()) }
      }));
    }

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.id = Math.random().toString(36).substring(2, 15);
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    // Request timing middleware
    this.app.use((req, res, next) => {
      req.startTime = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
      });
      next();
    });
  }

  setupRoutes() {
    // Sensitive limiter — tighter window on auth endpoints to slow brute-force (Issue #198)
    this.app.use('/api/auth', sensitiveLimiter);

    // Auth routes — refresh token, logout (Issue #22)
    this.app.use('/api/auth', authRoutes);

    // Health check (no authentication required)
    this.app.use('/api/health', healthRoutes);

    // Public routes
    this.app.use('/api/markets', marketRoutes);
    this.app.use('/api/oracle', oracleRoutes);
    this.app.use('/api/leaderboard', leaderboardRoutes);
    this.app.use('/api/analytics', analyticsRoutes);
    this.app.use('/api/liquidity', liquidityRoutes);
    this.app.use('/api/market-depth', marketDepthRoutes);
    this.app.use('/api/cross-chain', crossChainRoutes);
    this.app.use('/api/insurance', insuranceRoutes);
    this.app.use('/api/risk', riskAnalyticsRoutes);
    this.app.use('/api/sentiment', sentimentRoutes);
    this.app.use('/api/treasury', treasuryRoutes);
    this.app.use('/api/volatility', volatilityRoutes);
    this.app.use('/api/geo-failover', geoFailoverRoutes);
    this.app.use('/api/reports', reportsRoutes);
    this.app.use('/api/yield', yieldRoutes);
    this.app.use('/api/liquidity', liquidityRebalancingRoutes); // Issue #163 (rebalancing sub-route)
    this.app.use('/api/governance/timelock', governanceTimelockRoutes); // Issue #165
    this.app.use('/api/governance/delegate', governanceDelegationRoutes);
    this.app.use('/api/correlation', correlationRoutes);
    this.app.use('/api/market-alerts', marketAlertsRoutes);
    this.app.use('/api/risk-assessment', riskAssessmentRoutes); // Issue #187
    this.app.use('/api/audit', auditRoutes); // Issue #194 — centralized audit logging
    this.app.use('/api/admin/rate-limit-metrics', rateLimitMetricsRoutes); // Issue #198
    this.app.use('/api/snapshots', stateSnapshotRoutes); // Issue #227 — protocol state snapshots

    // Indexer routes (Issue #244 - Deterministic Market State Indexer)
    this.app.use('/api/indexer', indexerRoutes);

    // Emergency Control Plane routes (Issue #245)
    this.app.use('/api/emergency', emergencyRoutes);

    // Transaction routes (mixed auth - some endpoints require auth, others don't)
    this.app.use('/api/transactions', transactionRoutes);

    // Push notification routes
    this.app.use('/api/push', pushNotificationRoutes);

    // Explorer deep-linking routes (Issue #83)
    this.app.use('/api/explorer', explorerRoutes);

    // Contract version management routes (Issue #150)
    this.app.use('/api/contracts/versions', contractVersionRoutes);

    // Contract dependency mapping routes (Issue #124)
    this.app.use('/api/contracts/dependencies', contractDependencyRoutes);

    // Multi-Timezone Event Scheduling routes (Issue #166)
    this.app.use('/api/timezones', timezonesRoutes);

    // Whale Activity Monitoring routes (Issue #169)
    this.app.use('/api/whale-activity', whaleActivityRoutes);

    // Market Resolution Appeals routes (Issue #167)
    this.app.use('/api/appeals', appealsRoutes);

    // Mobile Trading Mode routes (Issue #168)
    this.app.use('/api/mobile-trading', mobileTradingRoutes);

    // Liquidity Position Management routes
    this.app.use('/api/liquidity-positions', liquidityPositionRoutes);

    // User-to-user messages
    this.app.use('/api/messages', messagesRoutes);

    // Protected routes
    this.app.use('/api/trades', tradeRoutes);
    this.app.use('/api/users', userRoutes);
    this.app.use('/api/admin', adminRoutes);
    this.app.use('/api/tax', taxReportsRoutes);

    // API documentation
    if (process.env.NODE_ENV !== 'production') {
      const swaggerUi = require('swagger-ui-express');
      const swaggerSpec = require('./src/config/swagger');
      this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    }

    // Root route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Oryn Finance Backend API',
        version: '1.0.0',
        status: 'running',
        docs: process.env.NODE_ENV !== 'production' ? '/api-docs' : undefined
      });
    });
  }

  setupWebSocket() {
    websocketHandler.initialize(this.io);

    // Issue #23: inject Socket.io into the retry queue so it can notify users
    transactionRetryQueue.injectIo(this.io);

    logger.info('WebSocket handlers initialized');
  }

  setupErrorHandling() {
    this.app.use(notFound);
    this.app.use(errorHandler);

    // Unhandled promise rejection
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Uncaught exception
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  startBackgroundJobs() {
    if (process.env.NODE_ENV !== 'test') {
      // Start traditional background jobs
      backgroundJobs.start();
      logger.info('Background jobs started');

      // Start contract event indexer
      try {
        contractEventIndexer.start();
        logger.info('Contract event indexer started');
      } catch (error) {
        logger.warn('Failed to start contract event indexer:', error.message);
        logger.warn('Contract event indexing will be disabled');
      }

      // Start deterministic market state indexer (Issue #244)
      try {
        deterministicMarketStateIndexer.start();
        logger.info('Deterministic market state indexer started');
      } catch (error) {
        logger.warn('Failed to start deterministic market state indexer:', error.message);
        logger.warn('Deterministic market state indexing will be disabled');
      }

      // Start event reconciliation service
      try {
        eventReconciliationService.start();
        logger.info('Event reconciliation service started');
      } catch (error) {
        logger.warn('Failed to start event reconciliation service:', error.message);
        logger.warn('Event reconciliation will be disabled');
      }

      // Initialize emergency control service (Issue #245)
      try {
        emergencyControlService.initialize();
        logger.info('Emergency control service initialized');
      } catch (error) {
        logger.warn('Failed to initialize emergency control service:', error.message);
        logger.warn('Emergency control will be disabled');
      }

      // Start geo-failover health monitoring
      try {
        geoFailoverService.start();
        logger.info('Geo-failover health monitoring started');
      } catch (error) {
        logger.warn('Failed to start geo-failover monitoring:', error.message);
      }
    }
  }

  setupGracefulShutdown() {
    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      this.server.close(() => {
        logger.info('HTTP server closed');

        // Close database connection
        require('mongoose').connection.close(async () => {
          logger.info('MongoDB connection closed');

          // Stop background jobs
          backgroundJobs.stop();
          logger.info('Background jobs stopped');

          // Stop contract event indexer
          try {
            contractEventIndexer.stop();
            logger.info('Contract event indexer stopped');
          } catch (error) {
            logger.warn('Error stopping contract event indexer:', error.message);
          }

          // Stop event reconciliation service
          try {
            eventReconciliationService.stop();
            logger.info('Event reconciliation service stopped');
          } catch (error) {
            logger.warn('Error stopping event reconciliation service:', error.message);
          }

          // Stop geo-failover monitoring
          try {
            geoFailoverService.stop();
            logger.info('Geo-failover monitoring stopped');
          } catch (error) {
            logger.warn('Error stopping geo-failover monitoring:', error.message);
          }

          // Process all pending trades before shutdown
          try {
            await tradeBatcher.processAllPending();
            logger.info('All pending trades processed');
          } catch (error) {
            logger.warn('Error processing pending trades:', error.message);
          }

          // Disconnect Redis adapter
          try {
            await redisAdapter.disconnect();
            logger.info('Redis adapter disconnected');
          } catch (error) {
            logger.warn('Error disconnecting Redis adapter:', error.message);
          }

          logger.info('Graceful shutdown completed');
          process.exit(0);
        });
      });

      // Force close server after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`Oryn Finance Backend running on port ${this.port}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Frontend URL: ${process.env.FRONTEND_URL}`);
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`API Documentation: http://localhost:${this.port}/api-docs`);
      }
    });
  }
}

// Initialize and start server
if (require.main === module) {
  const server = new OrynBackendServer();
  server.initialize().then(() => {
    server.start();
  }).catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
} else if (process.env.NODE_ENV === 'test') {
  const server = new OrynBackendServer();
  server.setupMiddleware();
  server.setupRoutes();
  server.setupErrorHandling();
  module.exports = server.app;
} else {
  module.exports = OrynBackendServer;
}

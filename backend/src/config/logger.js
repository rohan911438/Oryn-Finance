const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston about the colors
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: format,
    level: process.env.LOG_LEVEL || 'info',
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exitOnError: false,
});

// Separate transport for Stellar transactions
const stellarLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/stellar.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
});

// Separate transport for database operations
const dbLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/database.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Dedicated oracle logger for discrepancies and anomalies
const oracleFileLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/oracle.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
});

// Helper functions for structured logging
logger.stellar = (message, data = {}) => {
  stellarLogger.info(message, data);
  logger.info(`[STELLAR] ${message}`, data);
};

logger.database = (message, data = {}) => {
  dbLogger.info(message, data);
  logger.info(`[DATABASE] ${message}`, data);
};

logger.trade = (message, data = {}) => {
  logger.info(`[TRADE] ${message}`, data);
};

logger.market = (message, data = {}) => {
  logger.info(`[MARKET] ${message}`, data);
};

logger.auth = (message, data = {}) => {
  logger.info(`[AUTH] ${message}`, data);
};

logger.oracle = (message, data = {}) => {
  oracleFileLogger.info(message, data);
  logger.info(`[ORACLE] ${message}`, data);
};

logger.oracleDiscrepancy = (message, data = {}) => {
  oracleFileLogger.warn(message, { ...data, type: 'discrepancy' });
  logger.warn(`[ORACLE:DISCREPANCY] ${message}`, data);
};

logger.oracleAnomaly = (message, data = {}) => {
  oracleFileLogger.error(message, { ...data, type: 'anomaly' });
  logger.warn(`[ORACLE:ANOMALY] ${message}`, data);
};

logger.websocket = (message, data = {}) => {
  logger.info(`[WEBSOCKET] ${message}`, data);
};

// Performance logging
logger.performance = (operation, duration, metadata = {}) => {
  logger.info(`[PERFORMANCE] ${operation} completed in ${duration}ms`, metadata);
};

module.exports = logger;
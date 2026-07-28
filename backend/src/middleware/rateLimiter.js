const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

const violations = [];
const MAX_VIOLATIONS = 1000;

// Dynamic trading limits state
const dynamicTradeLimits = new Map(); // `${wallet}:${poolId}` -> {trades, windowStart}
const DYNAMIC_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_TRADES_PER_WINDOW = 100;
const MAX_TRADE_SIZE_USDC = 50000; // $50k max trade size
const COOLDOWN_MULTIPLIER = 2; // Exponential backoff multiplier

function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip
  );
}

function onRateLimitExceeded(req, res, options, limiterName) {
  const ip = getClientIP(req);
  const entry = {
    ip,
    limiter: limiterName,
    path: req.path,
    method: req.method,
    userId: req.user?.id || null,
    timestamp: Date.now(),
  };
  violations.push(entry);
  if (violations.length > MAX_VIOLATIONS) violations.shift();
  logger.warn(`[RATE-LIMIT] ${limiterName} exceeded`, entry);
  res.status(options.statusCode).json({
    success: false,
    message: 'Rate limit exceeded. Please slow down.',
    retryAfter: Math.ceil(options.windowMs / 1000),
  });
}

function skipHealthChecks(req) {
  return req.path === '/health' || req.path === '/api/health';
}

function userOrIpKey(req) {
  return req.user?.walletAddress || req.user?.id || getClientIP(req);
}

const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipHealthChecks,
  handler: (req, res, next, options) => onRateLimitExceeded(req, res, options, 'global'),
});

const authenticatedLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS) || 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: (req, res, next, options) => onRateLimitExceeded(req, res, options, 'authenticated'),
});

const sensitiveLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_SENSITIVE_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_SENSITIVE_MAX_REQUESTS) || 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res, next, options) => onRateLimitExceeded(req, res, options, 'sensitive'),
});

const tradeLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_TRADE_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_TRADE_MAX_REQUESTS) || 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: (req, res, next, options) => onRateLimitExceeded(req, res, options, 'trade'),
});

const burstLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_BURST_WINDOW_MS) || 10 * 1000,
  max: parseInt(process.env.RATE_LIMIT_BURST_MAX_REQUESTS) || 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res, next, options) => onRateLimitExceeded(req, res, options, 'burst'),
});

/**
 * Dynamic trading limits middleware
 * Enforces per-user, per-pool trading limits with exponential backoff
 */
function dynamicTradingLimits(req, res, next) {
  if (req.path !== '/' || req.method !== 'POST') {
    return next();
  }

  const walletAddress = req.user?.walletAddress;
  const { marketId, amount } = req.body || {};

  if (!walletAddress || !marketId) {
    return next();
  }

  const key = `${walletAddress.toLowerCase()}:${marketId}`;
  const now = Date.now();

  // Get or initialize window
  if (!dynamicTradeLimits.has(key)) {
    dynamicTradeLimits.set(key, {
      trades: [],
      windowStart: now,
      cooldownUntil: 0,
    });
  }

  const window = dynamicTradeLimits.get(key);

  // Check if in cooldown
  if (window.cooldownUntil > now) {
    const retryAfter = Math.ceil((window.cooldownUntil - now) / 1000);
    logger.warn(`[DYNAMIC-LIMIT] User in cooldown`, {
      wallet: walletAddress,
      marketId,
      retryAfter,
    });
    return res.status(429).json({
      success: false,
      message: `Trading cooldown active. Please wait ${retryAfter} seconds.`,
      retryAfter,
      limitType: 'cooldown',
    });
  }

  // Reset window if expired
  if (now >= window.windowStart + DYNAMIC_LIMIT_WINDOW_MS) {
    window.trades = [];
    window.windowStart = now;
  }

  // Check trade count limit
  if (window.trades.length >= MAX_TRADES_PER_WINDOW) {
    // Apply exponential backoff cooldown
    const violationCount = window.trades.length - MAX_TRADES_PER_WINDOW;
    const cooldownMs = Math.min(
      DYNAMIC_LIMIT_WINDOW_MS,
      5 * 60 * 1000 * Math.pow(COOLDOWN_MULTIPLIER, violationCount)
    );
    window.cooldownUntil = now + cooldownMs;

    logger.warn(`[DYNAMIC-LIMIT] Trade count limit exceeded`, {
      wallet: walletAddress,
      marketId,
      tradeCount: window.trades.length,
      cooldownMs,
    });

    return res.status(429).json({
      success: false,
      message: `Trading limit exceeded. Cooldown applied.`,
      retryAfter: Math.ceil(cooldownMs / 1000),
      limitType: 'trade_count',
    });
  }

  // Check individual trade size
  if (amount && amount > MAX_TRADE_SIZE_USDC) {
    logger.warn(`[DYNAMIC-LIMIT] Trade size exceeded`, {
      wallet: walletAddress,
      marketId,
      amount,
      maxSize: MAX_TRADE_SIZE_USDC,
    });

    return res.status(400).json({
      success: false,
      message: `Trade size $${amount} exceeds maximum allowed $${MAX_TRADE_SIZE_USDC}`,
      limitType: 'trade_size',
    });
  }

  // Record trade in window
  window.trades.push({ timestamp: now, amount: amount || 0 });

  next();
}

/**
 * Get dynamic trading limits status for a user/pool
 */
function getDynamicLimitsStatus(walletAddress, marketId) {
  const key = `${walletAddress.toLowerCase()}:${marketId}`;
  const now = Date.now();

  if (!dynamicTradeLimits.has(key)) {
    return {
      tradesInWindow: 0,
      maxTrades: MAX_TRADES_PER_WINDOW,
      windowStart: now,
      windowEnd: now + DYNAMIC_LIMIT_WINDOW_MS,
      inCooldown: false,
    };
  }

  const window = dynamicTradeLimits.get(key);

  // Reset window if expired
  if (now >= window.windowStart + DYNAMIC_LIMIT_WINDOW_MS) {
    window.trades = [];
    window.windowStart = now;
    window.cooldownUntil = 0;
  }

  return {
    tradesInWindow: window.trades.length,
    maxTrades: MAX_TRADES_PER_WINDOW,
    windowStart: window.windowStart,
    windowEnd: window.windowStart + DYNAMIC_LIMIT_WINDOW_MS,
    inCooldown: window.cooldownUntil > now,
    cooldownEnd: window.cooldownUntil,
    retryAfter: window.cooldownUntil > now
      ? Math.ceil((window.cooldownUntil - now) / 1000)
      : 0,
  };
}

/**
 * Reset dynamic trading limits for a user (admin only)
 */
function resetDynamicLimits(walletAddress, marketId) {
  const key = `${walletAddress.toLowerCase()}:${marketId}`;
  dynamicTradeLimits.delete(key);
  logger.info(`Dynamic limits reset for ${key}`);
}

/**
 * Get all active violations
 */
function getViolations() {
  return violations.slice();
}

/**
 * Get dynamic limits metrics
 */
function getDynamicLimitsMetrics() {
  const now = Date.now();
  const activeWindows = [];
  const cooldowns = [];

  for (const [key, window] of dynamicTradeLimits.entries()) {
    if (now >= window.windowStart + DYNAMIC_LIMIT_WINDOW_MS) continue;

    const [wallet, poolId] = key.split(':');
    activeWindows.push({
      wallet,
      poolId,
      trades: window.trades.length,
      windowStart: window.windowStart,
    });

    if (window.cooldownUntil > now) {
      cooldowns.push({
        wallet,
        poolId,
        cooldownEnd: window.cooldownUntil,
        retryAfter: Math.ceil((window.cooldownUntil - now) / 1000),
      });
    }
  }

  return {
    activeWindows: activeWindows.length,
    activeCooldowns: cooldowns.length,
    topTraders: activeWindows.sort((a, b) => b.trades - a.trades).slice(0, 10),
    cooldowns,
  };
}

module.exports = {
  globalLimiter,
  authenticatedLimiter,
  sensitiveLimiter,
  tradeLimiter,
  burstLimiter,
  dynamicTradingLimits,
  getDynamicLimitsStatus,
  resetDynamicLimits,
  getViolations,
  getDynamicLimitsMetrics,
};

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const {
  TokenService,
  setAuthCookies,
  clearAuthCookies,
  COOKIE_REFRESH,
} = require('../middleware/auth');
const logger = require('../config/logger');

/**
 * POST /auth/refresh
 * Issue a new access + refresh token pair using the httpOnly refresh cookie.
 * The old refresh token is rotated (one-time use), preventing replay attacks.
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[COOKIE_REFRESH];

  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'Refresh token required' });
  }

  const tokens = await TokenService.rotateTokens(refreshToken);
  setAuthCookies(res, tokens);

  logger.info('Tokens refreshed via cookie');

  return res.json({
    success: true,
    message: 'Tokens refreshed',
    expiresIn: tokens.expiresIn,
  });
}));

/**
 * POST /auth/logout
 * Clear both auth cookies, effectively ending the session.
 */
router.post('/logout', (req, res) => {
  clearAuthCookies(res);
  logger.info('User logged out — auth cookies cleared');
  return res.json({ success: true, message: 'Logged out' });
});

/**
 * POST /auth/token
 * Exchange a wallet challenge + signature for httpOnly auth cookies.
 * Clients that previously stored tokens in localStorage should migrate here.
 */
router.post('/token', asyncHandler(async (req, res) => {
  const { walletAddress, signature, challenge } = req.body;

  if (!walletAddress || !signature || !challenge) {
    return res.status(400).json({
      success: false,
      message: 'walletAddress, signature, and challenge are required',
    });
  }

  // generateAuthToken validates the signature internally
  await TokenService.generateAuthToken(walletAddress, signature, challenge);

  const accessToken  = TokenService.generateAccessToken(walletAddress);
  const refreshToken = TokenService.generateRefreshToken(walletAddress);

  // Set tokens as httpOnly cookies — JS cannot read these (XSS protection)
  setAuthCookies(res, { accessToken, refreshToken });

  logger.info('Auth cookies issued', { walletAddress: walletAddress.slice(0, 10) + '...' });

  return res.json({
    success: true,
    message: 'Authenticated — tokens stored in httpOnly cookies',
    expiresIn: 900, // 15 min for access token
  });
}));

module.exports = router;

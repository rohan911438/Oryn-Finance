const express = require('express');
const TransactionController = require('../controllers/transactionController');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for transaction endpoints
const transactionLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 transaction requests per minute
  message: 'Too many transaction requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const queryLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 query requests per minute
  message: 'Too many query requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all transaction routes
router.use('/build', transactionLimit);
router.use('/submit', transactionLimit);

// Query endpoints (read-only)
router.get('/network-info', queryLimit, TransactionController.getNetworkInfo);
router.get('/current-ledger', queryLimit, TransactionController.getCurrentLedger);
router.get('/status/:txHash', queryLimit, TransactionController.getTransactionStatus);

// XDR Building endpoints (require authentication)
router.post('/build/create-market', 
  authenticateToken, 
  validateRequest('createMarket'),
  TransactionController.buildCreateMarketXDR
);

router.post('/build/buy-tokens', 
  authenticateToken, 
  validateRequest('buyTokens'),
  TransactionController.buildBuyTokensXDR
);

router.post('/build/sell-tokens', 
  authenticateToken, 
  validateRequest('sellTokens'),
  TransactionController.buildSellTokensXDR
);

router.post('/build/claim-winnings', 
  authenticateToken, 
  validateRequest('claimWinnings'),
  TransactionController.buildClaimWinningsXDR
);

router.post('/build/swap', 
  authenticateToken, 
  validateRequest('swap'),
  TransactionController.buildSwapXDR
);

router.post('/build/add-liquidity', 
  authenticateToken, 
  validateRequest('addLiquidity'),
  TransactionController.buildAddLiquidityXDR
);

router.post('/build/stake', 
  authenticateToken, 
  validateRequest('stake'),
  TransactionController.buildStakeXDR
);

router.post('/build/vote', 
  authenticateToken, 
  validateRequest('vote'),
  TransactionController.buildVoteXDR
);

router.post('/build/purchase-insurance', 
  authenticateToken, 
  validateRequest('purchaseInsurance'),
  TransactionController.buildPurchaseInsuranceXDR
);

router.post('/build/submit-private-order', 
  authenticateToken, 
  validateRequest('submitPrivateOrder'),
  TransactionController.buildSubmitPrivateOrderXDR
);

// Transaction submission endpoint
router.post('/submit', 
  validateRequest('submitTransaction'),
  TransactionController.submitSignedTransaction
);

module.exports = router;
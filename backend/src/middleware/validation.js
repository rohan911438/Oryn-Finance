const { body, param, query, validationResult } = require('express-validator');
const { ValidationError } = require('./errorHandler');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    
    throw new ValidationError('Validation failed', errorMessages[0].field, errorMessages);
  }
  next();
};

// Common validation rules
const commonValidations = {
  // Wallet address validation
  walletAddress: body('walletAddress')
    .isString()
    .isLength({ min: 56, max: 56 })
    .withMessage('Wallet address must be 56 characters')
    .matches(/^G[A-Z2-7]{55}$/)
    .withMessage('Invalid Stellar wallet address format'),

  // Market ID validation
  marketId: param('id')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Market ID is required'),

  // Pagination validation
  page: query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Page must be a positive integer between 1 and 1000')
    .toInt(),

  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),

  // Amount validation
  amount: body('amount')
    .isFloat({ min: 0.01, max: 1000000 })
    .withMessage('Amount must be between 0.01 and 1,000,000')
    .toFloat(),

  // Price validation
  price: body('price')
    .isFloat({ min: 0.001, max: 0.999 })
    .withMessage('Price must be between 0.001 and 0.999')
    .toFloat()
};

// Market validation rules
const marketValidations = {
  createMarket: [
    body('question')
      .isString()
      .isLength({ min: 10, max: 500 })
      .withMessage('Question must be between 10 and 500 characters')
      .trim(),
    
    body('category')
      .isString()
      .isIn(['sports', 'politics', 'crypto', 'entertainment', 'economics', 'technology', 'other'])
      .withMessage('Invalid category'),
    
    body('expiresAt')
      .isISO8601()
      .toDate()
      .custom((value) => {
        const now = new Date();
        const minExpiration = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
        const maxExpiration = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
        
        if (value <= minExpiration) {
          throw new Error('Market must expire at least 1 hour from now');
        }
        
        if (value > maxExpiration) {
          throw new Error('Market cannot expire more than 1 year from now');
        }
        
        return true;
      }),
    
    body('resolutionCriteria')
      .isString()
      .isLength({ min: 20, max: 1000 })
      .withMessage('Resolution criteria must be between 20 and 1000 characters')
      .trim(),
    
    body('initialLiquidity')
      .isFloat({ min: 100, max: 100000 })
      .withMessage('Initial liquidity must be between 100 and 100,000 USDC')
      .toFloat(),
    
    commonValidations.walletAddress,
    validate
  ],

  updateMarket: [
    commonValidations.marketId,
    body('question')
      .optional()
      .isString()
      .isLength({ min: 10, max: 500 })
      .withMessage('Question must be between 10 and 500 characters')
      .trim(),
    
    body('resolutionCriteria')
      .optional()
      .isString()
      .isLength({ min: 20, max: 1000 })
      .withMessage('Resolution criteria must be between 20 and 1000 characters')
      .trim(),
    
    validate
  ],

  resolveMarket: [
    commonValidations.marketId,
    body('outcome')
      .isIn(['yes', 'no', 'invalid'])
      .withMessage('Outcome must be yes, no, or invalid'),
    
    body('resolutionSource')
      .optional()
      .isString()
      .isLength({ max: 200 })
      .withMessage('Resolution source must be less than 200 characters'),
    
    validate
  ]
};

// Trade validation rules
const tradeValidations = {
  executeTrade: [
    body('marketId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Market ID is required'),
    
    body('tokenType')
      .isIn(['yes', 'no'])
      .withMessage('Token type must be yes or no'),
    
    body('tradeType')
      .isIn(['buy', 'sell'])
      .withMessage('Trade type must be buy or sell'),
    
    commonValidations.amount,
    
    body('maxSlippage')
      .optional()
      .isFloat({ min: 0.001, max: 0.1 })
      .withMessage('Max slippage must be between 0.1% and 10%')
      .toFloat(),
    
    commonValidations.walletAddress,
    validate
  ]
};

// User validation rules
const userValidations = {
  updateProfile: [
    body('username')
      .optional()
      .isString()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscore, and hyphen')
      .trim(),
    
    body('email')
      .optional()
      .isEmail()
      .withMessage('Valid email address required')
      .normalizeEmail(),
    
    body('bio')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Bio must be less than 500 characters')
      .trim(),
    
    body('website')
      .optional()
      .isURL()
      .withMessage('Valid website URL required'),
    
    body('twitter')
      .optional()
      .isString()
      .matches(/^@?[A-Za-z0-9_]{1,15}$/)
      .withMessage('Invalid Twitter username')
      .trim(),
    
    validate
  ]
};

// Query validation rules
const queryValidations = {
  marketFilters: [
    query('category')
      .optional()
      .isIn(['sports', 'politics', 'crypto', 'entertainment', 'economics', 'technology', 'other'])
      .withMessage('Invalid category'),
    
    query('status')
      .optional()
      .isIn(['active', 'resolved', 'cancelled', 'expired'])
      .withMessage('Invalid status'),
    
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'expiresAt', 'totalVolume', 'totalTrades'])
      .withMessage('Invalid sort field'),
    
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),
    
    query('search')
      .optional()
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters')
      .trim(),
    
    commonValidations.page,
    commonValidations.limit,
    validate
  ],

  tradeHistory: [
    query('marketId')
      .optional()
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Invalid market ID'),
    
    query('tokenType')
      .optional()
      .isIn(['yes', 'no'])
      .withMessage('Token type must be yes or no'),
    
    query('tradeType')
      .optional()
      .isIn(['buy', 'sell'])
      .withMessage('Trade type must be buy or sell'),
    
    query('startDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid start date format'),
    
    query('endDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid end date format'),
    
    commonValidations.page,
    commonValidations.limit,
    validate
  ]
};

// Admin validation rules
const adminValidations = {
  suspendUser: [
    body('walletAddress')
      .isString()
      .isLength({ min: 56, max: 56 })
      .withMessage('Valid wallet address required'),
    
    body('suspendUntil')
      .isISO8601()
      .toDate()
      .custom((value) => {
        if (value <= new Date()) {
          throw new Error('Suspension end date must be in the future');
        }
        return true;
      })
      .withMessage('Valid suspension end date required'),
    
    body('reason')
      .isString()
      .isLength({ min: 10, max: 500 })
      .withMessage('Suspension reason must be between 10 and 500 characters')
      .trim(),
    
    validate
  ],

  updateMarketStatus: [
    commonValidations.marketId,
    body('status')
      .isIn(['active', 'cancelled', 'paused'])
      .withMessage('Status must be active, cancelled, or paused'),
    
    body('reason')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Reason must be less than 500 characters')
      .trim(),
    
    validate
  ]
};

// Transaction validation rules
const transactionValidations = {
  createMarket: [
    body('question')
      .isString()
      .isLength({ min: 10, max: 500 })
      .withMessage('Question must be between 10 and 500 characters')
      .trim(),
    
    body('category')
      .isString()
      .isLength({ min: 1, max: 50 })
      .withMessage('Category is required and must be less than 50 characters')
      .trim(),
    
    body('expiryTimestamp')
      .isInt({ min: Date.now() / 1000 })
      .withMessage('Expiry timestamp must be in the future')
      .toInt(),
    
    body('initialLiquidity')
      .isFloat({ min: 1, max: 1000000 })
      .withMessage('Initial liquidity must be between 1 and 1,000,000')
      .toFloat(),
    
    body('marketContract').optional().isString(),
    body('poolAddress').optional().isString(),
    body('yesToken').optional().isString(),
    body('noToken').optional().isString(),
    
    validate
  ],
  
  buyTokens: [
    body('marketId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Market ID is required'),
    
    body('tokenType')
      .isIn(['yes', 'no'])
      .withMessage('Token type must be yes or no'),
    
    commonValidations.amount,
    
    body('maxSlippage')
      .optional()
      .isFloat({ min: 0.001, max: 0.1 })
      .withMessage('Max slippage must be between 0.1% and 10%')
      .toFloat(),
    
    validate
  ],
  
  sellTokens: [
    body('marketId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Market ID is required'),
    
    body('tokenType')
      .isIn(['yes', 'no'])
      .withMessage('Token type must be yes or no'),
    
    commonValidations.amount,
    
    body('maxSlippage')
      .optional()
      .isFloat({ min: 0.001, max: 0.1 })
      .withMessage('Max slippage must be between 0.1% and 10%')
      .toFloat(),
    
    validate
  ],
  
  claimWinnings: [
    body('marketId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Market ID is required'),
    
    validate
  ],
  
  swap: [
    body('fromToken')
      .isString()
      .withMessage('From token is required'),
    
    body('toToken')
      .isString()
      .withMessage('To token is required'),
    
    commonValidations.amount,
    
    body('maxSlippage')
      .optional()
      .isFloat({ min: 0.001, max: 0.1 })
      .withMessage('Max slippage must be between 0.1% and 10%')
      .toFloat(),
    
    validate
  ],
  
  addLiquidity: [
    body('marketId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Market ID is required'),
    
    body('yesAmount')
      .isFloat({ min: 0.01, max: 1000000 })
      .withMessage('Yes amount must be between 0.01 and 1,000,000')
      .toFloat(),
    
    body('noAmount')
      .isFloat({ min: 0.01, max: 1000000 })
      .withMessage('No amount must be between 0.01 and 1,000,000')
      .toFloat(),
    
    validate
  ],
  
  stake: [
    body('amount')
      .isFloat({ min: 0.01, max: 1000000 })
      .withMessage('Stake amount must be between 0.01 and 1,000,000')
      .toFloat(),
    
    body('duration')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Staking duration must be between 1 and 365 days')
      .toInt(),
    
    validate
  ],
  
  vote: [
    body('proposalId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Proposal ID is required'),
    
    body('choice')
      .isIn(['yes', 'no', 'abstain'])
      .withMessage('Vote choice must be yes, no, or abstain'),
    
    body('votingPower')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Voting power must be positive')
      .toFloat(),
    
    validate
  ],
  
  purchaseInsurance: [
    body('marketId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Market ID is required'),
    
    body('coverage')
      .isFloat({ min: 0.01, max: 1000000 })
      .withMessage('Coverage amount must be between 0.01 and 1,000,000')
      .toFloat(),
    
    body('premium')
      .isFloat({ min: 0.001, max: 10000 })
      .withMessage('Premium must be between 0.001 and 10,000')
      .toFloat(),
    
    validate
  ],
  
  submitPrivateOrder: [
    body('marketId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Market ID is required'),
    
    body('orderType')
      .isIn(['limit', 'market'])
      .withMessage('Order type must be limit or market'),
    
    body('side')
      .isIn(['buy', 'sell'])
      .withMessage('Side must be buy or sell'),
    
    body('tokenType')
      .isIn(['yes', 'no'])
      .withMessage('Token type must be yes or no'),
    
    commonValidations.amount,
    
    body('price')
      .optional()
      .isFloat({ min: 0.01, max: 0.99 })
      .withMessage('Price must be between 0.01 and 0.99')
      .toFloat(),
    
    validate
  ],
  
  submitTransaction: [
    body('signedXDR')
      .optional()
      .isString()
      .isLength({ min: 1 })
      .withMessage('signedXDR must be a non-empty string'),
    body('xdr')
      .optional()
      .isString()
      .isLength({ min: 1 })
      .withMessage('xdr must be a non-empty string'),
    body()
      .custom((_value, { req }) => {
        const hasPayload = Boolean(req.body?.signedXDR || req.body?.xdr);
        if (!hasPayload) {
          throw new Error('Either signedXDR or xdr is required');
        }
        return true;
      }),
    
    body('networkPassphrase')
      .optional()
      .isString()
      .withMessage('Network passphrase must be a string'),
    
    validate
  ]
};

module.exports = {
  validate,
  marketValidations,
  tradeValidations,
  userValidations,
  queryValidations,
  adminValidations,
  commonValidations,
  transactionValidations
};
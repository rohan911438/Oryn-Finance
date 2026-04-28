const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  tradeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  marketId: {
    type: String,
    required: true,
    index: true,
    ref: 'Market'
  },
  userWalletAddress: {
    type: String,
    required: true,
    index: true
  },
  tradeType: {
    type: String,
    enum: ['buy', 'sell'],
    required: true,
    index: true
  },
  tokenType: {
    type: String,
    enum: ['yes', 'no'],
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  totalCost: {
    type: Number,
    required: true,
    min: 0
  },
  fees: {
    platformFee: {
      type: Number,
      default: 0,
      min: 0
    },
    stellarFee: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  stellarTransactionHash: {
    type: String,
    required: true,
    index: true
  },
  stellarOperations: [{
    operationType: String,
    sourceAccount: String,
    destinationAccount: String,
    asset: String,
    amount: String
  }],
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'partially_filled', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  blockHeight: {
    type: Number,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  marketPrices: {
    yesPriceBefore: Number,
    noPriceBefore: Number,
    yesPriceAfter: Number,
    noPriceAfter: Number
  },
  slippage: {
    expected: {
      type: Number,
      default: 0
    },
    actual: {
      type: Number,
      default: 0
    }
  },
  orderbook: {
    type: {
      type: String,
      enum: ['market', 'limit'],
      default: 'market'
    },
    limitPrice: {
      type: Number,
      min: 0,
      max: 1
    },
    expiresAt: {
      type: Date
    },
    filled: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  partialFill: {
    isPartial: { type: Boolean, default: false },
    filledAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },
    fillRatio: { type: Number, default: 1, min: 0, max: 1 }
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    sessionId: String,
    referrer: String
  }
}, {
  timestamps: true,
  collection: 'trades'
});

// Compound indexes for better query performance
tradeSchema.index({ marketId: 1, timestamp: -1 });
tradeSchema.index({ userWalletAddress: 1, timestamp: -1 });
tradeSchema.index({ marketId: 1, tokenType: 1, timestamp: -1 });
tradeSchema.index({ status: 1, timestamp: -1 });
tradeSchema.index({ tradeType: 1, tokenType: 1 });

// Virtual fields
tradeSchema.virtual('netAmount').get(function() {
  return this.tradeType === 'buy' ? this.amount : -this.amount;
});

tradeSchema.virtual('effectivePrice').get(function() {
  return this.totalCost / this.amount;
});

tradeSchema.virtual('actualSlippage').get(function() {
  if (!this.marketPrices) return 0;
  
  const expectedPrice = this.tokenType === 'yes' 
    ? this.marketPrices.yesPriceBefore 
    : this.marketPrices.noPriceBefore;
    
  return Math.abs(this.price - expectedPrice) / expectedPrice;
});

// Methods
tradeSchema.methods.calculateFees = function(platformFeeRate = 0.005) {
  this.fees.platformFee = this.totalCost * platformFeeRate;
  this.fees.stellarFee = 0.00001; // Base Stellar transaction fee
  this.fees.total = this.fees.platformFee + this.fees.stellarFee;
};

tradeSchema.methods.confirm = function(blockHeight) {
  this.status = 'confirmed';
  this.blockHeight = blockHeight;
};

tradeSchema.methods.fail = function(reason) {
  this.status = 'failed';
  this.metadata.failureReason = reason;
};

tradeSchema.methods.calculatePnL = function(currentPrice) {
  const entryPrice = this.price;
  const positionValue = this.amount * currentPrice;
  const costBasis = this.amount * entryPrice + this.fees.total;
  
  if (this.tradeType === 'buy') {
    return positionValue - costBasis;
  } else {
    return costBasis - positionValue;
  }
};

// Static methods
tradeSchema.statics.findByMarket = function(marketId, limit = 50, skip = 0) {
  return this.find({ marketId, status: 'confirmed' })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);
};

tradeSchema.statics.findByUser = function(walletAddress, limit = 50, skip = 0) {
  return this.find({ 
    userWalletAddress: walletAddress.toLowerCase(),
    status: 'confirmed'
  })
  .sort({ timestamp: -1 })
  .limit(limit)
  .skip(skip);
};

tradeSchema.statics.findRecentTrades = function(limit = 20) {
  return this.find({ status: 'confirmed' })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('marketId', 'question category');
};

tradeSchema.statics.getMarketVolume = function(marketId, timeframe = null) {
  const match = { 
    marketId,
    status: 'confirmed'
  };
  
  if (timeframe) {
    const timeThreshold = new Date(Date.now() - timeframe);
    match.timestamp = { $gte: timeThreshold };
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalVolume: { $sum: '$totalCost' },
        tradeCount: { $sum: 1 },
        avgTradeSize: { $avg: '$totalCost' }
      }
    }
  ]);
};

tradeSchema.statics.getUserTradeStats = function(walletAddress) {
  return this.aggregate([
    { 
      $match: { 
        userWalletAddress: walletAddress.toLowerCase(),
        status: 'confirmed'
      }
    },
    {
      $group: {
        _id: null,
        totalTrades: { $sum: 1 },
        totalVolume: { $sum: '$totalCost' },
        avgTradeSize: { $avg: '$totalCost' },
        totalFees: { $sum: '$fees.total' },
        buyTrades: {
          $sum: { $cond: [{ $eq: ['$tradeType', 'buy'] }, 1, 0] }
        },
        sellTrades: {
          $sum: { $cond: [{ $eq: ['$tradeType', 'sell'] }, 1, 0] }
        },
        yesTrades: {
          $sum: { $cond: [{ $eq: ['$tokenType', 'yes'] }, 1, 0] }
        },
        noTrades: {
          $sum: { $cond: [{ $eq: ['$tokenType', 'no'] }, 1, 0] }
        }
      }
    }
  ]);
};

tradeSchema.statics.getMarketPriceHistory = function(marketId, resolution = '1h', limit = 100) {
  let groupBy;
  
  switch (resolution) {
    case '5m':
      groupBy = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' },
        hour: { $hour: '$timestamp' },
        minute: { $subtract: ['$minute', { $mod: ['$minute', 5] }] }
      };
      break;
    case '15m':
      groupBy = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' },
        hour: { $hour: '$timestamp' },
        minute: { $subtract: ['$minute', { $mod: ['$minute', 15] }] }
      };
      break;
    case '1h':
    default:
      groupBy = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' },
        hour: { $hour: '$timestamp' }
      };
      break;
    case '1d':
      groupBy = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' }
      };
      break;
  }
  
  return this.aggregate([
    { 
      $match: { 
        marketId,
        status: 'confirmed'
      }
    },
    { $sort: { timestamp: 1 } },
    {
      $group: {
        _id: groupBy,
        timestamp: { $last: '$timestamp' },
        yesPrice: { 
          $last: { 
            $cond: [
              { $eq: ['$tokenType', 'yes'] },
              '$price',
              '$marketPrices.yesPriceAfter'
            ]
          }
        },
        noPrice: {
          $last: { 
            $cond: [
              { $eq: ['$tokenType', 'no'] },
              '$price',
              '$marketPrices.noPriceAfter'
            ]
          }
        },
        volume: { $sum: '$totalCost' },
        trades: { $sum: 1 }
      }
    },
    { $sort: { timestamp: -1 } },
    { $limit: limit }
  ]);
};

tradeSchema.statics.getPendingTrades = function() {
  return this.find({ 
    status: 'pending',
    timestamp: { 
      $gte: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
    }
  });
};

// Pre-save middleware
tradeSchema.pre('save', function(next) {
  // Generate trade ID if not provided
  if (!this.tradeId) {
    this.tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Calculate total cost if not provided
  if (!this.totalCost && this.amount && this.price) {
    this.totalCost = this.amount * this.price;
  }
  
  // Calculate fees
  this.calculateFees();
  
  // Ensure wallet address is lowercase
  if (this.userWalletAddress) {
    this.userWalletAddress = this.userWalletAddress.toLowerCase();
  }
  
  next();
});

module.exports = mongoose.model('Trade', tradeSchema);
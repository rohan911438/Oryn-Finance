const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
  positionId: {
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
  tokenType: {
    type: String,
    enum: ['yes', 'no'],
    required: true,
    index: true
  },
  totalShares: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  lockedShares: {
    type: Number,
    default: 0,
    min: 0
  },
  availableShares: {
    type: Number,
    default: 0,
    min: 0
  },
  averageEntryPrice: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  totalCostBasis: {
    type: Number,
    required: true,
    min: 0
  },
  realizedPnL: {
    type: Number,
    default: 0
  },
  unrealizedPnL: {
    type: Number,
    default: 0
  },
  totalFees: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'settled'],
    default: 'active',
    index: true
  },
  trades: [{
    tradeId: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['buy', 'sell'],
      required: true
    },
    shares: {
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
    timestamp: {
      type: Date,
      required: true
    },
    fees: {
      type: Number,
      default: 0
    }
  }],
  marketResolution: {
    outcome: {
      type: String,
      enum: ['yes', 'no', 'invalid']
    },
    settlementAmount: {
      type: Number,
      min: 0
    },
    settledAt: {
      type: Date
    },
    settlementTxHash: {
      type: String
    }
  },
  riskMetrics: {
    maxDrawdown: {
      type: Number,
      default: 0
    },
    maxGain: {
      type: Number,
      default: 0
    },
    volatility: {
      type: Number,
      default: 0
    },
    sharpeRatio: {
      type: Number,
      default: 0
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'positions'
});

// Compound indexes for performance
positionSchema.index({ userWalletAddress: 1, status: 1 });
positionSchema.index({ marketId: 1, status: 1 });
positionSchema.index({ userWalletAddress: 1, marketId: 1 });
positionSchema.index({ status: 1, lastUpdated: -1 });

// Virtual fields
positionSchema.virtual('currentValue').get(function() {
  return this.totalShares * this.getCurrentPrice();
});

positionSchema.virtual('totalReturn').get(function() {
  if (this.totalCostBasis === 0) return 0;
  return ((this.currentValue + this.realizedPnL) - this.totalCostBasis) / this.totalCostBasis;
});

positionSchema.virtual('isLong').get(function() {
  return this.totalShares > 0;
});

positionSchema.virtual('isShort').get(function() {
  return this.totalShares < 0;
});

positionSchema.virtual('isWinning').get(function() {
  return this.unrealizedPnL > 0;
});

// Methods
positionSchema.methods.getCurrentPrice = function() {
  // This would need to be updated with real-time market data
  // For now, return the average entry price as placeholder
  return this.averageEntryPrice;
};

positionSchema.methods.addTrade = function(trade) {
  const tradeData = {
    tradeId: trade.tradeId,
    type: trade.tradeType,
    shares: trade.amount,
    price: trade.price,
    timestamp: trade.timestamp,
    fees: trade.fees.total
  };
  
  this.trades.push(tradeData);
  this.updatePosition(trade);
};

positionSchema.methods.updatePosition = function(trade) {
  const { tradeType, amount, price, fees } = trade;
  
  if (tradeType === 'buy') {
    // Adding to position
    const newTotalShares = this.totalShares + amount;
    const newTotalCost = this.totalCostBasis + (amount * price) + fees.total;
    
    this.averageEntryPrice = newTotalCost / newTotalShares;
    this.totalShares = newTotalShares;
    this.availableShares = Math.max(0, this.totalShares - this.lockedShares);
    this.totalCostBasis = newTotalCost;
    this.totalFees += fees.total;
    
  } else if (tradeType === 'sell') {
    // Reducing position
    const sellValue = amount * price;
    const costBasisSold = (amount / this.totalShares) * this.totalCostBasis;
    const realizedGainLoss = sellValue - costBasisSold - fees.total;
    
    this.realizedPnL += realizedGainLoss;
    this.totalShares -= amount;
    this.availableShares = Math.max(0, this.totalShares - this.lockedShares);
    this.totalCostBasis -= costBasisSold;
    this.totalFees += fees.total;
    
    // Close position if no shares left
    if (this.totalShares <= 0) {
      this.status = 'closed';
      this.totalShares = 0;
      this.availableShares = 0;
      this.lockedShares = 0;
      this.totalCostBasis = 0;
    }
  }
  
  this.lastUpdated = new Date();
  this.updateUnrealizedPnL();
  this.updateRiskMetrics();
};

positionSchema.methods.updateUnrealizedPnL = function(currentPrice = null) {
  if (this.status === 'closed' || this.totalShares === 0) {
    this.unrealizedPnL = 0;
    return;
  }
  
  const price = currentPrice || this.getCurrentPrice();
  const currentValue = this.totalShares * price;
  this.unrealizedPnL = currentValue - this.totalCostBasis;
};

positionSchema.methods.updateRiskMetrics = function() {
  if (this.trades.length < 2) return;
  
  // Calculate max drawdown and max gain
  let peak = this.totalCostBasis;
  let maxDrawdown = 0;
  let maxGain = 0;
  let runningValue = this.totalCostBasis;
  
  for (const trade of this.trades) {
    if (trade.type === 'buy') {
      runningValue += (trade.shares * trade.price) + trade.fees;
    } else {
      runningValue -= (trade.shares * trade.price) - trade.fees;
    }
    
    if (runningValue > peak) {
      peak = runningValue;
      maxGain = Math.max(maxGain, runningValue - this.totalCostBasis);
    }
    
    const drawdown = (peak - runningValue) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  
  this.riskMetrics.maxDrawdown = maxDrawdown;
  this.riskMetrics.maxGain = maxGain;
  
  // Calculate volatility (simplified)
  if (this.trades.length >= 5) {
    const returns = [];
    for (let i = 1; i < this.trades.length; i++) {
      const prevPrice = this.trades[i - 1].price;
      const currPrice = this.trades[i].price;
      returns.push((currPrice - prevPrice) / prevPrice);
    }
    
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length;
    this.riskMetrics.volatility = Math.sqrt(variance);
    
    // Simple Sharpe ratio approximation (assuming risk-free rate = 0)
    if (this.riskMetrics.volatility > 0) {
      this.riskMetrics.sharpeRatio = meanReturn / this.riskMetrics.volatility;
    }
  }
};

positionSchema.methods.settle = function(marketOutcome, settlementPrice) {
  if (this.status === 'settled') return;
  
  const isWinningPosition = (
    (marketOutcome === 'yes' && this.tokenType === 'yes') ||
    (marketOutcome === 'no' && this.tokenType === 'no')
  );
  
  let settlementAmount = 0;
  
  if (marketOutcome === 'invalid') {
    // Refund based on average entry price
    settlementAmount = this.totalShares * this.averageEntryPrice;
  } else if (isWinningPosition) {
    // Winning tokens are worth 1 USDC each
    settlementAmount = this.totalShares * 1.0;
  } else {
    // Losing tokens are worth 0
    settlementAmount = 0;
  }
  
  this.marketResolution = {
    outcome: marketOutcome,
    settlementAmount,
    settledAt: new Date()
  };
  
  // Calculate final realized P&L
  this.realizedPnL += settlementAmount - this.totalCostBasis;
  this.unrealizedPnL = 0;
  this.status = 'settled';
  this.lastUpdated = new Date();
};

positionSchema.methods.lockShares = function(amount) {
  if (amount > this.availableShares) {
    throw new Error('Insufficient available shares to lock');
  }
  
  this.lockedShares += amount;
  this.availableShares -= amount;
  this.lastUpdated = new Date();
};

positionSchema.methods.unlockShares = function(amount) {
  if (amount > this.lockedShares) {
    throw new Error('Cannot unlock more shares than are locked');
  }
  
  this.lockedShares -= amount;
  this.availableShares += amount;
  this.lastUpdated = new Date();
};

// Static methods
positionSchema.statics.findUserPositions = function(walletAddress, status = 'active') {
  return this.find({
    userWalletAddress: walletAddress.toLowerCase(),
    status
  }).sort({ lastUpdated: -1 });
};

positionSchema.statics.findMarketPositions = function(marketId, status = 'active') {
  return this.find({
    marketId,
    status
  }).sort({ totalShares: -1 });
};

positionSchema.statics.findLargestPositions = function(limit = 10) {
  return this.find({ status: 'active' })
    .sort({ totalCostBasis: -1 })
    .limit(limit);
};

positionSchema.statics.getUserPortfolioValue = function(walletAddress) {
  return this.aggregate([
    {
      $match: {
        userWalletAddress: walletAddress.toLowerCase(),
        status: 'active'
      }
    },
    {
      $group: {
        _id: null,
        totalPositions: { $sum: 1 },
        totalCostBasis: { $sum: '$totalCostBasis' },
        totalRealizedPnL: { $sum: '$realizedPnL' },
        totalUnrealizedPnL: { $sum: '$unrealizedPnL' },
        totalFees: { $sum: '$totalFees' }
      }
    }
  ]);
};

positionSchema.statics.getMarketPositionStats = function(marketId) {
  return this.aggregate([
    { $match: { marketId, status: 'active' } },
    {
      $group: {
        _id: '$tokenType',
        totalPositions: { $sum: 1 },
        totalShares: { $sum: '$totalShares' },
        totalValue: { $sum: '$totalCostBasis' },
        avgEntryPrice: { $avg: '$averageEntryPrice' }
      }
    }
  ]);
};

positionSchema.statics.findExpiredPositions = function() {
  return this.find({
    status: 'active'
  }).populate({
    path: 'marketId',
    match: { expiresAt: { $lte: new Date() } }
  });
};

// Pre-save middleware
positionSchema.pre('save', function(next) {
  // Generate position ID if not provided
  if (!this.positionId) {
    this.positionId = `pos_${this.userWalletAddress}_${this.marketId}_${this.tokenType}`;
  }
  
  // Ensure wallet address is lowercase
  if (this.userWalletAddress) {
    this.userWalletAddress = this.userWalletAddress.toLowerCase();
  }
  
  // Update available shares
  this.availableShares = Math.max(0, this.totalShares - this.lockedShares);
  
  next();
});

module.exports = mongoose.model('Position', positionSchema);
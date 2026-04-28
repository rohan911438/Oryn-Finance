const mongoose = require('mongoose');

const marketSchema = new mongoose.Schema({
  marketId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  question: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['sports', 'politics', 'crypto', 'entertainment', 'economics', 'technology', 'other'],
    index: true
  },
  creatorWalletAddress: {
    type: String,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  resolutionCriteria: {
    type: String,
    required: true,
    maxlength: 1000
  },
  oracleSource: {
    type: String,
    enum: ['manual', 'coingecko', 'sports-api', 'news-api', 'chainlink'],
    default: 'manual'
  },
  oracleConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['active', 'resolved', 'cancelled', 'expired', 'disputed'],
    default: 'active',
    index: true
  },
  totalVolume: {
    type: Number,
    default: 0,
    min: 0
  },
  totalTrades: {
    type: Number,
    default: 0,
    min: 0
  },
  yesTokenAssetCode: {
    type: String,
    required: true
  },
  noTokenAssetCode: {
    type: String,
    required: true
  },
  yesTokenIssuer: {
    type: String,
    required: true
  },
  noTokenIssuer: {
    type: String,
    required: true
  },
  liquidityPoolId: {
    type: String
  },
  initialLiquidity: {
    type: Number,
    required: true,
    min: 0
  },
  currentYesPrice: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  currentNoPrice: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  resolvedOutcome: {
    type: String,
    enum: ['yes', 'no', 'invalid'],
    default: null
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: String
  },
  resolutionTransactionHash: {
    type: String
  },
  resolutionFinalizationTxHash: {
    type: String
  },
  resolutionFinalizationTimestamp: {
    type: Date
  },
  tags: [{
    type: String,
    maxlength: 50
  }],
  metadata: {
    description: {
      type: String,
      maxlength: 2000
    },
    imageUrl: {
      type: String
    },
    sourceUrls: [{
      type: String
    }]
  },
  statistics: {
    uniqueTraders: {
      type: Number,
      default: 0
    },
    yesTotalStake: {
      type: Number,
      default: 0
    },
    noTotalStake: {
      type: Number,
      default: 0
    },
    avgTradeSize: {
      type: Number,
      default: 0
    },
    priceHistory: [{
      timestamp: Date,
      yesPrice: Number,
      noPrice: Number,
      volume: Number
    }]
  },
  platformFee: {
    type: Number,
    default: 0.005, // 0.5%
    min: 0,
    max: 0.1
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'markets'
});

// Indexes for performance
marketSchema.index({ category: 1, status: 1 });
marketSchema.index({ createdAt: -1 });
marketSchema.index({ expiresAt: 1 });
marketSchema.index({ totalVolume: -1 });
marketSchema.index({ 'statistics.uniqueTraders': -1 });
marketSchema.index({ isFeatured: 1, status: 1 });

// Virtual fields
marketSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

marketSchema.virtual('timeUntilExpiration').get(function() {
  return Math.max(0, this.expiresAt - new Date());
});

marketSchema.virtual('daysUntilExpiration').get(function() {
  return Math.ceil(this.timeUntilExpiration / (1000 * 60 * 60 * 24));
});

// Methods
marketSchema.methods.updatePrices = function(yesPrice, noPrice) {
  this.currentYesPrice = yesPrice;
  this.currentNoPrice = noPrice;
  
  // Add to price history
  this.statistics.priceHistory.push({
    timestamp: new Date(),
    yesPrice,
    noPrice,
    volume: this.totalVolume
  });
  
  // Keep only last 1000 price points
  if (this.statistics.priceHistory.length > 1000) {
    this.statistics.priceHistory = this.statistics.priceHistory.slice(-1000);
  }
};

marketSchema.methods.addTrade = function(amount) {
  this.totalTrades += 1;
  this.totalVolume += amount;
  this.statistics.avgTradeSize = this.totalVolume / this.totalTrades;
};

marketSchema.methods.resolve = function(outcome, resolvedBy, transactionHash) {
  this.status = 'resolved';
  this.resolvedOutcome = outcome;
  this.resolvedAt = new Date();
  this.resolvedBy = resolvedBy;
  this.resolutionTransactionHash = transactionHash;
};

// Static methods
marketSchema.statics.findActiveMarkets = function() {
  return this.find({
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

marketSchema.statics.findExpiredMarkets = function() {
  return this.find({
    status: 'active',
    expiresAt: { $lte: new Date() }
  });
};

marketSchema.statics.findTrendingMarkets = function(limit = 10) {
  return this.find({ status: 'active' })
    .sort({ totalVolume: -1, 'statistics.uniqueTraders': -1 })
    .limit(limit);
};

marketSchema.statics.findMarketsByCategory = function(category, limit = 20) {
  return this.find({ 
    category,
    status: 'active',
    expiresAt: { $gt: new Date() }
  })
  .sort({ createdAt: -1 })
  .limit(limit);
};

// Pre-save middleware
marketSchema.pre('save', function(next) {
  // Ensure prices sum to 1 (with small tolerance for rounding)
  const priceSum = this.currentYesPrice + this.currentNoPrice;
  if (Math.abs(priceSum - 1.0) > 0.01) {
    this.currentNoPrice = 1.0 - this.currentYesPrice;
  }
  
  next();
});

module.exports = mongoose.model('Market', marketSchema);
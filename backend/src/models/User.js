const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    maxlength: 50,
    trim: true,
    default: null
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: null
  },
  profile: {
    avatarUrl: {
      type: String,
      default: null
    },
    bio: {
      type: String,
      maxlength: 500,
      default: null
    },
    website: {
      type: String,
      default: null
    },
    twitter: {
      type: String,
      default: null
    },
    isVerified: {
      type: Boolean,
      default: false
    }
  },
  statistics: {
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
    profitLoss: {
      type: Number,
      default: 0
    },
    winRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    avgTradeSize: {
      type: Number,
      default: 0,
      min: 0
    },
    marketsCreated: {
      type: Number,
      default: 0,
      min: 0
    },
    successfulPredictions: {
      type: Number,
      default: 0,
      min: 0
    },
    totalPredictions: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  reputationScore: {
    type: Number,
    default: 100,
    min: 0,
    max: 1000
  },
  level: {
    type: String,
    enum: ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond'],
    default: 'rookie'
  },
  achievements: [{
    type: {
      type: String,
      enum: ['first-trade', 'first-win', 'high-roller', 'market-creator', 'prophet', 'consistent-trader', 'volume-king']
    },
    unlockedAt: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    marketResolutionAlerts: {
      type: Boolean,
      default: true
    },
    tradingAlerts: {
      type: Boolean,
      default: false
    },
    marketingEmails: {
      type: Boolean,
      default: false
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    defaultSlippage: {
      type: Number,
      default: 0.01, // 1%
      min: 0.001,
      max: 0.1
    }
  },
  wallet: {
    totalDeposited: {
      type: Number,
      default: 0,
      min: 0
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
      min: 0
    },
    currentBalance: {
      type: Number,
      default: 0,
      min: 0
    },
    lockedBalance: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  badges: [{
    type: String,
    enum: ['early-adopter', 'whale', 'oracle', 'diamond-hands', 'market-maker', 'accuracy-ace']
  }],
  referral: {
    referralCode: {
      type: String,
      unique: true,
      sparse: true
    },
    referredBy: {
      type: String,
      default: null
    },
    referralCount: {
      type: Number,
      default: 0
    },
    referralEarnings: {
      type: Number,
      default: 0
    }
  },
  security: {
    lastLoginAt: {
      type: Date,
      default: null
    },
    loginCount: {
      type: Number,
      default: 0
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    suspendedUntil: {
      type: Date,
      default: null
    },
    suspensionReason: {
      type: String,
      default: null
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'users'
});

// Indexes for performance
userSchema.index({ 'statistics.totalVolume': -1 });
userSchema.index({ 'statistics.profitLoss': -1 });
userSchema.index({ reputationScore: -1 });
userSchema.index({ 'statistics.winRate': -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ level: 1 });
// referralCode index is created automatically due to unique: true

// Virtual fields
userSchema.virtual('totalPositions').get(function() {
  return this.positions ? this.positions.length : 0;
});

userSchema.virtual('isOnline').get(function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.lastActiveAt > fiveMinutesAgo;
});

userSchema.virtual('accountAge').get(function() {
  return Date.now() - this.createdAt;
});

userSchema.virtual('averageReturn').get(function() {
  if (this.statistics.totalVolume === 0) return 0;
  return this.statistics.profitLoss / this.statistics.totalVolume;
});

// Methods
userSchema.methods.updateStats = function(trade) {
  this.statistics.totalTrades += 1;
  this.statistics.totalVolume += trade.amount;
  this.statistics.avgTradeSize = this.statistics.totalVolume / this.statistics.totalTrades;
  this.lastActiveAt = new Date();
};

userSchema.methods.addProfitLoss = function(amount) {
  this.statistics.profitLoss += amount;
  this.wallet.currentBalance += amount;
};

userSchema.methods.updateWinRate = function() {
  if (this.statistics.totalPredictions === 0) {
    this.statistics.winRate = 0;
  } else {
    this.statistics.winRate = this.statistics.successfulPredictions / this.statistics.totalPredictions;
  }
};

userSchema.methods.calculateLevel = function() {
  const volume = this.statistics.totalVolume;
  const winRate = this.statistics.winRate;
  const reputation = this.reputationScore;
  
  if (volume >= 100000 && winRate >= 0.7 && reputation >= 800) {
    this.level = 'diamond';
  } else if (volume >= 50000 && winRate >= 0.6 && reputation >= 600) {
    this.level = 'platinum';
  } else if (volume >= 10000 && winRate >= 0.55 && reputation >= 400) {
    this.level = 'gold';
  } else if (volume >= 5000 && winRate >= 0.5 && reputation >= 200) {
    this.level = 'silver';
  } else if (volume >= 1000 && this.statistics.totalTrades >= 10) {
    this.level = 'bronze';
  } else {
    this.level = 'rookie';
  }
};

userSchema.methods.updateReputationScore = function(change, reason) {
  this.reputationScore = Math.max(0, Math.min(1000, this.reputationScore + change));
};

userSchema.methods.recomputeReputationFromStats = function() {
  const stats = this.statistics || {};
  const totalPredictions = stats.totalPredictions || 0;
  const successfulPredictions = stats.successfulPredictions || 0;
  const totalVolume = stats.totalVolume || 0;
  const totalTrades = stats.totalTrades || 0;
  const winRate = totalPredictions > 0 ? successfulPredictions / totalPredictions : 0;

  const confidenceMultiplier = Math.min(1, totalPredictions / 20);
  const accuracyImpact = (winRate - 0.5) * 300 * confidenceMultiplier;
  const volumeImpact = Math.min(150, totalVolume / 1000);
  const activityImpact = Math.min(100, totalTrades * 2);

  const nextScore = 100 + accuracyImpact + volumeImpact + activityImpact;
  this.reputationScore = Math.max(0, Math.min(1000, Math.round(nextScore)));
  return this.reputationScore;
};

userSchema.methods.addAchievement = function(type, metadata = {}) {
  const existingAchievement = this.achievements.find(a => a.type === type);
  if (!existingAchievement) {
    this.achievements.push({
      type,
      unlockedAt: new Date(),
      metadata
    });
  }
};

userSchema.methods.generateReferralCode = function() {
  if (!this.referral.referralCode) {
    const code = Math.random().toString(36).substr(2, 8).toUpperCase();
    this.referral.referralCode = `ORYN${code}`;
  }
  return this.referral.referralCode;
};

userSchema.methods.isSuspended = function() {
  return this.security.suspendedUntil && this.security.suspendedUntil > new Date();
};

// Static methods
userSchema.statics.findTopTraders = function(limit = 10, timeframe = 'all') {
  let matchStage = { isActive: true };
  
  if (timeframe !== 'all') {
    const days = timeframe === 'week' ? 7 : timeframe === 'month' ? 30 : 365;
    const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    matchStage.lastActiveAt = { $gte: dateThreshold };
  }
  
  return this.find(matchStage)
    .sort({ 'statistics.profitLoss': -1 })
    .limit(limit);
};

userSchema.statics.findTopByVolume = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ 'statistics.totalVolume': -1 })
    .limit(limit);
};

userSchema.statics.findTopByAccuracy = function(limit = 10) {
  return this.find({ 
    isActive: true,
    'statistics.totalPredictions': { $gte: 5 }
  })
  .sort({ 'statistics.winRate': -1, 'statistics.totalPredictions': -1 })
  .limit(limit);
};

userSchema.statics.findByWalletAddress = function(address) {
  return this.findOne({ walletAddress: address.toLowerCase() });
};

// Pre-save middleware
userSchema.pre('save', function(next) {
  // Update level based on current stats
  this.calculateLevel();
  
  // Update win rate
  this.updateWinRate();
  
  // Ensure wallet address is lowercase
  if (this.walletAddress) {
    this.walletAddress = this.walletAddress.toLowerCase();
  }
  
  next();
});

// Post-save middleware
userSchema.post('save', function(doc) {
  // Check for new achievements
  if (doc.statistics.totalTrades === 1) {
    doc.addAchievement('first-trade');
  }
  
  if (doc.statistics.totalVolume >= 10000 && !doc.achievements.find(a => a.type === 'high-roller')) {
    doc.addAchievement('high-roller');
  }
  
  if (doc.statistics.marketsCreated === 1) {
    doc.addAchievement('market-creator');
  }
  
  if (doc.statistics.winRate >= 0.8 && doc.statistics.totalPredictions >= 10) {
    doc.addAchievement('prophet');
  }
});

module.exports = mongoose.model('User', userSchema);
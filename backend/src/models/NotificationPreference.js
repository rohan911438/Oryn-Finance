const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  preferences: {
    portfolioMilestones: { type: Boolean, default: true },
    transactionStatus: { type: Boolean, default: true },
    priceAlerts: { type: Boolean, default: true },
    liquidationWarnings: { type: Boolean, default: true },
    governanceUpdates: { type: Boolean, default: true },
    lowBalanceAlerts: { type: Boolean, default: true },
    marketExpired: { type: Boolean, default: true },
    dailyDigest: { type: Boolean, default: true },
    treasuryAlerts: { type: Boolean, default: true },
    riskAlerts: { type: Boolean, default: true },
    yieldOpportunityAlerts: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  collection: 'notification_preferences'
});

notificationPreferenceSchema.pre('validate', function(next) {
  if (this.walletAddress) {
    this.walletAddress = this.walletAddress.toLowerCase();
  }

  if (this.preferences) {
    this.preferences.liquidationWarnings = true;
  }

  next();
});

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);

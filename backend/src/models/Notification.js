const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  notificationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  walletAddress: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'transaction_status',
      'treasury_alert',
      'risk_alert',
      'yield_opportunity',
      'portfolio_milestone',
      'liquidation_warning',
      'market_expired',
      'governance_update',
      'system'
    ],
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: ['transaction', 'treasury', 'risk', 'yield', 'portfolio', 'market', 'governance', 'system'],
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['info', 'success', 'warning', 'critical'],
    default: 'info',
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['delivered', 'suppressed', 'failed'],
    default: 'delivered',
    index: true
  },
  readAt: {
    type: Date,
    default: null,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  delivery: {
    inApp: {
      type: Boolean,
      default: true
    },
    pushAttempted: {
      type: Boolean,
      default: false
    },
    pushDelivered: {
      type: Boolean,
      default: false
    },
    failureReason: {
      type: String,
      default: null
    }
  }
}, {
  timestamps: true,
  collection: 'notifications',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

notificationSchema.virtual('read').get(function() {
  return Boolean(this.readAt);
});

notificationSchema.index({ walletAddress: 1, createdAt: -1 });
notificationSchema.index({ walletAddress: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ category: 1, severity: 1, createdAt: -1 });

notificationSchema.pre('validate', function(next) {
  if (!this.notificationId) {
    this.notificationId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  if (this.walletAddress) {
    this.walletAddress = this.walletAddress.toLowerCase();
  }

  next();
});

module.exports = mongoose.model('Notification', notificationSchema);

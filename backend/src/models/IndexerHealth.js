const mongoose = require('mongoose');

const indexerHealthSchema = new mongoose.Schema({
  indexerId: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['healthy', 'degraded', 'unhealthy', 'starting', 'stopped'],
    default: 'starting'
  },
  lastProcessedLedger: {
    type: Number,
    default: 0
  },
  currentLedger: {
    type: Number,
    default: 0
  },
  ledgerLag: {
    type: Number,
    default: 0
  },
  eventsProcessed: {
    type: Number,
    default: 0
  },
  eventsProcessedPerMinute: {
    type: Number,
    default: 0
  },
  errorsCount: {
    type: Number,
    default: 0
  },
  lastError: {
    type: String,
    default: null
  },
  lastErrorAt: {
    type: Date,
    default: null
  },
  reorgCount: {
    type: Number,
    default: 0
  },
  lastReorgAt: {
    type: Date,
    default: null
  },
  duplicateEventsSkipped: {
    type: Number,
    default: 0
  },
  marketsIndexed: {
    type: Number,
    default: 0
  },
  tradesIndexed: {
    type: Number,
    default: 0
  },
  uptime: {
    type: Number,
    default: 0
  },
  lastHealthCheck: {
    type: Date,
    default: Date.now
  },
  averageProcessingTime: {
    type: Number,
    default: 0
  },
  memoryUsage: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'indexer_health'
});

indexerHealthSchema.index({ indexerId: 1 }, { unique: true });
indexerHealthSchema.index({ status: 1, lastHealthCheck: -1 });
indexerHealthSchema.index({ lastProcessedLedger: -1 });

indexerHealthSchema.methods.updateHealth = function(data) {
  Object.assign(this, data);
  this.lastHealthCheck = new Date();
  return this.save();
};

indexerHealthSchema.statics.getLatestHealth = function(indexerId) {
  return this.findOne({ indexerId }).sort({ lastHealthCheck: -1 });
};

indexerHealthSchema.statics.getHealthHistory = function(indexerId, limit = 100) {
  return this.find({ indexerId }).sort({ lastHealthCheck: -1 }).limit(limit);
};

module.exports = mongoose.model('IndexerHealth', indexerHealthSchema);

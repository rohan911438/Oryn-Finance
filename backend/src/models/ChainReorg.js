const mongoose = require('mongoose');

const chainReorgSchema = new mongoose.Schema({
  reorgId: {
    type: String,
    required: true,
    unique: true
  },
  detectedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  fromLedger: {
    type: Number,
    required: true
  },
  toLedger: {
    type: Number,
    required: true
  },
  affectedEvents: [{
    txHash: String,
    topic: String,
    contractId: String,
    originalLedger: Number,
    newLedger: Number,
    status: {
      type: String,
      enum: ['pending', 'replayed', 'invalidated', 'confirmed'],
      default: 'pending'
    }
  }],
  affectedMarkets: [String],
  status: {
    type: String,
    enum: ['detected', 'replaying', 'completed', 'failed'],
    default: 'detected',
    index: true
  },
  replayedEventsCount: {
    type: Number,
    default: 0
  },
  invalidatedEventsCount: {
    type: Number,
    default: 0
  },
  error: {
    type: String,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  duration: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'chain_reorgs'
});

chainReorgSchema.index({ status: 1, detectedAt: -1 });
chainReorgSchema.index({ fromLedger: 1, toLedger: 1 });

module.exports = mongoose.model('ChainReorg', chainReorgSchema);

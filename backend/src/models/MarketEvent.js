const mongoose = require('mongoose');

const marketEventSchema = new mongoose.Schema({
  marketId: {
    type: String,
    required: true,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'MARKET_CREATED',
      'MARKET_UPDATED',
      'MARKET_RESOLVED',
      'MARKET_CANCELLED',
      'MARKET_ARCHIVED',
      'TRADE_EXECUTED',
      'PRICES_UPDATED',
      'LIQUIDITY_ADDED',
      'LIQUIDITY_REMOVED'
    ],
    index: true
  },
  schemaVersion: {
    type: Number,
    required: true,
    default: 1
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  actorAddress: {
    type: String,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  sequenceNumber: {
    type: Number,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'market_events'
});

// Ensure sequence numbers are unique per market
marketEventSchema.index({ marketId: 1, sequenceNumber: 1 }, { unique: true });

module.exports = mongoose.model('MarketEvent', marketEventSchema);

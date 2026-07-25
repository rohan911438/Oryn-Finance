const mongoose = require('mongoose');

const marketSnapshotSchema = new mongoose.Schema({
  marketId: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  lastEventSequenceNumber: {
    type: Number,
    required: true,
    default: 0
  },
  stateData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'market_snapshots'
});

module.exports = mongoose.model('MarketSnapshot', marketSnapshotSchema);

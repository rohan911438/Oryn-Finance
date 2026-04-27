const mongoose = require('mongoose');

const indexedEventSchema = new mongoose.Schema({
  contractId: {
    type: String,
    required: true,
    index: true
  },
  contractName: {
    type: String,
    required: true,
    index: true
  },
  topic: {
    type: String,
    required: true,
    index: true
  },
  txHash: {
    type: String,
    required: true,
    index: true
  },
  ledger: {
    type: Number,
    required: true,
    index: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'indexed_events'
});

indexedEventSchema.index({ txHash: 1, topic: 1, contractId: 1 }, { unique: true });
indexedEventSchema.index({ contractName: 1, ledger: -1 });

module.exports = mongoose.model('IndexedEvent', indexedEventSchema);

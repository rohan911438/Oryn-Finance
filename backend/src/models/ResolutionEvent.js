const mongoose = require('mongoose');

const resolutionEventSchema = new mongoose.Schema({
  marketId: {
    type: String,
    required: true,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'oracle_submission',
      'consensus_reached',
      'dispute_period_started',
      'resolution_disputed',
      'resolution_finalized',
      'manual_resolution'
    ]
  },
  actorAddress: {
    type: String
  },
  outcome: {
    type: Boolean
  },
  confidenceScore: {
    type: Number,
    min: 0,
    max: 1
  },
  proofDataHash: {
    type: String
  },
  payload: {
    type: mongoose.Schema.Types.Mixed
  },
  ledger: {
    type: Number
  },
  txHash: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    required: true
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'resolution_events'
});

// Unique compound index on (txHash, eventType) to enforce idempotency (Requirement 8.5)
resolutionEventSchema.index({ txHash: 1, eventType: 1 }, { unique: true });

// Single-field index on marketId for query performance (Requirement 8.4)
// Note: marketId index is already declared inline above via `index: true`

module.exports = mongoose.model('ResolutionEvent', resolutionEventSchema);

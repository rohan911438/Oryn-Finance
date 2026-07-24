const mongoose = require('mongoose');

/**
 * StateSnapshot (Issue #227)
 *
 * Records protocol-wide state snapshots captured from Soroban contracts.
 * Each snapshot captures the complete state of markets, liquidity pools,
 * governance, oracle data, and treasury at a point in time.
 *
 * Snapshots are immutable after creation and verified for integrity before
 * restoration. Supports versioned rollback for deployment failures and
 * emergency protocol upgrades.
 */

const SNAPSHOT_STATUSES = ['created', 'verified', 'restoring', 'restored', 'corrupted', 'expired'];

const stateSnapshotSchema = new mongoose.Schema({
  snapshotId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  version: {
    type: Number,
    required: true,
    min: 1,
  },
  timestamp: {
    type: Date,
    required: true,
    index: true,
  },
  contractCount: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: SNAPSHOT_STATUSES,
    default: 'created',
    index: true,
  },
  createdBy: {
    walletAddress: { type: String, index: true },
    isGovernanceAction: { type: Boolean, default: false },
    proposalId: { type: String },
  },
  parentSnapshotId: {
    type: String,
    default: null,
  },
  description: {
    type: String,
    maxlength: 500,
  },
  stateHash: {
    type: String,
    required: true,
    index: true,
  },
  stateData: {
    markets: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    liquidityPools: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    governance: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    oracleData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    treasury: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  contractsRegistry: [
    {
      contractAddress: { type: String },
      contractType: { type: String },
      stateKeys: { type: [String] },
      stateHash: { type: String },
    },
  ],
  integrityChecks: [
    {
      checkedAt: { type: Date },
      passed: { type: Boolean },
      details: { type: String },
    },
  ],
  rollbackHistory: [
    {
      rolledBackAt: { type: Date },
      rolledBackBy: { type: String },
      reason: { type: String },
      previousSnapshotId: { type: String },
    },
  ],
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
  collection: 'state_snapshots',
});

stateSnapshotSchema.index({ status: 1, timestamp: -1 });
stateSnapshotSchema.index({ version: -1 });
stateSnapshotSchema.index({ 'createdBy.walletAddress': 1, timestamp: -1 });

stateSnapshotSchema.statics.findLatestVerified = function () {
  return this.findOne({ status: 'verified' })
    .sort({ version: -1, timestamp: -1 })
    .lean();
};

stateSnapshotSchema.statics.findByVersionRange = function (minVersion, maxVersion) {
  const query = {};
  if (minVersion !== undefined) query.version = { $gte: minVersion };
  if (maxVersion !== undefined) {
    query.version = query.version
      ? { ...query.version, $lte: maxVersion }
      : { $lte: maxVersion };
  }
  return this.find(query).sort({ version: -1 }).lean();
};

stateSnapshotSchema.statics.pruneExpired = function (retentionDays = 90) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  return this.deleteMany({
    timestamp: { $lt: cutoff },
    status: { $nin: ['restoring', 'restored'] },
  });
};

stateSnapshotSchema.statics.countByStatus = function () {
  return this.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
};

const StateSnapshot = mongoose.model('StateSnapshot', stateSnapshotSchema);

if (StateSnapshot) {
  StateSnapshot.SNAPSHOT_STATUSES = SNAPSHOT_STATUSES;
}

module.exports = StateSnapshot;

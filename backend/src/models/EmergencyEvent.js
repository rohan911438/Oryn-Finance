const mongoose = require('mongoose');

const EMERGENCY_SEVERITY_LEVELS = [1, 2, 3, 4, 5];

const EMERGENCY_SEVERITY_LABELS = {
  1: 'low',
  2: 'medium',
  3: 'high',
  4: 'critical',
  5: 'catastrophic'
};

const EMERGENCY_TYPES = [
  'oracle_failure',
  'contract_vulnerability',
  'abnormal_activity',
  'infrastructure_incident',
  'liquidity_crisis',
  'price_manipulation',
  'unauthorized_access',
  'protocol_bug',
  'other'
];

const EMERGENCY_ACTIONS = [
  'pause_pool',
  'unpause_pool',
  'pause_market',
  'unpause_market',
  'pause_platform',
  'unpause_platform',
  'circuit_breaker_trigger',
  'circuit_breaker_reset',
  'emergency_withdraw',
  'freeze_account',
  'unfreeze_account',
  'pause_trading',
  'unpause_trading',
  'pause_oracle',
  'unpause_oracle',
  'other'
];

const EMERGENCY_STATUSES = [
  'declared',
  'active',
  'investigating',
  'mitigating',
  'resolved',
  'cancelled'
];

const emergencyEventSchema = new mongoose.Schema({
  emergencyId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  severity: {
    type: Number,
    required: true,
    enum: EMERGENCY_SEVERITY_LEVELS,
    index: true
  },
  severityLabel: {
    type: String,
    enum: Object.values(EMERGENCY_SEVERITY_LABELS),
    required: true
  },
  emergencyType: {
    type: String,
    enum: EMERGENCY_TYPES,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: EMERGENCY_STATUSES,
    default: 'declared',
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  declaredBy: {
    walletAddress: { type: String, required: true, index: true },
    role: { type: String, default: 'admin' }
  },
  affectedComponents: [{
    type: {
      type: String,
      enum: ['contract', 'pool', 'market', 'oracle', 'account', 'platform']
    },
    id: String,
    name: String
  }],
  actions: [{
    actionId: {
      type: String,
      required: true
    },
    action: {
      type: String,
      enum: EMERGENCY_ACTIONS,
      required: true
    },
    executedAt: {
      type: Date,
      default: Date.now
    },
    executedBy: {
      walletAddress: { type: String, required: true },
      role: { type: String, default: 'admin' }
    },
    parameters: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    result: {
      success: { type: Boolean, default: false },
      txHash: String,
      error: String
    },
    reversible: {
      type: Boolean,
      default: true
    },
    reversedAt: Date,
    reversedBy: {
      walletAddress: String,
      role: String
    }
  }],
  recoveryPlan: {
    steps: [{
      stepNumber: Number,
      description: String,
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'failed'],
        default: 'pending'
      },
      completedAt: Date,
      completedBy: String
    }],
    verifiedBy: String,
    verifiedAt: Date,
    verified: {
      type: Boolean,
      default: false
    }
  },
  resolutionNotes: {
    type: String,
    maxlength: 5000
  },
  resolvedBy: {
    walletAddress: String,
    role: String
  },
  resolvedAt: Date,
  timeline: [{
    timestamp: { type: Date, default: Date.now },
    event: String,
    actor: String,
    details: mongoose.Schema.Types.Mixed
  }],
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'emergency_events'
});

emergencyEventSchema.index({ severity: 1, status: 1 });
emergencyEventSchema.index({ emergencyType: 1, createdAt: -1 });
emergencyEventSchema.index({ 'declaredBy.walletAddress': 1, createdAt: -1 });
emergencyEventSchema.index({ status: 1, severity: -1 });
emergencyEventSchema.index({ createdAt: -1 });

emergencyEventSchema.pre('validate', function (next) {
  if (!this.emergencyId) {
    this.emergencyId = `emg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  if (!this.severityLabel) {
    this.severityLabel = EMERGENCY_SEVERITY_LABELS[this.severity] || 'unknown';
  }
  next();
});

emergencyEventSchema.methods.addAction = function(actionData) {
  const actionId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  this.actions.push({
    actionId,
    ...actionData
  });
  this.timeline.push({
    timestamp: new Date(),
    event: `action_executed`,
    actor: actionData.executedBy?.walletAddress || 'system',
    details: { actionId, action: actionData.action }
  });
  return this.save();
};

emergencyEventSchema.methods.updateStatus = function(newStatus, actor, notes) {
  this.status = newStatus;
  this.timeline.push({
    timestamp: new Date(),
    event: `status_changed_to_${newStatus}`,
    actor: actor || 'system',
    details: { previousStatus: this.status, notes }
  });
  if (newStatus === 'resolved') {
    this.resolvedAt = new Date();
    this.resolvedBy = typeof actor === 'object' ? actor : { walletAddress: actor };
    if (notes) this.resolutionNotes = notes;
  }
  return this.save();
};

emergencyEventSchema.statics.getActiveEmergencies = function() {
  return this.find({
    status: { $in: ['declared', 'active', 'investigating', 'mitigating'] }
  }).sort({ severity: -1, createdAt: -1 });
};

emergencyEventSchema.statics.getEmergencyStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: { status: '$status', severity: '$severity' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.severity': -1 } }
  ]);
};

module.exports = mongoose.model('EmergencyEvent', emergencyEventSchema);
module.exports.EMERGENCY_SEVERITY_LEVELS = EMERGENCY_SEVERITY_LEVELS;
module.exports.EMERGENCY_SEVERITY_LABELS = EMERGENCY_SEVERITY_LABELS;
module.exports.EMERGENCY_TYPES = EMERGENCY_TYPES;
module.exports.EMERGENCY_ACTIONS = EMERGENCY_ACTIONS;
module.exports.EMERGENCY_STATUSES = EMERGENCY_STATUSES;

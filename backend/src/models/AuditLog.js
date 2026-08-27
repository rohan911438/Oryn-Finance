const mongoose = require('mongoose');

/**
 * AuditLog (Issue #194)
 *
 * Centralized, structured record of critical platform actions used for
 * compliance, debugging and security monitoring. Every entry captures WHO
 * (actor), WHAT (action / category), WHEN (timestamp) and the relevant
 * context (target, request metadata, outcome).
 *
 * Documents are append-only by convention — they should never be mutated or
 * deleted by application code so the trail remains tamper-evident.
 */

// High-level categories of auditable activity.
const AUDIT_CATEGORIES = [
  'authentication',
  'transaction',
  'admin',
  'treasury',
  'oracle',
  'system',
  'emergency'
];

// Concrete actions, grouped by category. Kept as a flat enum so the trail is
// queryable by exact action while categories provide coarse filtering.
const AUDIT_ACTIONS = [
  // authentication
  'auth.login',
  'auth.logout',
  'auth.token_issued',
  'auth.token_refreshed',
  'auth.login_failed',
  // transaction
  'transaction.created',
  'transaction.executed',
  'transaction.failed',
  // admin
  'admin.action',
  'admin.access_granted',
  'admin.access_denied',
  // treasury
  'treasury.inflow_recorded',
  'treasury.distribution_recorded',
  'treasury.governance_action',
  'treasury.withdrawal',
  // oracle
  'oracle.consensus_reached',
  'oracle.consensus_rejected',
  // system / fallback
  'system.event',
  // emergency (Issue #245)
  'emergency.declared',
  'emergency.pause_pool',
  'emergency.unpause_pool',
  'emergency.pause_market',
  'emergency.unpause_market',
  'emergency.pause_platform',
  'emergency.unpause_platform',
  'emergency.circuit_breaker_trigger',
  'emergency.circuit_breaker_reset',
  'emergency.emergency_withdraw',
  'emergency.freeze_account',
  'emergency.unfreeze_account',
  'emergency.pause_trading',
  'emergency.unpause_trading',
  'emergency.pause_oracle',
  'emergency.unpause_oracle',
  'emergency.resolved'
];

const auditLogSchema = new mongoose.Schema({
  // Unique, human-readable identifier for the entry.
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  category: {
    type: String,
    enum: AUDIT_CATEGORIES,
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: AUDIT_ACTIONS,
    required: true,
    index: true
  },
  // Outcome of the action — useful for security monitoring (failed logins etc.).
  status: {
    type: String,
    enum: ['success', 'failure'],
    default: 'success',
    index: true
  },
  // WHO performed the action.
  actor: {
    walletAddress: { type: String, index: true },
    isAdmin: { type: Boolean, default: false },
    ip: { type: String },
    userAgent: { type: String }
  },
  // WHAT the action affected (optional — e.g. a market, transaction or user).
  target: {
    type: { type: String },       // e.g. 'market', 'transaction', 'treasury'
    id: { type: String }
  },
  // Human-readable summary of the event.
  description: {
    type: String,
    maxlength: 1000
  },
  // Arbitrary structured context (amounts, route, request id, etc.).
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // WHEN — explicit timestamp in addition to mongoose `timestamps`.
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'audit_logs'
});

// Common query patterns.
auditLogSchema.index({ category: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ 'actor.walletAddress': 1, timestamp: -1 });
auditLogSchema.index({ status: 1, timestamp: -1 });

auditLogSchema.pre('validate', function (next) {
  if (!this.eventId) {
    this.eventId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

/**
 * Aggregate counts per category for the audit dashboard.
 */
auditLogSchema.statics.getCategoryCounts = function (match = {}) {
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// Expose the enums on the model for reuse by services/controllers. Guarded so
// the module loads even when mongoose.model is mocked (returns undefined) in
// unit tests that don't exercise the real model.
if (AuditLog) {
  AuditLog.AUDIT_CATEGORIES = AUDIT_CATEGORIES;
  AuditLog.AUDIT_ACTIONS = AUDIT_ACTIONS;
}

module.exports = AuditLog;

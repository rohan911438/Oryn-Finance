const logger = require('../config/logger');

// AuditLog is required lazily inside record() so that simply importing this
// service (e.g. from a controller under test) never triggers mongoose model
// construction. Tests that mock the model still resolve the mock via require().
let AuditLogModel = null;
function getAuditLog() {
  if (!AuditLogModel) {
    AuditLogModel = require('../models/AuditLog');
  }
  return AuditLogModel;
}

/**
 * auditService (Issue #194)
 *
 * Centralized entry point for recording critical platform actions. Every
 * recorded event is:
 *   1. Persisted to the `audit_logs` collection (structured, queryable).
 *   2. Mirrored to the winston logger as a structured JSON line for file-based
 *      log aggregation / SIEM ingestion.
 *
 * Recording is best-effort: a failure to write an audit entry must never break
 * the business operation that triggered it, so all errors are caught and logged.
 */

/**
 * Normalize actor information from an express request (or an explicit object).
 * @param {object} source - either an express `req` or a plain actor object.
 */
function resolveActor(source = {}) {
  // express request shape
  if (source.user || source.headers) {
    return {
      walletAddress: source.user?.walletAddress || null,
      isAdmin: source.user?.userData?.isAdmin === true,
      ip: source.ip || source.headers?.['x-forwarded-for'] || null,
      userAgent: source.headers?.['user-agent'] || null
    };
  }
  // plain actor object
  return {
    walletAddress: source.walletAddress || null,
    isAdmin: source.isAdmin === true,
    ip: source.ip || null,
    userAgent: source.userAgent || null
  };
}

/**
 * Record an audit event.
 *
 * @param {object} event
 * @param {string} event.category - one of AuditLog.AUDIT_CATEGORIES
 * @param {string} event.action   - one of AuditLog.AUDIT_ACTIONS
 * @param {string} [event.status='success']
 * @param {object} [event.actor]  - express req or actor object
 * @param {object} [event.target] - { type, id }
 * @param {string} [event.description]
 * @param {object} [event.metadata]
 * @returns {Promise<object|null>} the persisted entry (lean) or null on failure
 */
async function record(event = {}) {
  const {
    category,
    action,
    status = 'success',
    actor,
    target,
    description,
    metadata = {}
  } = event;

  const entry = {
    category,
    action,
    status,
    actor: resolveActor(actor),
    target: target || undefined,
    description,
    metadata,
    timestamp: new Date()
  };

  // Structured JSON mirror for file-based logging — always emitted, even if the
  // DB write later fails, so nothing is silently lost.
  logger.info(`[AUDIT] ${action}`, {
    audit: true,
    ...entry
  });

  try {
    const AuditLog = getAuditLog();
    const doc = await AuditLog.create(entry);
    return doc.toObject();
  } catch (error) {
    logger.error('auditService.record failed to persist entry', {
      action,
      category,
      error: error.message
    });
    return null;
  }
}

// Convenience helpers for the four critical domains in the issue. Each accepts
// an express `req` (or actor object) so callers stay terse at the call site.

const auth = (action, reqOrActor, details = {}) =>
  record({
    category: 'authentication',
    action,
    status: details.status || (action === 'auth.login_failed' ? 'failure' : 'success'),
    actor: reqOrActor,
    description: details.description,
    metadata: details.metadata || {}
  });

const transaction = (action, reqOrActor, details = {}) =>
  record({
    category: 'transaction',
    action,
    status: details.status || (action === 'transaction.failed' ? 'failure' : 'success'),
    actor: reqOrActor,
    target: details.target,
    description: details.description,
    metadata: details.metadata || {}
  });

const admin = (reqOrActor, details = {}) =>
  record({
    category: 'admin',
    action: details.action || 'admin.action',
    status: details.status || 'success',
    actor: reqOrActor,
    target: details.target,
    description: details.description,
    metadata: details.metadata || {}
  });

const treasury = (action, reqOrActor, details = {}) =>
  record({
    category: 'treasury',
    action,
    status: details.status || 'success',
    actor: reqOrActor,
    target: details.target,
    description: details.description,
    metadata: details.metadata || {}
  });

const oracle = (action, details = {}) =>
  record({
    category: 'oracle',
    action,
    status: details.status || (action === 'oracle.consensus_rejected' ? 'failure' : 'success'),
    actor: details.actor || {},
    target: details.target,
    description: details.description,
    metadata: details.metadata || {}
  });

/**
 * Serialize a list of audit entries to CSV. Flattens the nested actor/target
 * objects into columns and JSON-encodes free-form metadata.
 * @param {object[]} entries
 * @returns {string}
 */
function toCSV(entries = []) {
  const headers = [
    'eventId',
    'timestamp',
    'category',
    'action',
    'status',
    'actorWalletAddress',
    'actorIsAdmin',
    'actorIp',
    'targetType',
    'targetId',
    'description',
    'metadata'
  ];

  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Quote fields containing commas, quotes or newlines (RFC 4180).
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = entries.map((e) => [
    e.eventId,
    e.timestamp ? new Date(e.timestamp).toISOString() : '',
    e.category,
    e.action,
    e.status,
    e.actor?.walletAddress,
    e.actor?.isAdmin === true,
    e.actor?.ip,
    e.target?.type,
    e.target?.id,
    e.description,
    e.metadata ? JSON.stringify(e.metadata) : ''
  ].map(escape).join(','));

  return [headers.join(','), ...rows].join('\n');
}

module.exports = {
  record,
  auth,
  transaction,
  admin,
  treasury,
  oracle,
  toCSV,
  resolveActor
};

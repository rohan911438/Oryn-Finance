/**
 * OracleProvenanceRecorder (#241)
 *
 * Turns the output of a resolution attempt — the raw provider responses plus the
 * `OracleConsensusEngine` decision — into a durable, append-oriented provenance
 * trail (`OracleProvenanceRecord`). Also links those records to a market
 * resolution once the real resolution state transition has succeeded.
 *
 * Every method is best-effort: a persistence failure is logged and swallowed so
 * it can never interrupt or fail a market resolution. Auditability is a goal,
 * but it must not come at the cost of blocking resolution — records that fail to
 * persist are logged loudly enough to be noticed and repaired.
 */

const crypto = require('crypto');
const logger = require('../../config/logger');
const { OracleProvenanceRecord } = require('../../models');

// Keys whose values must never be persisted, matched case-insensitively as a
// substring of the key name.
const SENSITIVE_KEY_PATTERN = /(api[_-]?key|secret|token|authorization|auth|password|passphrase|credential|bearer|cookie|session|private[_-]?key|signature)/i;

const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_STRING = 2000;

/**
 * Recursively strip sensitive keys and cap size/depth so we never persist
 * credentials or unbounded blobs. Returns a plain, JSON-safe object.
 */
function sanitizeMetadata(value, depth = 0) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    return value.length > MAX_METADATA_STRING
      ? `${value.slice(0, MAX_METADATA_STRING)}…[truncated]`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (value instanceof Date) return value.toISOString();

  if (depth >= MAX_METADATA_DEPTH) return '[depth-limited]';

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = sanitizeMetadata(val, depth + 1);
    }
    return out;
  }

  return null;
}

/**
 * Build a stable batch id for one resolution attempt.
 */
function makeBatchId(marketId) {
  return `${marketId}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Compact, self-describing snapshot of the consensus decision for a batch.
 */
function buildConsensusContext(decision) {
  if (!decision || typeof decision !== 'object') return null;

  const rejected = decision.rejected || {};
  return {
    providersConsidered: decision.evaluatedResponseCount ?? null,
    providersAccepted: (decision.participants || []).map((p) => p.source),
    providersRejected: {
      stale: (rejected.stale || []).map((r) => r.source),
      outliers: (rejected.outliers || []).map((r) => r.source),
      invalid: (rejected.invalid || []).map((r) => r.source)
    },
    valuesUsed: (decision.participants || []).map((p) => ({
      source: p.source,
      outcome: p.outcome,
      value: p.value ?? null,
      weight: p.weight
    })),
    weightByOutcome: decision.weightByOutcome || null,
    totalWeight: decision.totalWeight ?? null,
    agreementRatio: decision.agreementRatio ?? null,
    consensusThreshold: decision.consensusThreshold ?? null,
    minResponses: decision.minResponses ?? null,
    finalOutcome: decision.finalOutcome ?? null,
    consensusReached: Boolean(decision.consensusReached),
    evaluatedAt: decision.evaluatedAt || new Date().toISOString()
  };
}

/**
 * Cross-reference one raw provider result against the consensus decision to
 * derive its validation verdict. Pure function — easy to unit test.
 *
 * @param {Object} result   raw provider result { source, outcome, confidence, data, timestamp }
 * @param {Object} decision OracleConsensusEngine decision
 * @returns {Object} verdict fields for an OracleProvenanceRecord
 */
function deriveVerdict(result, decision) {
  const source = result.source;
  const rejected = (decision && decision.rejected) || { stale: [], outliers: [], invalid: [] };

  const participant = (decision?.participants || []).find((p) => p.source === source);
  if (participant) {
    return {
      validationStatus: 'valid',
      rejectionReason: null,
      rejectionDetail: null,
      stale: false,
      freshness: participant.ageMs !== undefined
        ? { ageMs: participant.ageMs, maxAgeMs: null }
        : null,
      participatedInConsensus: true,
      weightInConsensus: participant.weight ?? null
    };
  }

  const staleEntry = (rejected.stale || []).find((r) => r.source === source);
  if (staleEntry) {
    return {
      validationStatus: 'stale',
      rejectionReason: 'freshness_violation',
      rejectionDetail: `Response age ${staleEntry.ageMs}ms exceeds max staleness ${staleEntry.maxAgeMs}ms`,
      stale: true,
      freshness: { ageMs: staleEntry.ageMs ?? null, maxAgeMs: staleEntry.maxAgeMs ?? null },
      participatedInConsensus: false,
      weightInConsensus: null
    };
  }

  const outlierEntry = (rejected.outliers || []).find((r) => r.source === source);
  if (outlierEntry) {
    return {
      validationStatus: 'rejected',
      rejectionReason: 'outlier',
      rejectionDetail: `Robust z-score ${outlierEntry.robustZ} exceeds threshold ${outlierEntry.threshold}`,
      stale: false,
      freshness: null,
      participatedInConsensus: false,
      weightInConsensus: null
    };
  }

  const invalidEntry = (rejected.invalid || []).find((r) => r.source === source);
  if (invalidEntry) {
    const reasonCode = invalidEntry.reason === 'invalid_timestamp'
      ? 'malformed_response'
      : 'validation_failure';
    return {
      validationStatus: 'rejected',
      rejectionReason: reasonCode,
      rejectionDetail: `Consensus engine rejected response: ${invalidEntry.reason}`,
      stale: false,
      freshness: null,
      participatedInConsensus: false,
      weightInConsensus: null
    };
  }

  // Source produced a result but is absent from both participants and the
  // rejection buckets (e.g. removed as part of an outlier source-set). Record it
  // as rejected rather than letting it vanish.
  return {
    validationStatus: 'rejected',
    rejectionReason: 'validation_failure',
    rejectionDetail: 'Response was not included in the consensus evaluation',
    stale: false,
    freshness: null,
    participatedInConsensus: false,
    weightInConsensus: null
  };
}

class OracleProvenanceRecorder {
  /**
   * Persist one provenance record per raw provider result for a resolution
   * attempt. Returns the generated `batchId` (or a caller-supplied one) so the
   * caller can later link the batch to a resolution. Never throws.
   *
   * @param {Object} params
   * @param {string} params.marketId
   * @param {Array}  params.results   raw provider results
   * @param {Object} params.decision  OracleConsensusEngine decision
   * @param {string} [params.batchId] override (used by tests / retries)
   * @returns {Promise<string|null>} batchId, or null if nothing was recorded
   */
  async recordResolutionAttempt({ marketId, results, decision, batchId } = {}) {
    if (!marketId || !Array.isArray(results) || results.length === 0) {
      return null;
    }

    const resolvedBatchId = batchId || makeBatchId(marketId);
    const consensusContext = buildConsensusContext(decision);
    const now = new Date();

    try {
      let written = 0;
      for (const result of results) {
        const verdict = deriveVerdict(result, decision);
        const data = result.data || {};
        const numericValue = Number.isFinite(data.currentPrice)
          ? data.currentPrice
          : (Number.isFinite(result.value) ? result.value : null);

        const parsedReceivedAt = result.timestamp ? new Date(result.timestamp) : now;
        const receivedAt = Number.isNaN(parsedReceivedAt.getTime()) ? now : parsedReceivedAt;

        // Upsert keyed on (batchId, provider): re-recording the same attempt is
        // idempotent, while a new attempt (new batchId) always creates fresh
        // history rather than mutating the old observation.
        await OracleProvenanceRecord.updateOne(
          { batchId: resolvedBatchId, provider: result.source },
          {
            $setOnInsert: {
              marketId: String(marketId),
              batchId: resolvedBatchId,
              provider: result.source,
              providerRequestId:
                data.symbol || data.feedId || data.gameId || data.reference || null,
              receivedAt,
              normalizedOutcome:
                result.outcome === 'yes' || result.outcome === 'no' ? result.outcome : null,
              confidence: Number.isFinite(result.confidence) ? result.confidence : null,
              numericValue,
              sourceValue: sanitizeMetadata({
                outcome: result.outcome,
                confidence: result.confidence,
                value: numericValue
              }),
              responseMetadata: sanitizeMetadata(data),
              validationStatus: verdict.validationStatus,
              rejectionReason: verdict.rejectionReason,
              rejectionDetail: verdict.rejectionDetail,
              stale: verdict.stale,
              freshness: verdict.freshness,
              participatedInConsensus: verdict.participatedInConsensus,
              weightInConsensus: verdict.weightInConsensus,
              consensusContext,
              contributedToResolution: false,
              resolutionRef: null,
              recordedAt: now
            }
          },
          { upsert: true }
        );
        written += 1;
      }

      logger.oracle('Oracle provenance recorded', {
        marketId,
        batchId: resolvedBatchId,
        observations: written,
        accepted: consensusContext ? consensusContext.providersAccepted.length : 0
      });

      return resolvedBatchId;
    } catch (error) {
      logger.error('Failed to record oracle provenance', {
        marketId,
        batchId: resolvedBatchId,
        error: error.message
      });
      return resolvedBatchId;
    }
  }

  /**
   * Link a recorded batch to a finalised market resolution. Only ever sets the
   * linkage fields — it never rewrites a record's validation verdict, so a
   * response that was rejected/stale stays that way in the historical trail.
   *
   * Must be called only AFTER the real resolution state transition has
   * succeeded (issue #241 §9, §20).
   *
   * @param {Object} params
   * @param {string} params.marketId
   * @param {string} params.batchId
   * @param {Object} params.resolution { resolvedOutcome, resolvedAt, resolutionTransactionHash, resolvedBy, consensusReached, agreementRatio }
   * @returns {Promise<number>} number of records linked
   */
  async linkResolution({ marketId, batchId, resolution } = {}) {
    if (!marketId || !batchId || !resolution || !resolution.resolvedOutcome) {
      return 0;
    }

    const resolutionRef = {
      resolvedOutcome: resolution.resolvedOutcome,
      resolvedAt: resolution.resolvedAt || new Date(),
      resolutionTransactionHash: resolution.resolutionTransactionHash || null,
      resolvedBy: resolution.resolvedBy || 'oracle',
      consensusReached:
        resolution.consensusReached === undefined ? null : resolution.consensusReached,
      agreementRatio:
        resolution.agreementRatio === undefined ? null : resolution.agreementRatio
    };

    try {
      const records = await OracleProvenanceRecord.find({ marketId: String(marketId), batchId }).lean();
      if (!records || records.length === 0) {
        logger.warn('No oracle provenance records to link for resolution', { marketId, batchId });
        return 0;
      }

      let linked = 0;
      for (const record of records) {
        // A record "contributed" iff it was accepted into consensus AND its
        // outcome matches the outcome the market actually resolved to.
        const contributed = Boolean(
          record.participatedInConsensus &&
            record.normalizedOutcome &&
            record.normalizedOutcome === resolution.resolvedOutcome
        );

        await OracleProvenanceRecord.updateOne(
          { _id: record._id },
          { $set: { contributedToResolution: contributed, resolutionRef } }
        );
        linked += 1;
      }

      logger.oracle('Oracle provenance linked to resolution', {
        marketId,
        batchId,
        linked,
        resolvedOutcome: resolution.resolvedOutcome
      });

      return linked;
    } catch (error) {
      logger.error('Failed to link oracle provenance to resolution', {
        marketId,
        batchId,
        error: error.message
      });
      return 0;
    }
  }
}

const instance = new OracleProvenanceRecorder();
instance.sanitizeMetadata = sanitizeMetadata;
instance.deriveVerdict = deriveVerdict;
instance.buildConsensusContext = buildConsensusContext;
instance.OracleProvenanceRecorder = OracleProvenanceRecorder;

module.exports = instance;

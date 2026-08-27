const { Market, OracleProvenanceRecord } = require('../models');
const logger = require('../config/logger');
const { NotFoundError } = require('../middleware/errorHandler');

/**
 * Oracle Data Provenance API (#241)
 *
 * GET /api/markets/:id/resolution/provenance
 *
 * Audit-friendly view of the OFF-CHAIN oracle-provider layer for a market: every
 * provider response that entered the resolution pipeline, its validation verdict
 * (valid / rejected / stale) and reason, whether it participated in consensus,
 * and — for a resolved market — which observations actually contributed to the
 * final outcome plus the consensus decision context.
 *
 * Complementary to GET /api/markets/:id/resolution, which exposes the on-chain
 * submission/finalisation trail.
 */

/** Map a stored provenance record to the public, audit-friendly shape. */
function toObservation(record) {
  return {
    provider: record.provider,
    providerRequestId: record.providerRequestId || null,
    batchId: record.batchId,
    receivedAt: record.receivedAt,
    normalizedOutcome: record.normalizedOutcome || null,
    confidence: record.confidence ?? null,
    numericValue: record.numericValue ?? null,
    sourceValue: record.sourceValue ?? null,
    responseMetadata: record.responseMetadata ?? null,
    validationStatus: record.validationStatus,
    rejectionReason: record.rejectionReason || null,
    rejectionDetail: record.rejectionDetail || null,
    stale: Boolean(record.stale),
    freshness: record.freshness || null,
    participatedInConsensus: Boolean(record.participatedInConsensus),
    weightInConsensus: record.weightInConsensus ?? null,
    contributedToResolution: Boolean(record.contributedToResolution)
  };
}

/**
 * Group records by resolution attempt (batchId) so the decision path is
 * reconstructable per attempt, newest attempt last.
 */
function buildAttempts(records) {
  const byBatch = new Map();

  for (const record of records) {
    if (!byBatch.has(record.batchId)) {
      byBatch.set(record.batchId, {
        batchId: record.batchId,
        recordedAt: record.recordedAt || record.createdAt || record.receivedAt,
        consensusContext: record.consensusContext || null,
        resolutionRef: record.resolutionRef || null,
        observations: []
      });
    }
    byBatch.get(record.batchId).observations.push(record);
  }

  return Array.from(byBatch.values())
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
    .map((attempt) => {
      const accepted = attempt.observations.filter((o) => o.validationStatus === 'valid');
      const rejected = attempt.observations.filter((o) => o.validationStatus === 'rejected');
      const stale = attempt.observations.filter((o) => o.validationStatus === 'stale');
      const contributed = attempt.observations.filter((o) => o.contributedToResolution);

      return {
        batchId: attempt.batchId,
        recordedAt: attempt.recordedAt,
        observationCount: attempt.observations.length,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        staleCount: stale.length,
        acceptedProviders: accepted.map((o) => o.provider),
        rejectedProviders: rejected.map((o) => ({
          provider: o.provider,
          reason: o.rejectionReason
        })),
        staleProviders: stale.map((o) => o.provider),
        contributingProviders: contributed.map((o) => o.provider),
        consensusContext: attempt.consensusContext || null,
        resolutionRef: attempt.resolutionRef || null
      };
    });
}

class OracleProvenanceController {
  /**
   * GET /api/markets/:id/resolution/provenance
   */
  static async getMarketProvenance(req, res) {
    const { id } = req.params;

    const market = await Market.findOne({ marketId: id }).lean();
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    const records = await OracleProvenanceRecord.find({ marketId: id })
      .sort({ receivedAt: 1 })
      .lean();

    const observations = records.map(toObservation);
    const attempts = buildAttempts(records);
    const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

    // A resolved market with no provenance records predates this feature; say so
    // rather than fabricating a trail (#241 §21).
    const marketResolved = market.status === 'resolved' || Boolean(market.resolvedOutcome);
    const legacyResolution = marketResolved && records.length === 0;

    logger.info('Oracle provenance data assembled', {
      marketId: id,
      observationCount: observations.length,
      attemptCount: attempts.length,
      legacyResolution
    });

    res.json({
      success: true,
      data: {
        marketId: id,
        resolution: {
          status: market.status,
          resolvedOutcome: market.resolvedOutcome || null,
          resolvedAt: market.resolvedAt || null,
          resolvedBy: market.resolvedBy || null,
          resolutionTransactionHash: market.resolutionTransactionHash || null,
          finalizationTxHash: market.resolutionFinalizationTxHash || null,
          finalizationTimestamp: market.resolutionFinalizationTimestamp || null
        },
        observations,
        attempts,
        decision_context: latestAttempt
          ? {
              batchId: latestAttempt.batchId,
              consensusContext: latestAttempt.consensusContext,
              resolutionRef: latestAttempt.resolutionRef,
              contributingProviders: latestAttempt.contributingProviders
            }
          : null,
        legacy_resolution: legacyResolution
      }
    });
  }
}

module.exports = OracleProvenanceController;

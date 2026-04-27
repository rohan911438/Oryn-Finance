const { Market, ResolutionEvent } = require('../models');
const sorobanService = require('../services/sorobanService');
const logger = require('../config/logger');
const { NotFoundError } = require('../middleware/errorHandler');

/**
 * Derive resolution_status from market document and resolution events.
 * Priority order (highest to lowest):
 *   1. finalized  — market has a resolutionFinalizationTxHash
 *   2. dispute_period — any event with eventType 'resolution_disputed'
 *   3. consensus_reached — any event with eventType 'consensus_reached'
 *   4. in_progress — any event with eventType 'oracle_submission'
 *   5. manual_required — market.oracleSource === 'manual'
 *   6. pending — default
 */
function deriveResolutionStatus(market, events) {
  if (market.resolutionFinalizationTxHash) {
    return 'finalized';
  }
  if (events.some(e => e.eventType === 'resolution_disputed')) {
    return 'dispute_period';
  }
  if (events.some(e => e.eventType === 'consensus_reached')) {
    return 'consensus_reached';
  }
  if (events.some(e => e.eventType === 'oracle_submission')) {
    return 'in_progress';
  }
  if (market.oracleSource === 'manual') {
    return 'manual_required';
  }
  return 'pending';
}

/**
 * Build the submissions array from oracle_submission events.
 */
function buildSubmissions(events) {
  return events
    .filter(e => e.eventType === 'oracle_submission')
    .map(e => ({
      oracleAddress: e.actorAddress,
      outcome: e.outcome ? 'yes' : 'no',
      confidenceScore: e.confidenceScore,
      submittedAt: e.timestamp,
      txHash: e.txHash,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${e.txHash}`
    }));
}

/**
 * Compute vote_tally from oracle_submission events.
 * Returns { yes, no, threshold }
 */
function computeVoteTally(events) {
  const submissionEvents = events.filter(e => e.eventType === 'oracle_submission');
  const yes = submissionEvents.filter(e => e.outcome === true).length;
  const no = submissionEvents.filter(e => e.outcome === false).length;
  return { yes, no, threshold: 2 };
}

/**
 * Determine source_disagreement: true when submissions contain both
 * outcome: true and outcome: false.
 */
function computeSourceDisagreement(events) {
  const submissionEvents = events.filter(e => e.eventType === 'oracle_submission');
  const hasYes = submissionEvents.some(e => e.outcome === true);
  const hasNo = submissionEvents.some(e => e.outcome === false);
  return hasYes && hasNo;
}

/**
 * Compute aggregated_result from oracle_submission events.
 */
function computeAggregatedResult(events) {
  const submissionEvents = events.filter(e => e.eventType === 'oracle_submission');

  let yesWeight = 0;
  let noWeight = 0;
  const breakdown = [];

  for (const event of submissionEvents) {
    const score = event.confidenceScore || 0;
    if (event.outcome === true) {
      yesWeight += score;
    } else {
      noWeight += score;
    }
    breakdown.push({
      source: event.actorAddress,
      outcome: event.outcome ? 'yes' : 'no',
      confidence: score,
      weight: score
    });
  }

  const total = yesWeight + noWeight;
  const confidence = total > 0 ? yesWeight / total : 0;
  const outcome = yesWeight >= noWeight ? 'yes' : 'no';

  return {
    outcome,
    method: 'weighted',
    yes_weight: yesWeight,
    no_weight: noWeight,
    confidence,
    low_confidence: confidence < 0.6,
    breakdown
  };
}

/**
 * Build the audit_trail array from all resolution events.
 */
function buildAuditTrail(events) {
  return events.map(event => ({
    eventType: event.eventType,
    actorAddress: event.actorAddress,
    payload: event.payload,
    ledger: event.ledger,
    txHash: event.txHash,
    timestamp: event.timestamp,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${event.txHash}`
  }));
}

class ResolutionController {
  /**
   * GET /api/markets/:id/resolution
   * Returns full resolution transparency data for a market.
   */
  static async getMarketResolution(req, res) {
    const { id } = req.params;

    // 1. Look up the market
    const market = await Market.findOne({ marketId: id }).lean();
    if (!market) {
      throw new NotFoundError('Market not found');
    }

    // 2. Query all ResolutionEvent documents for the market, sorted ascending
    const events = await ResolutionEvent.find({ marketId: id })
      .sort({ timestamp: 1, ledger: 1 })
      .lean();

    // 3. Derive resolution_status
    const resolution_status = deriveResolutionStatus(market, events);

    // 4. Build submissions array from oracle_submission events
    const submissionsArray = buildSubmissions(events);

    // 5. Compute vote_tally
    const vote_tally = computeVoteTally(events);

    // 6. Compute source_disagreement
    const source_disagreement = computeSourceDisagreement(events);

    // 7. Compute aggregated_result
    const aggregated_result = computeAggregatedResult(events);

    // 8. Assemble dispute_info (base — live Soroban query attempted below)
    const dispute_info = {
      deadline: null,
      seconds_remaining: null,
      finalization_tx_hash: market.resolutionFinalizationTxHash || null,
      finalization_timestamp: market.resolutionFinalizationTimestamp || null
    };

    // 9. Build audit_trail
    const audit_trail = buildAuditTrail(events);

    // 10. Attempt live Soroban query for dispute deadline (3000ms timeout)
    let contractDataUnavailable = false;
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Soroban query timeout')), 3000)
      );

      const sorobanPromise = sorobanService.queryContract(
        'ORACLE_RESOLVER',
        'getMarketResolution',
        [id]
      );

      const contractResult = await Promise.race([sorobanPromise, timeoutPromise]);

      if (contractResult && contractResult.result) {
        const data = contractResult.result;
        if (data.disputeDeadline) {
          const deadline = new Date(data.disputeDeadline * 1000);
          dispute_info.deadline = deadline.toISOString();
          dispute_info.seconds_remaining = Math.max(
            0,
            Math.floor((deadline.getTime() - Date.now()) / 1000)
          );
        }
      }
    } catch (err) {
      logger.warn(`Soroban query failed for market ${id} resolution:`, err.message);
      contractDataUnavailable = true;
    }

    logger.info('Market resolution data assembled', {
      marketId: id,
      resolution_status,
      submissionCount: submissionsArray.length,
      auditTrailCount: audit_trail.length,
      contractDataUnavailable
    });

    // 11. Return assembled response
    res.json({
      success: true,
      data: {
        marketId: id,
        oracle_source: market.oracleSource || 'manual',
        oracle_config: market.oracleConfig || {},
        resolution_status,
        submissions: submissionsArray,
        vote_tally,
        source_disagreement,
        aggregated_result,
        dispute_info,
        audit_trail,
        contract_data_unavailable: contractDataUnavailable
      }
    });
  }
}

module.exports = ResolutionController;

/**
 * OracleConsensusEngine (#219)
 *
 * Pure, stateless consensus computation for a batch of oracle responses.
 * Given raw responses from one or more oracle providers, it:
 *   1. Validates each response has the fields required to be considered.
 *   2. Rejects stale responses (older than a configurable max age).
 *   3. Rejects statistical outliers among numeric measurements (robust
 *      median/MAD z-score), when enough numeric samples are present.
 *   4. Computes a weighted vote over the remaining responses and checks the
 *      result against a configurable consensus threshold.
 *
 * The engine has no knowledge of markets, providers, or persistence — callers
 * (e.g. oracleService) supply weights/config and are responsible for logging
 * and audit persistence. This keeps the algorithm easy to unit test and reuse
 * outside the market-resolution flow.
 */

const DEFAULT_WEIGHT = 0.5;
const DEFAULT_CONSENSUS_THRESHOLD = 0.6;
const DEFAULT_MIN_RESPONSES = 1;
const DEFAULT_OUTLIER_THRESHOLD = 3.5; // robust z-score (MAD-based) cutoff
const MIN_SAMPLES_FOR_OUTLIER_DETECTION = 3;

function toTimestampMs(value) {
  if (value === undefined || value === null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

class OracleConsensusEngine {
  /**
   * Evaluate a batch of oracle responses and produce a consensus decision.
   *
   * @param {Array<Object>} responses - raw oracle responses:
   *   { source, outcome: 'yes'|'no', confidence?: number, value?: number, timestamp?: string|number|Date, weight?: number }
   * @param {Object} [options]
   * @param {Function} [options.weightResolver] - (source) => number
   * @param {number} [options.defaultWeight]
   * @param {number} [options.maxAgeMs] - staleness threshold; responses older than this are rejected. Omit/Infinity to disable.
   * @param {number} [options.outlierThreshold] - robust z-score cutoff for numeric outlier rejection
   * @param {number} [options.consensusThreshold] - fraction (0-1) of total weight required to agree on an outcome
   * @param {number} [options.minResponses] - minimum valid responses required to reach consensus
   * @param {number} [options.now] - injectable "current time" in ms, for deterministic tests
   * @returns {Object} decision
   */
  evaluate(responses, options = {}) {
    const {
      weightResolver = () => DEFAULT_WEIGHT,
      defaultWeight = DEFAULT_WEIGHT,
      maxAgeMs = Infinity,
      outlierThreshold = DEFAULT_OUTLIER_THRESHOLD,
      consensusThreshold = DEFAULT_CONSENSUS_THRESHOLD,
      minResponses = DEFAULT_MIN_RESPONSES,
      now = Date.now()
    } = options;

    const rejected = { invalid: [], stale: [], outliers: [] };
    const candidates = [];

    for (const response of responses || []) {
      const source = response?.source;
      const outcome = response?.outcome;

      if (!source || (outcome !== 'yes' && outcome !== 'no')) {
        rejected.invalid.push({ source: source || 'unknown', reason: 'missing_source_or_outcome' });
        continue;
      }

      const timestampMs = toTimestampMs(response.timestamp);
      if (response.timestamp !== undefined && timestampMs === null) {
        rejected.invalid.push({ source, reason: 'invalid_timestamp' });
        continue;
      }

      const ageMs = timestampMs === null ? 0 : now - timestampMs;
      if (Number.isFinite(maxAgeMs) && timestampMs !== null && ageMs > maxAgeMs) {
        rejected.stale.push({ source, timestamp: response.timestamp, ageMs, maxAgeMs });
        continue;
      }

      const confidence = Number.isFinite(response.confidence) ? response.confidence : 1;
      const baseWeight = Number.isFinite(response.weight) ? response.weight : weightResolver(source) ?? defaultWeight;

      candidates.push({
        source,
        outcome,
        value: Number.isFinite(response.value) ? response.value : null,
        confidence,
        weight: baseWeight * confidence,
        ageMs,
        timestamp: response.timestamp || null
      });
    }

    const withNumericValue = candidates.filter((c) => c.value !== null);
    let survivors = candidates;

    if (withNumericValue.length >= MIN_SAMPLES_FOR_OUTLIER_DETECTION) {
      const values = withNumericValue.map((c) => c.value);
      const med = median(values);
      const absDeviations = values.map((v) => Math.abs(v - med));
      const mad = median(absDeviations);

      const outlierSources = new Set();
      if (mad > 0) {
        for (const candidate of withNumericValue) {
          // 0.6745 scales MAD to be comparable to a standard deviation under normality.
          const robustZ = (0.6745 * (candidate.value - med)) / mad;
          if (Math.abs(robustZ) > outlierThreshold) {
            outlierSources.add(candidate.source);
            rejected.outliers.push({
              source: candidate.source,
              value: candidate.value,
              robustZ: Number(robustZ.toFixed(3)),
              threshold: outlierThreshold
            });
          }
        }
      }

      if (outlierSources.size > 0) {
        survivors = candidates.filter((c) => !outlierSources.has(c.source));
      }
    }

    const weightByOutcome = { yes: 0, no: 0 };
    for (const candidate of survivors) {
      weightByOutcome[candidate.outcome] += candidate.weight;
    }
    const totalWeight = weightByOutcome.yes + weightByOutcome.no;

    const winningOutcome = weightByOutcome.yes >= weightByOutcome.no ? 'yes' : 'no';
    const agreementRatio = totalWeight > 0 ? weightByOutcome[winningOutcome] / totalWeight : 0;

    const consensusReached = survivors.length >= minResponses
      && totalWeight > 0
      && agreementRatio >= consensusThreshold;

    return {
      finalOutcome: consensusReached ? winningOutcome : null,
      consensusReached,
      agreementRatio: Number(agreementRatio.toFixed(4)),
      totalWeight: Number(totalWeight.toFixed(4)),
      weightByOutcome: {
        yes: Number(weightByOutcome.yes.toFixed(4)),
        no: Number(weightByOutcome.no.toFixed(4))
      },
      participants: survivors.map((c) => ({
        source: c.source,
        outcome: c.outcome,
        value: c.value,
        confidence: c.confidence,
        weight: Number(c.weight.toFixed(4)),
        ageMs: c.ageMs
      })),
      rejected,
      consensusThreshold,
      minResponses,
      evaluatedResponseCount: (responses || []).length,
      evaluatedAt: new Date(now).toISOString()
    };
  }
}

module.exports = new OracleConsensusEngine();
module.exports.OracleConsensusEngine = OracleConsensusEngine;

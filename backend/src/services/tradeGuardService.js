const logger = require('../config/logger');

/**
 * TradeGuardService (#242 — MEV & Price-Manipulation Protection)
 *
 * Pre-trade execution gate that runs in the authoritative backend trade path
 * (`tradeController.executeTrade`), BEFORE a trade is persisted or handed to the
 * batcher/on-chain execution. It enforces the caller's declared execution
 * bounds and rejects abnormal execution conditions.
 *
 * This complements — it does not replace — the protections that already exist:
 *   - `circuitBreakerService`  : emergency pause, cooldown, recent-price
 *                                deviation, trade-size vs liquidity, per-user
 *                                rate limits, volume spikes, drawdown.
 *   - `amm-pool` Soroban contract : reentrancy guard, `min_out` slippage,
 *                                price-impact cap, circuit breaker, trading
 *                                limits, emergency/drawdown pause. This is the
 *                                ultimate authoritative layer for on-chain
 *                                settlement.
 *
 * What this service adds that was missing: an enforced bound between the price
 * the caller was quoted / committed to and the price the trade actually
 * executes at after partial-fill re-pricing, plus a deviation check against a
 * manipulation-resistant reference price and an explicit stale-reference rule.
 *
 * DETECT vs PREVENT: every check here PREVENTS (rejects the trade). Heuristic
 * anomaly *detection* stays in `manipulationDetector`.
 *
 * Limitations (see docs/mev-price-manipulation-protection.md):
 *   - Does not eliminate MEV. It bounds execution loss and rejects abnormal
 *     execution according to configurable rules.
 *   - The reference price is an internal manipulation-resistant recent average,
 *     not an external oracle. A prediction-market token has no external spot
 *     price; the oracle resolves the final OUTCOME, not a live probability.
 */

const VIOLATION = Object.freeze({
  DISABLED: 'DISABLED',
  QUOTE_REQUIRED: 'QUOTE_REQUIRED',
  SLIPPAGE_EXCEEDED: 'SLIPPAGE_EXCEEDED',
  EXECUTION_BOUND_VIOLATED: 'EXECUTION_BOUND_VIOLATED',
  REFERENCE_DEVIATION: 'REFERENCE_DEVIATION',
  STALE_REFERENCE: 'STALE_REFERENCE',
  TRADE_VALUE_TOO_LOW: 'TRADE_VALUE_TOO_LOW'
});

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  // Execution slippage cap between quoted price and actual fill price.
  // 500 bps (5%) mirrors the contract's MAX_SLIPPAGE_BPS.
  maxSlippageBps: 500,
  // Deviation cap between the actual fill price and the manipulation-resistant
  // reference. 1000 bps (10%) mirrors circuitBreakerService.priceDeviationThreshold.
  maxReferenceDeviationBps: 1000,
  // Reference older than this is considered stale.
  maxReferenceAgeMs: 5 * 60 * 1000,
  // Below this many samples there is no trustworthy reference; the reference
  // checks are skipped (not failed).
  minReferenceSamples: 3,
  // 'reject' -> stale reference blocks the trade; 'ignore' -> reference checks
  // are skipped when the reference is stale. Never silently trusts stale data.
  staleReferencePolicy: 'reject',
  // Minimum notional value of a trade (dust / spam guard).
  minTradeValue: 0.01,
  // When true, a trade with no quoted price is rejected instead of skipping the
  // slippage check.
  requireQuote: false,
  // Tolerance for floating point comparison of absolute bounds.
  boundEpsilon: 1e-9
});

const ENV_OVERRIDES = {
  TRADE_GUARD_ENABLED: (v, c) => { c.enabled = v !== 'false' && v !== '0'; },
  TRADE_GUARD_MAX_SLIPPAGE_BPS: (v, c) => { c.maxSlippageBps = Number(v); },
  TRADE_GUARD_MAX_REFERENCE_DEVIATION_BPS: (v, c) => { c.maxReferenceDeviationBps = Number(v); },
  TRADE_GUARD_MAX_REFERENCE_AGE_MS: (v, c) => { c.maxReferenceAgeMs = Number(v); },
  TRADE_GUARD_MIN_REFERENCE_SAMPLES: (v, c) => { c.minReferenceSamples = Number(v); },
  TRADE_GUARD_STALE_REFERENCE_POLICY: (v, c) => { c.staleReferencePolicy = v; },
  TRADE_GUARD_MIN_TRADE_VALUE: (v, c) => { c.minTradeValue = Number(v); },
  TRADE_GUARD_REQUIRE_QUOTE: (v, c) => { c.requireQuote = v === 'true' || v === '1'; }
};

/** Absolute deviation of `value` from `basis`, in basis points (integer). */
function deviationBps(value, basis) {
  if (!Number.isFinite(value) || !Number.isFinite(basis) || basis === 0) return null;
  return Math.round((Math.abs(value - basis) / Math.abs(basis)) * 10_000);
}

class TradeGuardService {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this._loadEnvOverrides();
  }

  _loadEnvOverrides() {
    for (const [key, apply] of Object.entries(ENV_OVERRIDES)) {
      const raw = process.env[key];
      if (raw === undefined || raw === '') continue;
      try {
        apply(raw, this.config);
      } catch (error) {
        logger.warn(`[RISK] Ignoring invalid ${key}`, { value: raw, error: error.message });
      }
    }
    // Guard against nonsensical overrides.
    if (!Number.isFinite(this.config.maxSlippageBps) || this.config.maxSlippageBps < 0) {
      this.config.maxSlippageBps = DEFAULT_CONFIG.maxSlippageBps;
    }
    if (!Number.isFinite(this.config.maxReferenceDeviationBps) || this.config.maxReferenceDeviationBps < 0) {
      this.config.maxReferenceDeviationBps = DEFAULT_CONFIG.maxReferenceDeviationBps;
    }
    if (!['reject', 'ignore'].includes(this.config.staleReferencePolicy)) {
      this.config.staleReferencePolicy = DEFAULT_CONFIG.staleReferencePolicy;
    }
  }

  /** Current configuration (copy). Configurable via env or `setConfig`. */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Merge a partial config. Intended for admin/governance-driven updates and
   * tests. Unknown keys are ignored; invalid values fall back to defaults.
   */
  setConfig(partial = {}) {
    const next = { ...this.config };
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (partial[key] !== undefined) next[key] = partial[key];
    }
    this.config = next;
    this._loadEnvOverrides();
    return this.getConfig();
  }

  static get VIOLATION() {
    return VIOLATION;
  }

  /**
   * Evaluate a fully-priced trade against the configured execution safeguards.
   *
   * @param {Object} params
   * @param {string}  params.marketId
   * @param {'buy'|'sell'} params.tradeType
   * @param {number}  params.filledAmount     token amount that will actually fill
   * @param {number}  params.quotedPrice      price the caller was quoted / committed to (0-1)
   * @param {number}  params.executedPrice    final price after partial-fill re-pricing (0-1)
   * @param {number}  params.totalCost        final notional (cost for buy, proceeds basis for sell)
   * @param {number} [params.maxSlippage]     caller slippage tolerance as a fraction (e.g. 0.05)
   * @param {number} [params.maxCost]         absolute max the caller will pay (buy)
   * @param {number} [params.minReceived]     absolute min the caller will receive (sell)
   * @param {number} [params.priceImpact]     price impact of the caller's own trade, as a fraction
   * @param {{price:number, sampleCount:number, ageMs:number}|null} [params.reference]
   * @param {number} [params.now]
   * @returns {{allowed:boolean, violations:Array, metrics:Object}}
   */
  evaluateExecution(params = {}) {
    const cfg = this.config;

    if (!cfg.enabled) {
      return { allowed: true, violations: [], metrics: { skipped: 'disabled' } };
    }

    const {
      marketId = null,
      tradeType,
      filledAmount,
      quotedPrice,
      executedPrice,
      totalCost,
      maxSlippage,
      maxCost,
      minReceived,
      priceImpact,
      reference = null
    } = params;

    const violations = [];
    const maxSlippageBps = Number.isFinite(maxSlippage)
      ? Math.round(maxSlippage * 10_000)
      : cfg.maxSlippageBps;

    const hasQuote = Number.isFinite(quotedPrice) && quotedPrice > 0;
    const hasExec = Number.isFinite(executedPrice) && executedPrice > 0;

    // --- Slippage: quoted price vs actual fill price ----------------------
    let slippageBps = null;
    if (!hasQuote) {
      if (cfg.requireQuote) {
        violations.push({
          code: VIOLATION.QUOTE_REQUIRED,
          message: 'A quoted price is required to enforce slippage protection'
        });
      }
    } else if (hasExec) {
      slippageBps = deviationBps(executedPrice, quotedPrice);
      // Only an adverse move counts against the trader.
      const adverse =
        tradeType === 'sell' ? executedPrice < quotedPrice : executedPrice > quotedPrice;
      if (adverse && slippageBps !== null && slippageBps > maxSlippageBps) {
        violations.push({
          code: VIOLATION.SLIPPAGE_EXCEEDED,
          message: `Execution price moved ${slippageBps} bps against the quote (max ${maxSlippageBps} bps)`,
          observedBps: slippageBps,
          thresholdBps: maxSlippageBps
        });
      }
    }

    // --- Absolute execution bounds -------------------------------------
    const eps = cfg.boundEpsilon;
    if (tradeType === 'buy' && Number.isFinite(maxCost) && Number.isFinite(totalCost)) {
      if (totalCost > maxCost * (1 + eps)) {
        violations.push({
          code: VIOLATION.EXECUTION_BOUND_VIOLATED,
          message: `Total cost ${totalCost} exceeds declared maxCost ${maxCost}`,
          observed: totalCost,
          bound: maxCost
        });
      }
    }
    if (tradeType === 'sell' && Number.isFinite(minReceived) && hasExec && Number.isFinite(filledAmount)) {
      const proceeds = filledAmount * executedPrice;
      if (proceeds < minReceived * (1 - eps)) {
        violations.push({
          code: VIOLATION.EXECUTION_BOUND_VIOLATED,
          message: `Proceeds ${proceeds} fall short of declared minReceived ${minReceived}`,
          observed: proceeds,
          bound: minReceived
        });
      }
    }

    // --- Reference-price deviation & staleness ------------------------
    let referenceDeviationBps = null;
    let referenceStale = false;
    const refUsable =
      reference &&
      Number.isFinite(reference.price) &&
      reference.price > 0 &&
      Number.isFinite(reference.sampleCount) &&
      reference.sampleCount >= cfg.minReferenceSamples;

    if (refUsable) {
      referenceStale =
        Number.isFinite(reference.ageMs) && reference.ageMs > cfg.maxReferenceAgeMs;

      if (referenceStale && cfg.staleReferencePolicy === 'reject') {
        violations.push({
          code: VIOLATION.STALE_REFERENCE,
          message: `Reference price is stale (${reference.ageMs}ms old, max ${cfg.maxReferenceAgeMs}ms); refusing to execute against it`,
          ageMs: reference.ageMs,
          maxAgeMs: cfg.maxReferenceAgeMs
        });
      } else if (!(referenceStale && cfg.staleReferencePolicy === 'ignore') && hasExec) {
        referenceDeviationBps = deviationBps(executedPrice, reference.price);
        if (referenceDeviationBps !== null && referenceDeviationBps > cfg.maxReferenceDeviationBps) {
          violations.push({
            code: VIOLATION.REFERENCE_DEVIATION,
            message: `Execution price deviates ${referenceDeviationBps} bps from the reference (max ${cfg.maxReferenceDeviationBps} bps)`,
            observedBps: referenceDeviationBps,
            thresholdBps: cfg.maxReferenceDeviationBps,
            referencePrice: reference.price
          });
        }
      }
    }

    // --- Dust / spam guard -------------------------------------------
    if (Number.isFinite(totalCost) && totalCost < cfg.minTradeValue) {
      violations.push({
        code: VIOLATION.TRADE_VALUE_TOO_LOW,
        message: `Trade value ${totalCost} is below the minimum ${cfg.minTradeValue}`,
        observed: totalCost,
        bound: cfg.minTradeValue
      });
    }

    const metrics = {
      slippageBps,
      // Price impact from the caller's own trade — reported separately from
      // slippage (state-change loss) and reference deviation (external move).
      priceImpactBps: Number.isFinite(priceImpact) ? Math.round(priceImpact * 10_000) : null,
      referenceDeviationBps,
      referenceStale,
      referenceSamples: reference?.sampleCount ?? 0,
      maxSlippageBps
    };

    const allowed = violations.length === 0;

    if (!allowed) {
      logger.warn('[RISK] Trade rejected by trade guard', {
        marketId,
        tradeType,
        violations: violations.map((v) => v.code),
        metrics
      });
    }

    return { allowed, violations, metrics };
  }
}

const instance = new TradeGuardService();
instance.TradeGuardService = TradeGuardService;
instance.VIOLATION = VIOLATION;
instance.deviationBps = deviationBps;

module.exports = instance;

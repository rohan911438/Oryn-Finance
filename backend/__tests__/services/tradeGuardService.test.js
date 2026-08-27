/**
 * Adversarial + boundary tests for TradeGuardService (#242).
 *
 * Scenario map (from the issue):
 *   A normal trade                         -> allowed
 *   B within slippage boundary             -> allowed
 *   C outside slippage boundary            -> rejected
 *   D abnormal reference deviation         -> rejected
 *   E legitimate market move (in bound)    -> allowed
 *   F trade value too low                  -> rejected
 *   G stale reference                      -> rejected / safe fallback
 *   H sandwich-like state change           -> execution bound violated
 *   I competing (front-run) trade          -> slippage exceeded
 * plus exact boundary values (threshold-1 / threshold / threshold+1),
 * config changes, and event emission.
 */

const logger = require('../../src/config/logger');
const tradeGuard = require('../../src/services/tradeGuardService');
const { VIOLATION } = tradeGuard;

const BASE_CONFIG = tradeGuard.getConfig();

function reset() {
  tradeGuard.setConfig({ ...BASE_CONFIG });
}

/** Fresh, trustworthy reference at a given price. */
function ref(price, overrides = {}) {
  return { price, sampleCount: 10, ageMs: 1000, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  reset();
});

// ---------------------------------------------------------------------------
// A / B / E — trades that must pass
// ---------------------------------------------------------------------------

describe('legitimate trades are allowed', () => {
  it('A: a normal buy at the quoted price passes', () => {
    const res = tradeGuard.evaluateExecution({
      marketId: 'MKT',
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.5,
      totalCost: 50,
      maxSlippage: 0.05,
      reference: ref(0.5)
    });
    expect(res.allowed).toBe(true);
    expect(res.violations).toEqual([]);
  });

  it('B: a fill just inside the slippage boundary passes', () => {
    // maxSlippage 5% -> 500 bps. 0.5 -> 0.5249 is 498 bps.
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.5249,
      totalCost: 52.49,
      maxSlippage: 0.05,
      reference: ref(0.5)
    });
    expect(res.allowed).toBe(true);
  });

  it('E: a legitimate market move within the reference bound passes', () => {
    // reference 0.50, execution 0.54 -> 800 bps, under the 1000 bps default.
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.54,
      executedPrice: 0.54,
      totalCost: 54,
      maxSlippage: 0.05,
      reference: ref(0.5)
    });
    expect(res.allowed).toBe(true);
    expect(res.metrics.referenceDeviationBps).toBe(800);
  });

  it('does not penalise a favourable price move beyond the slippage tolerance', () => {
    // Buyer quoted 0.5, fills at 0.40 — 2000 bps better for the buyer.
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.4,
      totalCost: 40,
      maxSlippage: 0.05,
      reference: ref(0.4)
    });
    expect(res.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C / I — slippage
// ---------------------------------------------------------------------------

describe('slippage protection', () => {
  it('C: a fill outside the slippage boundary is rejected', () => {
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.60, // 2000 bps adverse
      totalCost: 60,
      maxSlippage: 0.05,
      reference: ref(0.55)
    });
    expect(res.allowed).toBe(false);
    expect(res.violations[0].code).toBe(VIOLATION.SLIPPAGE_EXCEEDED);
    expect(res.violations[0].observedBps).toBe(2000);
  });

  it('exact boundary: threshold-1 passes, threshold passes, threshold+1 fails', () => {
    const atBps = (bps) => tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 1,
      executedPrice: 1 + bps / 10_000, // exact bps above quote
      totalCost: 100,
      maxSlippage: 0.05, // 500 bps
      reference: null
    }).allowed;

    expect(atBps(499)).toBe(true);
    expect(atBps(500)).toBe(true);
    expect(atBps(501)).toBe(false);
  });

  it('I: a competing (front-running) trade that moves the price adversely trips slippage', () => {
    // Victim signed with quotedPrice 0.50 and 3% tolerance. A front-run trade
    // pushed the fill to 0.55 before the victim executed.
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.55, // 1000 bps adverse, tolerance 300 bps
      totalCost: 55,
      maxSlippage: 0.03,
      reference: ref(0.5)
    });
    expect(res.allowed).toBe(false);
    expect(res.violations.map((v) => v.code)).toContain(VIOLATION.SLIPPAGE_EXCEEDED);
  });

  it('sell side: an adverse downward move trips slippage, an upward move does not', () => {
    const adverse = tradeGuard.evaluateExecution({
      tradeType: 'sell',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.44, // 1200 bps worse for a seller
      totalCost: 100,
      maxSlippage: 0.05,
      reference: ref(0.47)
    });
    expect(adverse.allowed).toBe(false);
    expect(adverse.violations[0].code).toBe(VIOLATION.SLIPPAGE_EXCEEDED);

    const favourable = tradeGuard.evaluateExecution({
      tradeType: 'sell',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.60,
      totalCost: 100,
      maxSlippage: 0.05,
      reference: ref(0.55)
    });
    expect(favourable.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Absolute execution bounds — H
// ---------------------------------------------------------------------------

describe('absolute execution bounds', () => {
  it('rejects a buy whose total cost exceeds maxCost', () => {
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.5,
      totalCost: 50,
      maxCost: 49.99,
      reference: null
    });
    expect(res.allowed).toBe(false);
    expect(res.violations[0].code).toBe(VIOLATION.EXECUTION_BOUND_VIOLATED);
  });

  it('allows a buy whose total cost is exactly maxCost', () => {
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.5,
      totalCost: 50,
      maxCost: 50,
      reference: null
    });
    expect(res.allowed).toBe(true);
  });

  it('H: a sandwich-like reserve change that drops proceeds below minReceived is rejected', () => {
    // Victim wants at least 48 for selling 100 tokens. An attacker trade moved
    // the pool so the fill price is only 0.45 -> proceeds 45.
    const res = tradeGuard.evaluateExecution({
      tradeType: 'sell',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.45,
      totalCost: 100,
      minReceived: 48,
      maxSlippage: 0.2, // wide, so only the absolute bound bites
      reference: ref(0.47)
    });
    expect(res.allowed).toBe(false);
    expect(res.violations.map((v) => v.code)).toContain(VIOLATION.EXECUTION_BOUND_VIOLATED);
  });

  it('allows a sell whose proceeds meet minReceived exactly', () => {
    const res = tradeGuard.evaluateExecution({
      tradeType: 'sell',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.5,
      totalCost: 100,
      minReceived: 50,
      maxSlippage: 0.05,
      reference: ref(0.5)
    });
    expect(res.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D — reference deviation
// ---------------------------------------------------------------------------

describe('reference-price deviation', () => {
  it('D: an execution far from the reference is rejected', () => {
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.8,
      executedPrice: 0.8, // reference 0.5 -> 6000 bps
      totalCost: 80,
      maxSlippage: 0.05,
      reference: ref(0.5)
    });
    expect(res.allowed).toBe(false);
    expect(res.violations.map((v) => v.code)).toContain(VIOLATION.REFERENCE_DEVIATION);
  });

  it('boundary: reference deviation threshold-1 / threshold / threshold+1', () => {
    tradeGuard.setConfig({ maxReferenceDeviationBps: 1000 });
    const atBps = (bps) => tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 1 + bps / 10_000,
      executedPrice: 1 + bps / 10_000,
      totalCost: 100,
      maxSlippage: 1, // disable slippage check
      reference: ref(1)
    }).allowed;

    expect(atBps(999)).toBe(true);
    expect(atBps(1000)).toBe(true);
    expect(atBps(1001)).toBe(false);
  });

  it('skips the reference check when there are too few samples', () => {
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.9,
      executedPrice: 0.9,
      totalCost: 90,
      maxSlippage: 1,
      reference: ref(0.5, { sampleCount: 2 }) // below minReferenceSamples (3)
    });
    expect(res.allowed).toBe(true);
    expect(res.metrics.referenceDeviationBps).toBeNull();
  });

  it('skips the reference check when no reference is available', () => {
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.9,
      executedPrice: 0.9,
      totalCost: 90,
      maxSlippage: 1,
      reference: null
    });
    expect(res.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G — stale reference
// ---------------------------------------------------------------------------

describe('stale reference handling', () => {
  it('G: rejects the trade when the reference is stale (default policy)', () => {
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.5,
      totalCost: 50,
      maxSlippage: 0.05,
      reference: ref(0.5, { ageMs: 10 * 60 * 1000 }) // 10 min, max 5 min
    });
    expect(res.allowed).toBe(false);
    expect(res.violations[0].code).toBe(VIOLATION.STALE_REFERENCE);
    expect(res.metrics.referenceStale).toBe(true);
  });

  it("G: with policy 'ignore', a stale reference is skipped rather than trusted", () => {
    tradeGuard.setConfig({ staleReferencePolicy: 'ignore' });
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.9,
      executedPrice: 0.9, // would be a huge deviation from the 0.5 reference
      totalCost: 90,
      maxSlippage: 1,
      reference: ref(0.5, { ageMs: 10 * 60 * 1000 })
    });
    expect(res.allowed).toBe(true);
    expect(res.metrics.referenceStale).toBe(true);
    expect(res.metrics.referenceDeviationBps).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F — dust guard
// ---------------------------------------------------------------------------

describe('minimum trade value', () => {
  it('F: rejects a dust trade below the minimum value', () => {
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 0.001,
      quotedPrice: 0.5,
      executedPrice: 0.5,
      totalCost: 0.0005, // below default minTradeValue 0.01
      maxSlippage: 0.05,
      reference: null
    });
    expect(res.allowed).toBe(false);
    expect(res.violations[0].code).toBe(VIOLATION.TRADE_VALUE_TOO_LOW);
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('configuration', () => {
  it('is a no-op when disabled', () => {
    tradeGuard.setConfig({ enabled: false });
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.99,
      totalCost: 99,
      maxSlippage: 0.01,
      reference: ref(0.5)
    });
    expect(res.allowed).toBe(true);
    expect(res.metrics.skipped).toBe('disabled');
  });

  it('requireQuote rejects a trade with no quoted price', () => {
    tradeGuard.setConfig({ requireQuote: true });
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      executedPrice: 0.5,
      totalCost: 50,
      maxSlippage: 0.05,
      reference: null
    });
    expect(res.allowed).toBe(false);
    expect(res.violations[0].code).toBe(VIOLATION.QUOTE_REQUIRED);
  });

  it('getConfig returns a copy that cannot mutate internal state', () => {
    const cfg = tradeGuard.getConfig();
    cfg.maxSlippageBps = 1;
    expect(tradeGuard.getConfig().maxSlippageBps).toBe(BASE_CONFIG.maxSlippageBps);
  });

  it('setConfig tightens the slippage cap for subsequent evaluations', () => {
    tradeGuard.setConfig({ maxSlippageBps: 100 }); // 1%
    const res = tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.515, // 300 bps
      totalCost: 51.5,
      reference: null
    });
    expect(res.allowed).toBe(false);
    expect(res.violations[0].code).toBe(VIOLATION.SLIPPAGE_EXCEEDED);
  });
});

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

describe('observability', () => {
  it('logs a structured warning when a trade is rejected', () => {
    tradeGuard.evaluateExecution({
      marketId: 'MKT-log',
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.8,
      totalCost: 80,
      maxSlippage: 0.05,
      reference: ref(0.5)
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[RISK] Trade rejected by trade guard',
      expect.objectContaining({ marketId: 'MKT-log' })
    );
  });

  it('does not log when a trade is allowed', () => {
    tradeGuard.evaluateExecution({
      tradeType: 'buy',
      filledAmount: 100,
      quotedPrice: 0.5,
      executedPrice: 0.5,
      totalCost: 50,
      maxSlippage: 0.05,
      reference: ref(0.5)
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// helper
// ---------------------------------------------------------------------------

describe('deviationBps', () => {
  it('computes absolute deviation in integer basis points', () => {
    expect(tradeGuard.deviationBps(0.55, 0.5)).toBe(1000);
    expect(tradeGuard.deviationBps(0.45, 0.5)).toBe(1000);
    expect(tradeGuard.deviationBps(0.5, 0.5)).toBe(0);
  });

  it('returns null for a zero or non-finite basis', () => {
    expect(tradeGuard.deviationBps(1, 0)).toBeNull();
    expect(tradeGuard.deviationBps(NaN, 1)).toBeNull();
  });
});

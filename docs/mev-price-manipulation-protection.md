# MEV & Price-Manipulation Protection (#242)

## Scope of this document

Oryn already carries a substantial protection suite. This document describes
what exists, what this PR **adds**, where each safeguard is **enforced**, and —
explicitly — what it does **not** protect against.

> This implementation does **not** claim to be "MEV-proof". It bounds execution
> loss and rejects abnormal execution according to configurable rules.

## Enforcement layers

| Layer | Authority | Safeguards |
|---|---|---|
| **`amm-pool` Soroban contract** (`contracts/amm-pool/src/lib.rs`) | **Authoritative for on-chain settlement** | reentrancy guard; `min_out` slippage; price-impact cap (`MAX_SLIPPAGE_BPS`); per-window trade count + trade-size cap (`MAX_TRADE_SIZE_BPS`, 5% of reserves); post-trade circuit breaker on price deviation (`CIRCUIT_BREAKER_THRESHOLD_BPS`, 10%) with cooldown; liquidity-imbalance detection; drawdown auto-emergency-pause (`MAX_DRAWDOWN_BPS`, 20%); admin `trigger/reset_circuit_breaker`, `activate/deactivate_emergency_pause`, `update_trading_limits_config`. |
| **Backend `circuitBreakerService`** | Pre-trade gate in `tradeController.executeTrade` | emergency pause; circuit-breaker cooldown; recent-average price-deviation trip (10%); trade-size vs pool liquidity (5%); per-user rolling-window rate limit; volume-spike alerting. Rejections raise `ValidationError` (HTTP 400). |
| **Backend `manipulationDetector`** | Post-trade, async | heuristic **detection** only (wash trading, order spam, volume spike, single-trade price move) → alerts + WebSocket admin broadcast. Does not block. |
| **Backend `tradeGuardService`** — *added by this PR* | Pre-trade gate in `tradeController.executeTrade`, before the trade is persisted or batched | execution-bound enforcement (see below). Rejections raise `ValidationError` (HTTP 400). |

## What this PR adds

### 1. `tradeGuardService` — enforced execution bounds

`tradeController.executeTrade` computes the fill price **after partial-fill
re-pricing** but previously never re-checked that the trader still got an
acceptable deal — `maxSlippage` was only compared against a rough pre-trade
estimate (a hard-coded `0.01` when no contract price was available). A signed
trade intent carried no absolute bound the server guaranteed.

`tradeGuardService.evaluateExecution({...})` runs on the final, fully-priced
trade and rejects it (`ValidationError` → 400) when any of the following hold:

| Violation code | Condition |
|---|---|
| `SLIPPAGE_EXCEEDED` | The **adverse** deviation between the caller's `quotedPrice` and the actual `executedPrice` exceeds `maxSlippage` (per-request) or `maxSlippageBps` (config default 500 = 5%). Favourable moves are never rejected. |
| `EXECUTION_BOUND_VIOLATED` | `buy`: final `totalCost > maxCost`. `sell`: `filledAmount * executedPrice < minReceived`. `maxCost` / `minReceived` are optional absolute bounds supplied in the request body. |
| `REFERENCE_DEVIATION` | `executedPrice` deviates from the manipulation-resistant reference by more than `maxReferenceDeviationBps` (default 1000 = 10%). Skipped when fewer than `minReferenceSamples` (default 3) samples exist. |
| `STALE_REFERENCE` | The reference is older than `maxReferenceAgeMs` (default 5 min) and `staleReferencePolicy` is `reject` (default). With policy `ignore`, the reference checks are skipped — a stale reference is **never silently trusted**. |
| `TRADE_VALUE_TOO_LOW` | Notional value below `minTradeValue` (default 0.01) — dust / spam guard. |
| `QUOTE_REQUIRED` | Only when `requireQuote` is enabled and no `quotedPrice` was supplied. |

The service returns `{ allowed, violations[], metrics }`. `metrics` reports
`slippageBps`, `priceImpactBps` (the caller's own price impact, kept **distinct**
from slippage and reference deviation), `referenceDeviationBps`,
`referenceStale`, and `referenceSamples`. `metrics` is echoed on the trade
response as `data.trade.guardMetrics`.

### 2. Reference price

`circuitBreakerService.getReferencePrice(poolId)` returns
`{ price, sampleCount, ageMs }` — a recent average of recorded trade prices for
the market.

A prediction-market token has **no external spot price**: the oracle resolves
the final market *outcome*, not a live probability, so it cannot serve as a
price oracle here (issue §4). The reference is therefore an **internal
manipulation-resistant recent average**, not an external oracle. Its limits:
it lags real moves, it needs history to be meaningful (hence `minReferenceSamples`
and the stale-reference rule), and a patient attacker who moves the average over
many trades can shift it. It is a guard-rail, not a source of truth.

### 3. Correctness fix in the trade path

- The circuit-breaker check in `executeTrade` referenced `normalizedWalletAddress`
  before its declaration (a temporal-dead-zone `ReferenceError` that made the
  whole handler throw). The declaration is moved above the check.
- A `ValidationError` raised inside the execution `try` block (slippage /
  execution-bound / manipulation rejection, and the pre-existing price-impact
  check) was being re-wrapped as a 500 `StellarError`. It is now re-thrown
  unchanged so a rejected trade returns 400.

## Configuration

`tradeGuardService` config is a single object with environment overrides and a
`getConfig()` / `setConfig(partial)` pair (mirrors `circuitBreakerService`).

| Key | Default | Env override |
|---|---|---|
| `enabled` | `true` | `TRADE_GUARD_ENABLED` |
| `maxSlippageBps` | `500` | `TRADE_GUARD_MAX_SLIPPAGE_BPS` |
| `maxReferenceDeviationBps` | `1000` | `TRADE_GUARD_MAX_REFERENCE_DEVIATION_BPS` |
| `maxReferenceAgeMs` | `300000` | `TRADE_GUARD_MAX_REFERENCE_AGE_MS` |
| `minReferenceSamples` | `3` | `TRADE_GUARD_MIN_REFERENCE_SAMPLES` |
| `staleReferencePolicy` | `reject` | `TRADE_GUARD_STALE_REFERENCE_POLICY` |
| `minTradeValue` | `0.01` | `TRADE_GUARD_MIN_TRADE_VALUE` |
| `requireQuote` | `false` | `TRADE_GUARD_REQUIRE_QUOTE` |

Defaults mirror existing protocol constants: `maxSlippageBps` = the contract's
`MAX_SLIPPAGE_BPS`; `maxReferenceDeviationBps` = `circuitBreakerService`'s 10%
price-deviation threshold. They are **not** new invented numbers.

`maxSlippage`, `quotedPrice`, `minReceived`, `maxCost` are optional
`POST /api/trades` body fields (validated in `middleware/validation.js`).

## DETECT vs PREVENT

- **PREVENT** (trade is rejected): everything in `circuitBreakerService`
  `checkTradeAllowed` and everything in `tradeGuardService`, plus the on-chain
  contract checks.
- **DETECT** (alert only, trade proceeds): `manipulationDetector` heuristics
  (wash trading, order spam, volume spikes, single-trade price-move alerts).

The backend cannot reliably identify a *front-runner's identity* from wallet
addresses; it can only enforce the victim's declared execution bounds. Those
bounds are what the adversarial tests exercise.

## What this does NOT do

- It does not eliminate MEV. Sandwichers and front-runners can still attempt
  attacks; the safeguards limit the victim's realised loss and reject fills that
  breach declared bounds or move abnormally.
- The reference price is internal and lagging (see above); it is not a
  trustworthy external oracle and is not treated as one.
- **Contract-level pre-trade price-deviation guard — out of scope here.** The
  `amm-pool` contract imports `PRICE_DEVIATION_THRESHOLD_BPS` (5%) and
  `OrynError::PriceDeviationTooHigh` (74) but never enforces a pre-trade
  deviation check — `update_circuit_breaker` only reacts *after* a swap commits,
  using the looser 10% `CIRCUIT_BREAKER_THRESHOLD_BPS`. Converting that to a
  *pre-trade* guard (reject the swap whose projected post-swap price deviates
  from `circuit_breaker.last_price` by more than the configured bps), plus an
  optional `deadline` parameter on `swap`, is the natural on-chain follow-up.
  It is deferred because the contract workspace does not currently build on this
  toolchain (`stellar-xdr-20.1.0` fails to compile against current `rustc` — the
  same class of breakage the vendored `ethnum` patch addresses), so such a
  change could not be compiled or tested here. Shipping unverified changes to a
  security-critical swap path would be worse than deferring them.

## Tests

- `backend/__tests__/services/tradeGuardService.test.js` — 27 tests: normal
  trades; slippage boundary (threshold-1 / threshold / threshold+1); adverse vs
  favourable moves (buy and sell); absolute `maxCost` / `minReceived` bounds;
  reference-deviation boundary; too-few-samples and no-reference skips; stale
  reference (`reject` and `ignore` policies); dust guard; disabled config;
  `requireQuote`; config immutability and `setConfig`; structured rejection
  logging; sandwich-like and front-running-like scenarios.
- `backend/__tests__/services/circuitBreakerService.test.js` — fixed a broken
  `require` path that made the whole suite fail to run (20 tests resurrected) and
  added `getReferencePrice` coverage.
- `backend/__tests__/controllers/tradeController.test.js` — fixed an incomplete
  `logger` mock that made the suite fail to run; added `executeTrade` guard
  tests (normal trade returns `guardMetrics`; slippage breach → 400; `maxCost`
  breach → 400).

Full backend suite: 42 suites / 427 tests passing.

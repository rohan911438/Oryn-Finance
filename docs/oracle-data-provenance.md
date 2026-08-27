# Oracle Data Provenance & Verification Layer (#241)

## Purpose

Every resolved market can be traced back through the oracle responses that
contributed to the final resolution decision. The provenance layer preserves
enough historical information to independently determine, for each oracle
response that entered the resolution pipeline:

- which oracle provider supplied the value
- when the value was received
- what value / metadata was supplied
- whether the response was valid, rejected, or stale
- why it was rejected (structured reason code + human-readable detail)
- whether it participated in consensus
- whether it contributed to the final market resolution
- how the final resolution decision was reached (consensus decision context)

## Where this sits

The repository already exposes an **on-chain** resolution trail:

| Layer | Model | API | Answers |
|---|---|---|---|
| On-chain submissions | `ResolutionEvent` (`resolution_events`) | `GET /api/markets/:id/resolution` | What the `oracle-resolver` contract collected and finalized |
| **Off-chain provider provenance (this feature)** | `OracleProvenanceRecord` (`oracle_provenance`) | `GET /api/markets/:id/resolution/provenance` | What each external data source returned and why the backend accepted or rejected it |

This feature **extends** the existing oracle architecture
(`oracleService` + `OracleConsensusEngine`); it does not replace any of it.

## Data model — `OracleProvenanceRecord`

Collection: `oracle_provenance`. Append-oriented — the observation and verdict
fields are written once and never mutated.

| Field | Type | Notes |
|---|---|---|
| `marketId` | String | indexed |
| `batchId` | String | groups all observations from one resolution attempt |
| `provider` | String | e.g. `coingecko`, `chainlink`, `sports-api`, `news-api` |
| `providerRequestId` | String | provider-side reference (symbol / feed id / game id) when available |
| `receivedAt` | Date | when the provider response was produced |
| `normalizedOutcome` | `'yes' \| 'no' \| null` | normalized provider outcome |
| `confidence` | Number (0–1) | provider-reported confidence |
| `numericValue` | Number | normalized numeric measurement, when the provider supplies one |
| `sourceValue` | Mixed | sanitized normalized payload `{ outcome, confidence, value }` |
| `responseMetadata` | Mixed | sanitized provider `data` block (never contains credentials) |
| `validationStatus` | `'valid' \| 'rejected' \| 'stale'` | verdict from `OracleConsensusEngine` |
| `rejectionReason` | enum \| null | `invalid_value`, `stale_timestamp`, `malformed_response`, `provider_error`, `freshness_violation`, `validation_failure`, `outlier`, `insufficient_confidence` |
| `rejectionDetail` | String | human-readable explanation |
| `stale` | Boolean | |
| `freshness` | `{ ageMs, maxAgeMs }` | |
| `participatedInConsensus` | Boolean | accepted into the weighted vote |
| `weightInConsensus` | Number | effective weight applied |
| `consensusContext` | Mixed | snapshot of the batch's consensus decision (see below) |
| `contributedToResolution` | Boolean | set post-resolution: accepted **and** outcome matches the resolved outcome |
| `resolutionRef` | `{ resolvedOutcome, resolvedAt, resolutionTransactionHash, resolvedBy, consensusReached, agreementRatio }` | set only after the real resolution transition succeeds |

### Indexes

- `{ batchId, provider }` unique — one observation per (attempt, provider); makes re-recording an attempt idempotent.
- `{ marketId, receivedAt }` — market timeline.
- `{ marketId, validationStatus }` — audit filter by verdict.
- `{ provider, receivedAt }` — per-provider history.
- `{ 'resolutionRef.resolutionTransactionHash' }` sparse — lookup by resolution.

### `consensusContext` snapshot

```json
{
  "providersConsidered": 4,
  "providersAccepted": ["coingecko", "chainlink"],
  "providersRejected": { "stale": ["sports-api"], "outliers": [], "invalid": ["news-api"] },
  "valuesUsed": [{ "source": "coingecko", "outcome": "yes", "value": 105000, "weight": 0.48 }],
  "weightByOutcome": { "yes": 0.9, "no": 0.2 },
  "totalWeight": 1.1,
  "agreementRatio": 0.82,
  "consensusThreshold": 0.6,
  "minResponses": 1,
  "finalOutcome": "yes",
  "consensusReached": true,
  "evaluatedAt": "2026-01-15T12:00:00.000Z"
}
```

## Integration points

1. **`oracleService.aggregateResults(results, options)`** — after
   `OracleConsensusEngine.evaluate()` produces its decision, a `batchId` is
   generated, attached to the aggregated result as
   `data.provenanceBatchId`, and `OracleProvenanceRecorder.recordResolutionAttempt()`
   is invoked (fire-and-forget, mirroring the existing `recordConsensusAudit`
   pattern). This covers `resolveWithFallback` and the oracle retry queue.
2. **`backgroundJobs.processMarketExpiration` / `resolveMarketFromOracleRetry`** —
   after `market.resolve(...)` and `market.save()` succeed,
   `oracleService.linkResolutionProvenance(marketId, oracleResult, market)` links
   the recorded batch to the resolution. Linkage happens **only after** the state
   transition is persisted, so a resolution is never "successful" in the
   provenance layer before it is real.

`OracleProvenanceRecorder` is entirely best-effort: any persistence failure is
logged and swallowed so it can never fail a market resolution. Records written
during `aggregateResults` survive even if the later linkage step fails (they are
simply left unlinked and logged).

## API — `GET /api/markets/:id/resolution/provenance`

`optionalAuth`, same conventions as `GET /api/markets/:id/resolution`.
Returns HTTP 404 (standard error body) for an unknown market.

```json
{
  "success": true,
  "data": {
    "marketId": "MKT-1",
    "resolution": {
      "status": "resolved",
      "resolvedOutcome": "yes",
      "resolvedAt": "2026-01-15T12:00:00.000Z",
      "resolvedBy": "oracle",
      "resolutionTransactionHash": "stellar-tx-1",
      "finalizationTxHash": null,
      "finalizationTimestamp": null
    },
    "observations": [
      {
        "provider": "coingecko",
        "providerRequestId": "bitcoin",
        "batchId": "MKT-1:1737033600000:ab12cd34",
        "receivedAt": "2026-01-15T11:59:59.000Z",
        "normalizedOutcome": "yes",
        "confidence": 0.95,
        "numericValue": 105000,
        "sourceValue": { "outcome": "yes", "confidence": 0.95, "value": 105000 },
        "responseMetadata": { "source": "coingecko", "symbol": "bitcoin" },
        "validationStatus": "valid",
        "rejectionReason": null,
        "rejectionDetail": null,
        "stale": false,
        "freshness": null,
        "participatedInConsensus": true,
        "weightInConsensus": 0.48,
        "contributedToResolution": true
      }
    ],
    "attempts": [
      {
        "batchId": "MKT-1:1737033600000:ab12cd34",
        "recordedAt": "2026-01-15T12:00:00.000Z",
        "observationCount": 4,
        "acceptedCount": 2,
        "rejectedCount": 1,
        "staleCount": 1,
        "acceptedProviders": ["coingecko", "chainlink"],
        "rejectedProviders": [{ "provider": "news-api", "reason": "validation_failure" }],
        "staleProviders": ["sports-api"],
        "contributingProviders": ["coingecko", "chainlink"],
        "consensusContext": { "finalOutcome": "yes", "consensusReached": true, "agreementRatio": 0.82 },
        "resolutionRef": { "resolvedOutcome": "yes", "resolutionTransactionHash": "stellar-tx-1" }
      }
    ],
    "decision_context": {
      "batchId": "MKT-1:1737033600000:ab12cd34",
      "consensusContext": { "finalOutcome": "yes", "consensusReached": true },
      "resolutionRef": { "resolvedOutcome": "yes" },
      "contributingProviders": ["coingecko", "chainlink"]
    },
    "legacy_resolution": false
  }
}
```

`legacy_resolution: true` marks a market that was resolved before this feature
existed — it has no observation trail, and none is fabricated.

## Frontend

`ProviderProvenance` is a new sub-component of the existing `ResolutionPanel`
(`frontend/src/components/ResolutionPanel/`). It fetches the provenance endpoint
independently, so a provenance failure degrades to a placeholder without
affecting the rest of the panel. For each resolution attempt it renders every
provider observation with a valid / stale / rejected badge, the value,
confidence, receipt time, rejection reason, and a `contributed` / `excluded`
marker, followed by the consensus decision context.

## Security & retention

- `OracleProvenanceRecorder.sanitizeMetadata()` recursively redacts any key
  matching `api key`, `secret`, `token`, `authorization`, `auth`, `password`,
  `passphrase`, `credential`, `bearer`, `cookie`, `session`, `private key`, or
  `signature`, and caps string length and object depth.
- Raw provider HTTP responses, headers, and request credentials are never
  persisted — only the normalized `data` block the provider returns, sanitized.
- The API returns the same sanitized `responseMetadata`; it never exposes
  provider credentials.

## Historical reconstruction rules

- Observation and verdict fields are immutable after creation. A response that
  was rejected stays rejected even if a later attempt (new `batchId`) produces a
  valid answer. A stale response stays recorded as stale.
- Only `contributedToResolution` and `resolutionRef` are added after the fact,
  and only once the real resolution transition has succeeded. Linkage never
  changes a record's `validationStatus`.

## Known limitations

- Provenance is recorded on the consensus / multi-source path
  (`resolveWithFallback`, oracle retry queue). The single-provider direct path
  (`market.oracleSource` with no `oracleConfig.sources`) performs no
  cross-provider validation and is not recorded.
- Markets resolved before this feature have no provenance; the API reports
  `legacy_resolution: true` rather than backfilling.

# Implementation Plan: Market Resolution Transparency

## Overview

Implement full resolution lifecycle visibility for the Oryn Finance prediction market platform. The work is split into five phases: data layer (new `ResolutionEvent` model + `Market` schema additions), event indexing (extending `contractEventIndexer`), backend API (two new controllers and routes), frontend UI (`ResolutionPanel` and six sub-components), and cross-cutting tests.

## Tasks

- [x] 1. Create the `ResolutionEvent` Mongoose model
  - Create `backend/src/models/ResolutionEvent.js` with all schema fields: `marketId`, `eventType` (enum), `actorAddress`, `outcome`, `confidenceScore`, `proofDataHash`, `payload` (Mixed), `ledger`, `txHash`, `timestamp`, `processedAt`
  - Add a unique compound index on `{ txHash: 1, eventType: 1 }` to enforce idempotency
  - Add a single-field index on `marketId` for query performance
  - Export the model and register it in `backend/src/models/index.js`
  - _Requirements: 8.4, 8.5_

  - [ ]* 1.1 Write unit tests for the `ResolutionEvent` model
    - Test that inserting a duplicate `(txHash, eventType)` pair throws a duplicate-key error
    - Test that all required fields (`marketId`, `txHash`, `timestamp`, `eventType`) are enforced by schema validation
    - _Requirements: 8.4, 8.5_

- [x] 2. Extend the `Market` model with resolution finalization fields
  - Add `resolutionFinalizationTxHash` (String) and `resolutionFinalizationTimestamp` (Date) fields to `backend/src/models/Market.js`
  - _Requirements: 8.2_

- [x] 3. Extend `contractEventIndexer` to persist resolution events
  - Import `ResolutionEvent` from the models index at the top of `backend/src/services/contractEventIndexer.js`
  - Rewrite `handleResolutionSubmitted` to upsert a `ResolutionEvent` document with `eventType: 'oracle_submission'`, mapping `oracle` → `actorAddress`, `outcome`, `confidenceScore`, `proofDataHash`, `ledger`, `txHash`, `timestamp`, and `payload` from the event value; use `$setOnInsert` so duplicates are silently ignored
  - Rewrite `handleResolutionDisputed` to upsert a `ResolutionEvent` document with `eventType: 'resolution_disputed'`, mapping `disputer` → `actorAddress`, `disputeReason`, `ledger`, `txHash`, `timestamp`, and full `payload`
  - Rewrite `handleResolutionFinalized` to (a) upsert a `ResolutionEvent` document with `eventType: 'resolution_finalized'` and (b) update the `Market` document with `resolutionFinalizationTxHash` and `resolutionFinalizationTimestamp`; log and continue if the market update fails
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 3.1 Write property test — Resolution event persistence is idempotent (Property 10)
    - **Property 10: Resolution event persistence is idempotent**
    - Generate random `(txHash, eventType)` pairs with fast-check; call the handler twice with the same payload using a mock MongoDB upsert; assert the collection contains exactly one document per unique pair
    - `// Feature: market-resolution-transparency, Property 10: resolution event persistence is idempotent`
    - **Validates: Requirements 8.5**

  - [ ]* 3.2 Write property test — Resolution event persistence is complete (Property 11)
    - **Property 11: Resolution event persistence is complete**
    - Generate random `resolution_submitted` payloads with fast-check; process each through the handler with a mock MongoDB; assert the persisted document contains `actorAddress`, `outcome`, `proofDataHash`, `confidenceScore`, `timestamp`, and `txHash` matching the input
    - `// Feature: market-resolution-transparency, Property 11: resolution event persistence is complete`
    - **Validates: Requirements 8.1**

  - [ ]* 3.3 Write unit tests for the extended indexer handlers
    - Test `handleResolutionSubmitted` writes the correct fields to `ResolutionEvent`
    - Test `handleResolutionFinalized` updates the `Market` document with `resolutionFinalizationTxHash` and `resolutionFinalizationTimestamp`
    - Test that a duplicate event (same `txHash` + `eventType`) does not create a second document
    - _Requirements: 8.1, 8.2, 8.5_

- [x] 4. Checkpoint — Ensure all data-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement `resolutionController.js`
  - Create `backend/src/controllers/resolutionController.js`
  - Implement `static async getMarketResolution(req, res)`:
    - Look up the market by `req.params.id`; throw `NotFoundError` if not found
    - Query all `ResolutionEvent` documents for the market, sorted ascending by `timestamp` and `ledger`
    - Derive `resolution_status` from market status and event types using the six-value enum: `pending`, `in_progress`, `consensus_reached`, `dispute_period`, `finalized`, `manual_required`
    - Compute `vote_tally` (yes/no counts and threshold) from submission events
    - Set `source_disagreement: true` when submissions contain at least two different outcome values
    - Compute `aggregated_result` including `outcome`, `method: 'weighted'`, `yes_weight`, `no_weight`, `confidence`, `low_confidence` (true when confidence < 0.6), and `breakdown` array
    - Assemble `dispute_info` with `deadline`, `seconds_remaining`, `finalization_tx_hash`, and `finalization_timestamp`
    - Optionally query the live Soroban `oracle-resolver` contract for dispute deadline; set `contract_data_unavailable: true` and return off-chain data if the query fails or exceeds 3000ms
    - Map each `ResolutionEvent` to an `audit_trail` entry including `explorerUrl` pointing to `https://stellar.expert/explorer/testnet/tx/{txHash}`
    - Return the assembled `ResolutionResponse` shape
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 5.1 Write property test — Resolution response always contains required top-level fields (Property 1)
    - **Property 1: Resolution response always contains required top-level fields**
    - Generate random market documents and mock DB responses with fast-check; call the controller logic; assert every response contains `oracle_source`, `oracle_config`, `resolution_status`, `submissions`, `aggregated_result`, `dispute_info`, and `audit_trail`
    - `// Feature: market-resolution-transparency, Property 1: resolution response always contains required top-level fields`
    - **Validates: Requirements 6.5**

  - [ ]* 5.2 Write property test — Resolution status is always a valid enum value (Property 2)
    - **Property 2: Resolution status is always a valid enum value**
    - Generate random combinations of market state and resolution event sets with fast-check; assert the derived `resolution_status` is always one of `pending`, `in_progress`, `consensus_reached`, `dispute_period`, `finalized`, `manual_required`
    - `// Feature: market-resolution-transparency, Property 2: resolution_status is always a valid enum value`
    - **Validates: Requirements 4.1**

  - [ ]* 5.3 Write property test — Vote tally is consistent with submissions list (Property 3)
    - **Property 3: Vote tally is consistent with submissions list**
    - Generate random arrays of oracle submission objects with fast-check; assert `vote_tally.yes + vote_tally.no === submissions.length`
    - `// Feature: market-resolution-transparency, Property 3: vote tally is consistent with submissions list`
    - **Validates: Requirements 2.2**

  - [ ]* 5.4 Write property test — Source disagreement flag is correct (Property 4)
    - **Property 4: Source disagreement flag is correct**
    - Generate random arrays of submissions with randomly assigned outcomes with fast-check; assert `source_disagreement === (unique outcomes > 1)`
    - `// Feature: market-resolution-transparency, Property 4: source_disagreement flag is correct`
    - **Validates: Requirements 2.3**

  - [ ]* 5.5 Write property test — Low confidence flag is correct (Property 5)
    - **Property 5: Low confidence flag is correct**
    - Generate random confidence values in [0, 1] with fast-check; assert `low_confidence === (confidence < 0.6)`
    - `// Feature: market-resolution-transparency, Property 5: low_confidence flag is correct`
    - **Validates: Requirements 3.3**

  - [ ]* 5.6 Write property test — Audit trail is in ascending chronological order (Property 6)
    - **Property 6: Audit trail is in ascending chronological order**
    - Generate random sets of resolution events with random timestamps and ledger numbers with fast-check; after applying the controller sort logic, assert every consecutive pair `(a, b)` satisfies `a.timestamp <= b.timestamp` and `a.ledger <= b.ledger`
    - `// Feature: market-resolution-transparency, Property 6: audit trail is in ascending chronological order`
    - **Validates: Requirements 5.3**

  - [ ]* 5.7 Write property test — Audit trail completeness (Property 7)
    - **Property 7: Audit trail completeness**
    - Generate random sets of resolution events with fast-check; assert every event in the input set appears in the output `audit_trail` (matched by `txHash` + `eventType`)
    - `// Feature: market-resolution-transparency, Property 7: audit trail completeness`
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 5.8 Write unit tests for `resolutionController`
    - Test 404 response for an unknown market ID
    - Test `contract_data_unavailable: true` when the Soroban mock throws
    - Test correct assembly of the response shape from mock DB data (empty submissions, single submission, multiple submissions with disagreement)
    - Test that `dispute_info.seconds_remaining` is computed correctly relative to a fixed clock
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [x] 6. Implement `oracleHealthController.js`
  - Create `backend/src/controllers/oracleHealthController.js`
  - Implement `static async getOracleHealth(req, res)`:
    - Call `oracleService.getSourceHealthStatus()` to retrieve the in-memory health map
    - If the service is not initialised or returns null/undefined, respond with HTTP 503 and `{ success: false, message: 'Oracle service unavailable' }`
    - Map each source entry to `{ name, successCount, failureCount, failureRate, isHealthy }` — `isHealthy` is `false` when `failureRate > 0.30`
    - Return `{ success: true, data: { sources: [...] } }`
  - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 6.1 Write property test — Oracle health threshold is correctly applied (Property 8)
    - **Property 8: Oracle health threshold is correctly applied**
    - Generate random `(successCount, failureCount)` pairs with fast-check; compute `failureRate = failureCount / (successCount + failureCount)`; assert `isHealthy === (failureRate <= 0.30)`
    - `// Feature: market-resolution-transparency, Property 8: oracle health threshold is correctly applied`
    - **Validates: Requirements 7.3**

  - [ ]* 6.2 Write property test — Oracle health response covers all configured sources (Property 9)
    - **Property 9: Oracle health response covers all configured sources**
    - Generate random sets of oracle source names with fast-check; mock `oracleService.getSourceHealthStatus()` to return those sources; assert the response contains exactly one entry per source, each with `name`, `successCount`, `failureCount`, `failureRate`, and `isHealthy`
    - `// Feature: market-resolution-transparency, Property 9: oracle health response covers all configured sources`
    - **Validates: Requirements 7.2**

  - [ ]* 6.3 Write unit tests for `oracleHealthController`
    - Test that `getSourceHealthStatus()` output is correctly mapped to the response shape
    - Test HTTP 503 when `oracleService` is not initialised
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. Add routes and register the oracle router
  - In `backend/src/routes/markets.js`, add the resolution route before the generic `/:id` route:
    ```js
    router.get('/:id/resolution', optionalAuth, asyncHandler(resolutionController.getMarketResolution));
    ```
  - Create `backend/src/routes/oracle.js` with a single route:
    ```js
    router.get('/health', asyncHandler(oracleHealthController.getOracleHealth));
    ```
  - In `backend/server.js`, import `oracleRoutes` and register it with `this.app.use('/api/oracle', oracleRoutes)` inside `setupRoutes()`
  - _Requirements: 6.1, 7.1_

- [x] 8. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Write backend integration tests
  - Create `backend/__tests__/integration/resolutionApi.test.js`
  - Test `GET /api/markets/:id/resolution` end-to-end with a seeded MongoDB: verify correct 200 response shape including all required fields
  - Test 404 for an unknown market ID
  - Test `contract_data_unavailable: true` when the Soroban RPC is mocked to fail
  - Test that the endpoint responds within 3000ms with a seeded database (Soroban query mocked)
  - Test `GET /api/oracle/health` end-to-end: verify response shape and that `isHealthy` reflects the in-memory health state
  - Test `contractEventIndexer` with a real MongoDB test instance: process a sequence of `resolution_submitted`, `resolution_disputed`, and `resolution_finalized` events; verify the `resolution_events` collection and `markets` collection are updated correctly
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 8.1, 8.2, 8.3_

- [x] 10. Implement the `ResolutionPanel` React component and sub-components
  - Create the directory `frontend/src/components/ResolutionPanel/`
  - Create `frontend/src/components/ResolutionPanel/index.tsx` as the top-level component:
    - Accept `marketId: string` as a prop
    - Fetch `/api/markets/${marketId}/resolution` and `/api/oracle/health` in parallel using `@tanstack/react-query`
    - Show a loading skeleton while fetching
    - Show an error state with a retry button if the resolution endpoint returns non-2xx
    - Show a banner "Live contract data is temporarily unavailable. Showing last known resolution state." when `contract_data_unavailable` is `true`
    - Render all six sub-components, passing the relevant slices of the response as props
  - _Requirements: 1.4, 2.4, 2.5, 3.4, 3.5, 3.6, 4.4, 4.5, 4.6, 5.5, 5.6, 7.4, 7.5_

  - [x] 10.1 Implement `OracleSourceConfig` sub-component
    - Create `frontend/src/components/ResolutionPanel/OracleSourceConfig.tsx`
    - Display oracle source type and configuration parameters in a human-readable format
    - When multiple sources are configured, display all sources and their assigned weights
    - _Requirements: 1.4, 1.5_

  - [x] 10.2 Implement `SubmissionList` sub-component
    - Create `frontend/src/components/ResolutionPanel/SubmissionList.tsx`
    - Render each oracle submission as a table row: truncated oracle address (full address on hover via tooltip), outcome badge, confidence score, and a link to Stellar Expert explorer for the submission transaction
    - When `source_disagreement` is `true`, display a visible warning indicator above the table
    - _Requirements: 2.4, 2.5_

  - [x] 10.3 Implement `AggregatedResult` sub-component
    - Create `frontend/src/components/ResolutionPanel/AggregatedResult.tsx`
    - Display the aggregated outcome prominently with a confidence indicator (numeric percentage and a visual progress bar using `@radix-ui/react-progress`)
    - When `low_confidence` is `true`, display a caution notice
    - Display the per-source weight breakdown in a table
    - _Requirements: 3.4, 3.5, 3.6_

  - [x] 10.4 Implement `ResolutionStatus` sub-component
    - Create `frontend/src/components/ResolutionPanel/ResolutionStatus.tsx`
    - Display the current `resolution_status` with a human-readable label and a color-coded status badge
    - When status is `dispute_period`, display a countdown timer (using `date-fns` for time calculation) showing time remaining until the dispute deadline
    - When status is `finalized`, display the finalization transaction hash as a link to Stellar Expert explorer
    - _Requirements: 4.4, 4.5, 4.6_

  - [x] 10.5 Implement `AuditTrail` sub-component
    - Create `frontend/src/components/ResolutionPanel/AuditTrail.tsx`
    - Render the audit trail as a vertical timeline; each entry shows event type label, truncated actor address, timestamp, and a link to Stellar Expert explorer
    - Each entry is expandable (using `@radix-ui/react-collapsible`) to show the full event data payload as formatted JSON
    - When the audit trail is empty, render a "No resolution events yet" placeholder
    - _Requirements: 5.5, 5.6_

  - [x] 10.6 Implement `HealthSummary` sub-component
    - Create `frontend/src/components/ResolutionPanel/HealthSummary.tsx`
    - Display each oracle source's health status with a green/red visual indicator
    - When all configured sources are unhealthy, display a prominent warning that automated resolution may be unreliable
    - When the `/api/oracle/health` fetch fails, render a "Health data unavailable" placeholder without crashing the panel
    - _Requirements: 7.4, 7.5_

- [x] 11. Integrate `ResolutionPanel` into the market detail page
  - Locate the existing market detail page component in `frontend/src/pages/`
  - Import `ResolutionPanel` and render it below the existing market information, passing `marketId` from the route params
  - _Requirements: 1.4, 4.4, 5.5_

- [ ]* 12. Write frontend unit and snapshot tests
  - Write snapshot tests for each sub-component (`OracleSourceConfig`, `SubmissionList`, `AggregatedResult`, `ResolutionStatus`, `AuditTrail`, `HealthSummary`) with representative props using Vitest and `@testing-library/react`
  - Test conditional rendering in `ResolutionPanel`: warning banner when `contract_data_unavailable` is `true`, countdown timer when status is `dispute_period`, caution notice when `low_confidence` is `true`
  - Test that `HealthSummary` renders the "Health data unavailable" placeholder when the health fetch fails
  - Test that `AuditTrail` renders the empty-state placeholder when the audit trail array is empty
  - _Requirements: 2.5, 3.5, 4.5, 5.5, 7.5_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The unique index on `ResolutionEvent.{ txHash, eventType }` is the primary idempotency guard — all handler upserts must use `$setOnInsert` to respect it
- The backend uses Jest (`backend/jest.config.js`); install `fast-check` as a dev dependency before writing property tests: `npm install --save-dev fast-check`
- The frontend uses Vitest with `@testing-library/react`; no additional test dependencies are needed
- Property tests run a minimum of 100 iterations each (fast-check default)
- The `ResolutionPanel` fetches both endpoints in parallel; the `HealthSummary` failure must not propagate to the rest of the panel

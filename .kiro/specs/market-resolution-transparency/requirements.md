# Requirements Document

## Introduction

This feature adds market resolution transparency to the Oryn Finance prediction market platform. Currently, users have no visibility into how market outcomes are determined — they cannot see which oracle sources were used, what data was submitted, or follow the chain of events from oracle submission through dispute period to finalization. This erodes trust in the platform.

The feature exposes the full resolution lifecycle: oracle source configuration, individual oracle submissions (with proof data and confidence scores), aggregated resolution data, dispute period status, and a complete on-chain audit trail. Data is surfaced through new backend API endpoints and displayed in the React frontend on each market's detail page.

## Glossary

- **Oracle_Resolver**: The Soroban smart contract (`contracts/oracle-resolver`) that collects oracle votes, reaches consensus, and finalizes market outcomes.
- **Oracle_Service**: The Node.js backend service (`backend/src/services/oracleService.js`) that queries external data sources (CoinGecko, Sports API, News API, Chainlink) and aggregates results.
- **Resolution_API**: The new set of REST endpoints added to the backend that expose resolution data to clients.
- **Resolution_Panel**: The new React UI component rendered on the market detail page that displays resolution transparency information.
- **Audit_Trail**: The ordered, immutable sequence of resolution-related on-chain events for a market, indexed from Soroban contract events.
- **Dispute_Period**: The 7-day window after consensus is reached during which the resolution can be challenged, as defined by `DISPUTE_PERIOD` in `contracts/shared/src/lib.rs`.
- **Oracle_Submission**: A single oracle's vote on a market outcome, including the oracle address, outcome, proof data, confidence score, and submission timestamp.
- **Resolution_Status**: The current phase of a market's resolution lifecycle: `pending`, `in_progress`, `consensus_reached`, `dispute_period`, `finalized`, or `manual_required`.
- **Confidence_Score**: A numeric value (0.0–1.0) representing how certain an oracle is about its submitted outcome.
- **Source_Health**: Per-oracle-source metrics (success count, failure count, failure rate, health status) tracked by the Oracle_Service.

---

## Requirements

### Requirement 1: Expose Oracle Source Configuration

**User Story:** As a market participant, I want to see which oracle sources are configured for a market, so that I can evaluate the trustworthiness of the resolution mechanism before placing a trade.

#### Acceptance Criteria

1. THE Resolution_API SHALL return the oracle source type (`manual`, `coingecko`, `sports-api`, `news-api`, `chainlink`) for every market.
2. WHEN a market uses automated oracle resolution, THE Resolution_API SHALL return the oracle configuration parameters (e.g., symbol, target price, condition for crypto markets; game ID and condition for sports markets; keywords and sentiment for news markets).
3. WHEN a market uses manual resolution, THE Resolution_API SHALL return a `manual_required` resolution status and the human-readable resolution criteria text.
4. THE Resolution_Panel SHALL display the oracle source type and configuration parameters in a human-readable format on the market detail page.
5. WHERE a market has multiple configured oracle sources, THE Resolution_Panel SHALL display all sources and their assigned weights.

---

### Requirement 2: Display Individual Oracle Submissions

**User Story:** As a market participant, I want to see each oracle's individual submission for a market, so that I can verify that the resolution data came from legitimate sources and understand any disagreements between oracles.

#### Acceptance Criteria

1. WHEN at least one oracle has submitted a resolution vote, THE Resolution_API SHALL return a list of all submissions, each containing: oracle address, submitted outcome, confidence score, submission timestamp, and Stellar transaction hash.
2. THE Resolution_API SHALL return the current vote tally (yes-vote count, no-vote count) and the consensus threshold required for finalization.
3. WHEN oracle sources disagree on the outcome, THE Resolution_API SHALL include a `source_disagreement` flag set to `true` in the response.
4. THE Resolution_Panel SHALL render each oracle submission as a distinct row, displaying oracle address (truncated with full address on hover), outcome, confidence score, and a link to the Stellar Expert explorer for the submission transaction.
5. WHEN oracle sources disagree, THE Resolution_Panel SHALL display a visible warning indicator alongside the submission list.

---

### Requirement 3: Display Aggregated Resolution Data

**User Story:** As a market participant, I want to see the aggregated resolution result and the method used to compute it, so that I can understand how individual oracle votes were combined into a final outcome.

#### Acceptance Criteria

1. WHEN consensus has been reached, THE Resolution_API SHALL return the aggregated outcome, the aggregation method (`weighted`), the total weight of yes-votes, the total weight of no-votes, and the overall confidence score.
2. THE Resolution_API SHALL return the per-source weight breakdown used during aggregation, including each source's name, its submitted outcome, its confidence score, and its computed weight.
3. WHEN the aggregated confidence score is below 0.6, THE Resolution_API SHALL include a `low_confidence` flag set to `true` in the response.
4. THE Resolution_Panel SHALL display the aggregated outcome prominently, along with a confidence indicator (numeric percentage and a visual bar).
5. WHEN the `low_confidence` flag is `true`, THE Resolution_Panel SHALL display a caution notice informing the user that the resolution confidence is below the recommended threshold.
6. THE Resolution_Panel SHALL display the per-source weight breakdown in a table or list format.

---

### Requirement 4: Show Resolution Status and Dispute Period

**User Story:** As a market participant, I want to see the current resolution status and how much time remains in the dispute period, so that I know when the outcome is final and whether I can still challenge it.

#### Acceptance Criteria

1. THE Resolution_API SHALL return a `resolution_status` field for every market using one of the defined Resolution_Status values: `pending`, `in_progress`, `consensus_reached`, `dispute_period`, `finalized`, or `manual_required`.
2. WHEN the resolution status is `dispute_period`, THE Resolution_API SHALL return the dispute period deadline as a UTC ISO 8601 timestamp and the number of seconds remaining.
3. WHEN the resolution status is `finalized`, THE Resolution_API SHALL return the finalization transaction hash and the finalization timestamp.
4. THE Resolution_Panel SHALL display the current Resolution_Status with a human-readable label and a status badge (color-coded by phase).
5. WHEN the resolution status is `dispute_period`, THE Resolution_Panel SHALL display a countdown timer showing the time remaining until finalization.
6. WHEN the resolution status is `finalized`, THE Resolution_Panel SHALL display the finalization transaction hash as a link to the Stellar Expert explorer.

---

### Requirement 5: Provide a Complete Audit Trail

**User Story:** As a market participant or auditor, I want to see a complete, ordered history of all resolution-related events for a market, so that I can independently verify the resolution process from start to finish.

#### Acceptance Criteria

1. THE Resolution_API SHALL return an ordered list of audit trail entries for a market, where each entry contains: event type, actor address, event data payload, Stellar ledger number, transaction hash, and UTC timestamp.
2. THE Resolution_API SHALL include the following event types in the audit trail when they occur: `oracle_submission`, `consensus_reached`, `dispute_period_started`, `resolution_disputed`, `resolution_finalized`, and `manual_resolution`.
3. THE Resolution_API SHALL return audit trail entries in ascending chronological order (oldest first).
4. WHEN a market has no resolution events yet, THE Resolution_API SHALL return an empty audit trail list and a `resolution_status` of `pending`.
5. THE Resolution_Panel SHALL render the audit trail as a vertical timeline, with each entry showing the event type label, actor address (truncated), timestamp, and a link to the Stellar Expert explorer for the transaction.
6. THE Resolution_Panel SHALL allow the user to expand an audit trail entry to view the full event data payload.

---

### Requirement 6: Backend Resolution Data Endpoint

**User Story:** As a frontend developer or API consumer, I want a single dedicated endpoint that returns all resolution transparency data for a market, so that I can build UIs or integrations without assembling data from multiple sources.

#### Acceptance Criteria

1. THE Resolution_API SHALL expose a `GET /api/markets/:id/resolution` endpoint that returns all resolution transparency data for the specified market in a single response.
2. WHEN the market ID does not exist, THE Resolution_API SHALL return HTTP 404 with a structured error body containing a `message` field.
3. WHEN the Soroban contract is unreachable, THE Resolution_API SHALL return the best available off-chain resolution data from the database and include a `contract_data_unavailable: true` flag in the response.
4. THE Resolution_API SHALL respond to `GET /api/markets/:id/resolution` within 3000 milliseconds under normal operating conditions.
5. THE Resolution_API SHALL return resolution data in a JSON structure that includes: `oracle_source`, `oracle_config`, `resolution_status`, `submissions`, `aggregated_result`, `dispute_info`, and `audit_trail` fields.

---

### Requirement 7: Oracle Source Health Visibility

**User Story:** As a platform administrator or advanced user, I want to see the health status of each oracle source, so that I can identify unreliable sources that may affect resolution quality.

#### Acceptance Criteria

1. THE Resolution_API SHALL expose a `GET /api/oracle/health` endpoint that returns the current health metrics for all configured oracle sources.
2. THE Resolution_API SHALL return, for each oracle source: source name, success count, failure count, failure rate (as a decimal), and a boolean `is_healthy` flag.
3. WHEN an oracle source has a failure rate above 0.30, THE Resolution_API SHALL set `is_healthy` to `false` for that source.
4. THE Resolution_Panel SHALL display a source health summary section showing each oracle source's health status with a visual indicator (green for healthy, red for unhealthy).
5. WHEN all configured oracle sources for a market are unhealthy, THE Resolution_Panel SHALL display a prominent warning that automated resolution may be unreliable.

---

### Requirement 8: Resolution Data Persistence

**User Story:** As a platform operator, I want resolution submissions and audit trail events to be persisted in the database, so that resolution history is available even when the Soroban contract is temporarily unreachable.

#### Acceptance Criteria

1. WHEN the Contract_Event_Indexer processes a `resolution_submitted` event, THE System SHALL persist the oracle address, outcome, proof data hash, confidence score, submission timestamp, and transaction hash to the database.
2. WHEN the Contract_Event_Indexer processes a `resolution_finalized` event, THE System SHALL update the market record with the final outcome, finalization timestamp, and finalization transaction hash.
3. WHEN the Contract_Event_Indexer processes a `resolution_disputed` event, THE System SHALL persist the disputer address, dispute reason, dispute timestamp, and transaction hash to the database.
4. THE System SHALL store all resolution-related events in an append-only audit log collection, preserving the full event payload and metadata.
5. IF a duplicate event is received (same transaction hash and event type), THEN THE System SHALL ignore the duplicate and not create a second audit log entry.

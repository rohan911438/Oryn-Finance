const mongoose = require('mongoose');

/**
 * OracleProvenanceRecord (#241)
 *
 * Append-oriented provenance trail for the OFF-CHAIN oracle-provider layer.
 *
 * Each document captures a single oracle provider response that entered the
 * resolution pipeline for a market, together with the verdict the backend's
 * `OracleConsensusEngine` reached about it (valid / rejected / stale), the
 * reason it was rejected, whether it participated in consensus, and — once the
 * market is resolved — whether it contributed to the final outcome.
 *
 * This is complementary to `ResolutionEvent`, which records the ON-CHAIN oracle
 * submissions indexed from Soroban contract events. `ResolutionEvent` answers
 * "what did the contract see and finalize"; `OracleProvenanceRecord` answers
 * "what did each external data source return and why was it accepted or not".
 *
 * Historical-reconstruction rules (see issue #241 §13):
 *   - `validationStatus`, `rejectionReason` and the raw observation fields are
 *     written once and never mutated. A response that was rejected stays
 *     rejected even if a later attempt produces a valid answer.
 *   - Only the resolution linkage fields (`resolutionRef`,
 *     `contributedToResolution`) are filled in after the fact, and only after
 *     the real resolution state transition has succeeded.
 */

const VALIDATION_STATUSES = ['valid', 'rejected', 'stale'];

// Structured reason codes — prefer these over free-form strings. `rejectionDetail`
// carries the human-readable explanation.
const REJECTION_REASONS = [
  'invalid_value',
  'stale_timestamp',
  'malformed_response',
  'provider_error',
  'freshness_violation',
  'validation_failure',
  'outlier',
  'insufficient_confidence'
];

const freshnessSchema = new mongoose.Schema(
  {
    ageMs: { type: Number },
    maxAgeMs: { type: Number }
  },
  { _id: false }
);

const resolutionRefSchema = new mongoose.Schema(
  {
    resolvedOutcome: { type: String },
    resolvedAt: { type: Date },
    resolutionTransactionHash: { type: String },
    resolvedBy: { type: String },
    consensusReached: { type: Boolean },
    agreementRatio: { type: Number }
  },
  { _id: false }
);

const oracleProvenanceRecordSchema = new mongoose.Schema(
  {
    marketId: {
      type: String,
      required: true,
      index: true
    },

    // Groups every observation produced by a single resolution attempt so the
    // decision path can be reconstructed and linked to a resolution as a unit.
    batchId: {
      type: String,
      required: true,
      index: true
    },

    // --- Provider identity -------------------------------------------------
    provider: {
      type: String,
      required: true
    },
    // Provider-side request/source reference where the provider exposes one
    // (e.g. CoinGecko symbol, Chainlink feed id, sports game id).
    providerRequestId: {
      type: String,
      default: null
    },

    // --- Observation -----------------------------------------------------
    receivedAt: {
      type: Date,
      required: true
    },
    normalizedOutcome: {
      type: String,
      enum: ['yes', 'no', null],
      default: null
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null
    },
    // Normalised numeric measurement when the provider supplies one (used by the
    // consensus engine for outlier detection). Null for non-numeric sources.
    numericValue: {
      type: Number,
      default: null
    },
    // The normalised source payload as returned by the provider, AFTER
    // sanitisation. Never contains API keys, tokens or auth headers.
    sourceValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    responseMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    // --- Verdict -------------------------------------------------------
    validationStatus: {
      type: String,
      required: true,
      enum: VALIDATION_STATUSES
    },
    rejectionReason: {
      type: String,
      enum: [...REJECTION_REASONS, null],
      default: null
    },
    rejectionDetail: {
      type: String,
      default: null
    },
    stale: {
      type: Boolean,
      default: false
    },
    freshness: {
      type: freshnessSchema,
      default: null
    },

    // --- Consensus / resolution linkage --------------------------------
    participatedInConsensus: {
      type: Boolean,
      default: false
    },
    weightInConsensus: {
      type: Number,
      default: null
    },
    // Snapshot of the consensus decision context for the batch. Duplicated onto
    // each record so a single record is self-describing for audit queries.
    consensusContext: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    // Filled in only after the market's real resolution transition succeeds.
    contributedToResolution: {
      type: Boolean,
      default: false
    },
    resolutionRef: {
      type: resolutionRefSchema,
      default: null
    },

    recordedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'oracle_provenance'
  }
);

// One observation per (attempt, provider) — keeps re-recording an attempt
// idempotent without ever fabricating history for a new attempt.
oracleProvenanceRecordSchema.index({ batchId: 1, provider: 1 }, { unique: true });

// Audit query patterns: timeline for a market, filter by verdict, per-provider
// history, and lookup by the resolution a record contributed to.
oracleProvenanceRecordSchema.index({ marketId: 1, receivedAt: -1 });
oracleProvenanceRecordSchema.index({ marketId: 1, validationStatus: 1 });
oracleProvenanceRecordSchema.index({ provider: 1, receivedAt: -1 });
oracleProvenanceRecordSchema.index(
  { 'resolutionRef.resolutionTransactionHash': 1 },
  { sparse: true }
);

const OracleProvenanceRecord = mongoose.model(
  'OracleProvenanceRecord',
  oracleProvenanceRecordSchema
);

OracleProvenanceRecord.VALIDATION_STATUSES = VALIDATION_STATUSES;
OracleProvenanceRecord.REJECTION_REASONS = REJECTION_REASONS;

module.exports = OracleProvenanceRecord;

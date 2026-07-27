#![no_std]

use soroban_sdk::{contracttype, Address, Bytes, String, Vec};

use core::option::Option;

/* ============================================================
   ENUMS
============================================================ */

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MarketCategory {
    Sports,
    Crypto,
    Politics,
    Weather,
    Entertainment,
    Technology,
    Economics,
    Science,
    Other,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MarketStatus {
    Pending,
    Active,
    Resolved,
    Cancelled,
    Paused,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TokenType {
    Yes,
    No,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TradeType {
    Buy,
    Sell,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OrderType {
    Market,
    Limit,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalType {
    ParameterChange,
    OracleAddition,
    EmergencyAction,
    UpgradeContract,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VoteChoice {
    For,
    Against,
    Abstain,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Role {
    SuperAdmin,  // Can manage all roles and permissions
    Admin,       // Can manage users and basic operations
    Moderator,   // Can moderate content and resolve disputes
    Oracle,      // Can submit oracle data
    User,        // Basic user permissions
    Blacklisted, // No permissions
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Permission {
    CreateMarket,
    ResolveMarket,
    ModerateContent,
    ManageUsers,
    SubmitOracleData,
    ClaimRewards,
    TransferTokens,
    PauseContract,
    EmergencyAction,
}

/* ============================================================
   STRUCTS
============================================================ */

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketInfo {
    pub market_id: String,
    pub question: String,
    pub category: MarketCategory,
    pub creator: Address,
    pub yes_token_id: Address,
    pub no_token_id: Address,
    pub pool_address: Address,
    pub oracle_address: Address,
    pub created_at: u64,
    pub expires_at: u64,
    pub resolution_criteria: String,
    pub status: MarketStatus,
    pub total_volume: i128,
    pub total_liquidity: i128,
    pub outcome: Option<bool>,
    pub min_liquidity: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TradeInfo {
    pub trader: Address,
    pub market_id: String,
    pub token_type: TokenType,
    pub trade_type: TradeType,
    pub amount: i128,
    pub price: i128,
    pub timestamp: u64,
    pub total_cost: i128,
    pub fees: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolInfo {
    pub pool_id: String,
    pub market_address: Address,
    pub yes_token: Address,
    pub no_token: Address,
    pub yes_reserve: i128,
    pub no_reserve: i128,
    pub k_constant: i128,
    pub total_liquidity: i128,
    pub fee_rate: u32,
    pub total_fees_collected: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserPosition {
    pub user: Address,
    pub market_id: String,
    pub yes_tokens: i128,
    pub no_tokens: i128,
    pub total_invested: i128,
    pub average_yes_price: i128,
    pub average_no_price: i128,
    pub realized_pnl: i128,
    pub unrealized_pnl: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolutionData {
    pub oracle: Address,
    pub market_address: Address,
    pub outcome: bool,
    pub proof_data: Bytes,
    pub timestamp: u64,
    pub confidence: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub proposal_id: u64,
    pub proposer: Address,
    pub proposal_type: ProposalType,
    pub description: String,
    pub execution_calldata: Bytes,
    pub voting_period_end: u64,
    pub for_votes: i128,
    pub against_votes: i128,
    pub abstain_votes: i128,
    pub executed: bool,
    pub cancelled: bool,
    pub created_at: u64,
}

/* ============================================================
   ERRORS (CRITICAL FIX BELOW)
============================================================ */

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OrynError {
    Unauthorized = 1,
    InvalidInput = 2,
    InsufficientBalance = 3,
    ContractPaused = 4,
    NotFound = 5,

    MarketNotFound = 10,
    MarketExpired = 11,
    MarketNotActive = 12,
    MarketAlreadyResolved = 13,
    InvalidMarketCategory = 14,
    InsufficientLiquidity = 15,

    InvalidTokenType = 20,
    SlippageExceeded = 21,
    InvalidTradeAmount = 22,
    OrderNotFound = 23,
    InvalidPrice = 24,

    OracleNotRegistered = 30,
    InvalidProofData = 31,
    ConsensusNotReached = 32,
    ResolutionNotFound = 33,
    DisputePeriodActive = 34,

    ProposalNotFound = 40,
    VotingPeriodEnded = 41,
    VotingPeriodActive = 42,
    AlreadyVoted = 43,
    InsufficientVotingPower = 44,
    QuorumNotReached = 45,
    ProposalNotSucceeded = 46,

    InsufficientReserves = 50,
    InvalidK = 51,
    NoLiquidity = 52,
    InvalidFeeRate = 53,

    // AMM Risk Control Errors (70-79)
    CircuitBreakerTriggered = 70,
    LiquidityImbalanceDetected = 71,
    TradingLimitExceeded = 72,
    EmergencyPauseActive = 73,
    PriceDeviationTooHigh = 74,
    RapidVolumeSpikeDetected = 75,
    MaxDrawdownExceeded = 76,
    CooldownPeriodActive = 77,

    SnapshotNotFound = 60,
    SnapshotAlreadyExists = 61,
    SnapshotCorrupted = 62,
    SnapshotRollbackNotAuthorized = 63,
    SnapshotIntegrityCheckFailed = 64,
    SnapshotCreationFailed = 65,
    SnapshotRestoreFailed = 66,
}

/* 🔥 THIS IS THE MOST IMPORTANT FIX 🔥 */
impl From<OrynError> for soroban_sdk::Error {
    fn from(e: OrynError) -> Self {
        soroban_sdk::Error::from_contract_error(e as u32)
    }
}

impl From<&OrynError> for soroban_sdk::Error {
    fn from(e: &OrynError) -> Self {
        soroban_sdk::Error::from_contract_error(*e as u32)
    }
}

impl From<soroban_sdk::Error> for OrynError {
    fn from(_: soroban_sdk::Error) -> Self {
        OrynError::InvalidInput
    }
}

/* ============================================================
   CONSTANTS
============================================================ */

pub const PRECISION: i128 = 1_000_000_000;
pub const MAX_FEE_RATE: u32 = 10_000;
pub const MAX_SLIPPAGE_BPS: u32 = 500;
pub const MIN_LIQUIDITY: i128 = 1000 * PRECISION;
pub const MAX_MARKET_DURATION: u64 = 365 * 24 * 60 * 60;
pub const MIN_MARKET_DURATION: u64 = 60 * 60;
pub const DISPUTE_PERIOD: u64 = 7 * 24 * 60 * 60;
pub const MAX_SNAPSHOTS: u32 = 100;
pub const SNAPSHOT_RETENTION_PERIOD: u64 = 90 * 24 * 60 * 60;
pub const SNAPSHOT_PREFIX: &str = "SNAP";

// AMM Risk Control Constants
pub const CIRCUIT_BREAKER_THRESHOLD_BPS: i128 = 1000; // 10% price deviation triggers circuit breaker
pub const CIRCUIT_BREAKER_COOLDOWN: u64 = 300; // 5 minutes cooldown after circuit breaker
pub const LIQUIDITY_IMBALANCE_THRESHOLD_BPS: i128 = 3000; // 30% imbalance threshold
pub const MAX_TRADE_SIZE_BPS: i128 = 500; // 5% of pool reserves max trade size
pub const MAX_DRAWDOWN_BPS: i128 = 2000; // 20% max drawdown before emergency pause
pub const VOLUME_SPIKE_MULTIPLIER: i128 = 500; // 5x average volume triggers alert
pub const PRICE_DEVIATION_THRESHOLD_BPS: i128 = 500; // 5% price deviation threshold
pub const DYNAMIC_LIMIT_WINDOW: u64 = 3600; // 1 hour rolling window for dynamic limits

/* ============================================================
   HELPERS
============================================================ */

impl MarketInfo {
    pub fn is_active(&self) -> bool {
        self.status == MarketStatus::Active
    }

    pub fn is_expired(&self, now: u64) -> bool {
        now >= self.expires_at
    }

    pub fn can_trade(&self, now: u64) -> bool {
        self.is_active() && !self.is_expired(now)
    }
}

impl PoolInfo {
    pub fn calculate_price(&self) -> i128 {
        if self.no_reserve == 0 {
            PRECISION
        } else {
            self.yes_reserve * PRECISION / self.no_reserve
        }
    }

    pub fn calculate_k(&self) -> i128 {
        self.yes_reserve * self.no_reserve
    }
}

/* ============================================================
   AMM RISK CONTROL STRUCTS
============================================================ */

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircuitBreakerState {
    pub is_triggered: bool,
    pub triggered_at: u64,
    pub cooldown_end: u64,
    pub trigger_count: u32,
    pub last_price: i128,
}

impl Default for CircuitBreakerState {
    fn default() -> Self {
        Self {
            is_triggered: false,
            triggered_at: 0,
            cooldown_end: 0,
            trigger_count: 0,
            last_price: 0,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityImbalanceState {
    pub yes_reserve: i128,
    pub no_reserve: i128,
    pub imbalance_bps: i128,
    pub is_imbalanced: bool,
    pub last_check_timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TradingLimits {
    pub max_trade_size: i128,
    pub max_trades_per_window: u32,
    pub current_window_trades: u32,
    pub window_start: u64,
    pub max_drawdown_bps: i128,
    pub current_drawdown_bps: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiskMetrics {
    pub circuit_breaker: CircuitBreakerState,
    pub liquidity_imbalance: LiquidityImbalanceState,
    pub trading_limits: TradingLimits,
    pub emergency_paused: bool,
    pub last_price: i128,
    pub peak_price: i128,
    pub price_history_len: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RiskAlertType {
    CircuitBreakerTriggered,
    LiquidityImbalance,
    TradingLimitExceeded,
    EmergencyPauseActivated,
    PriceDeviationHigh,
    VolumeSpike,
    MaxDrawdownExceeded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiskAlert {
    pub alert_type: RiskAlertType,
    pub severity: u32, // 1-5, 5 being critical
    pub message: String,
    pub timestamp: u64,
    pub pool_id: String,
}

/* ============================================================
   EVENTS (AMM)
============================================================ */

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityEvent {
    pub provider: Address,
    pub pool_id: String,
    pub amount: i128,
    pub yes_tokens: i128,
    pub no_tokens: i128,
    pub lp_tokens: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapEvent {
    pub trader: Address,
    pub pool_id: String,
    pub token_in: TokenType,
    pub token_out: TokenType,
    pub amount_in: i128,
    pub amount_out: i128,
    pub price: i128,
    pub fee: i128,
    pub timestamp: u64,
}
/// Governance events

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub proposer: Address,
    pub proposal_type: ProposalType,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteCastEvent {
    pub proposal_id: u64,
    pub voter: Address,
    pub choice: VoteChoice,
    pub voting_power: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalExecutedEvent {
    pub proposal_id: u64,
    pub executor: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgradedEvent {
    pub proposal_id: u64,
    pub new_wasm_hash: Bytes,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ResolutionSubmittedEvent {
    pub oracle: Address,
    pub market_address: Address,
    pub outcome: bool,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ResolutionFinalizedEvent {
    pub market_address: Address,
    pub final_outcome: bool,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SnapshotStatus {
    Created,
    Verified,
    Restored,
    Expired,
    Corrupted,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotMetadata {
    pub snapshot_id: String,
    pub version: u64,
    pub timestamp: u64,
    pub contract_count: u32,
    pub state_hash: Bytes,
    pub status: SnapshotStatus,
    pub created_by: Address,
    pub description: String,
    pub parent_snapshot_id: String,
    pub contracts_registry: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotRegistryEntry {
    pub contract_address: Address,
    pub contract_type: String,
    pub state_keys: Vec<String>,
    pub state_hash: Bytes,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotCreatedEvent {
    pub snapshot_id: String,
    pub version: u64,
    pub contract_count: u32,
    pub state_hash: Bytes,
    pub created_by: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotRestoredEvent {
    pub snapshot_id: String,
    pub restored_by: Address,
    pub previous_state_hash: Bytes,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SnapshotVerifiedEvent {
    pub snapshot_id: String,
    pub integrity_valid: bool,
    pub timestamp: u64,
}

// AMM Risk Control Events
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircuitBreakerEvent {
    pub pool_id: String,
    pub is_triggered: bool,
    pub trigger_count: u32,
    pub price_deviation_bps: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityImbalanceEvent {
    pub pool_id: String,
    pub yes_reserve: i128,
    pub no_reserve: i128,
    pub imbalance_bps: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TradingLimitEvent {
    pub pool_id: String,
    pub trader: Address,
    pub trade_size: i128,
    pub max_allowed: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmergencyPauseEvent {
    pub pool_id: String,
    pub reason: String,
    pub triggered_by: Address,
    pub timestamp: u64,
}

/* REQUIRED FOR ALL CONTRACTS */

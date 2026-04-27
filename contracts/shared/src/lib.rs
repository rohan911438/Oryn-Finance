#![no_std]

use soroban_sdk::{contracttype, Address, Bytes, Error, String};

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
    SuperAdmin,    // Can manage all roles and permissions
    Admin,         // Can manage users and basic operations
    Moderator,     // Can moderate content and resolve disputes
    Oracle,        // Can submit oracle data
    User,          // Basic user permissions
    Blacklisted,   // No permissions
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
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OrynError {
    Unauthorized = 1,
    InvalidInput = 2,
    InsufficientBalance = 3,
    ContractPaused = 4,

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
    AlreadyVoted = 42,
    InsufficientVotingPower = 43,
    QuorumNotReached = 44,

    InsufficientReserves = 50,
    InvalidK = 51,
    NoLiquidity = 52,
    InvalidFeeRate = 53,
}

/* 🔥 THIS IS THE MOST IMPORTANT FIX 🔥 */
impl From<OrynError> for soroban_sdk::Error {
    fn from(e: OrynError) -> Self {
        soroban_sdk::Error::from_contract_error(e as u32)
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

/* REQUIRED FOR ALL CONTRACTS */

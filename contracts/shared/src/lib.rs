use soroban_sdk::{contracttype, Address, String, Vec, Bytes};

/// Market categories for classification
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

/// Market status states
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MarketStatus {
    Pending,   // Market created but not yet active
    Active,    // Market is active for trading
    Resolved,  // Market has been resolved with outcome
    Cancelled, // Market has been cancelled
    Paused,    // Market temporarily paused
}

/// Token types for prediction markets
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TokenType {
    Yes,
    No,
}

/// Trade types
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TradeType {
    Buy,
    Sell,
}

/// Order types for trading
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OrderType {
    Market,
    Limit,
}

/// Proposal types for governance
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalType {
    ParameterChange,
    OracleAddition,
    EmergencyAction,
    UpgradeContract,
}

/// Vote choices for governance
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VoteChoice {
    For,
    Against,
    Abstain,
}

/// Market metadata structure
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

/// Trade execution details
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

/// Liquidity pool information
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
    pub fee_rate: u32, // Basis points (e.g., 30 = 0.3%)
    pub total_fees_collected: i128,
}

/// User position in a market
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

/// Oracle resolution data
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolutionData {
    pub oracle: Address,
    pub market_address: Address,
    pub outcome: bool,
    pub proof_data: Bytes,
    pub timestamp: u64,
    pub confidence: u32, // Percentage 0-100
}

/// Governance proposal structure
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

/// Error codes used across all contracts
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OrynError {
    // General errors
    Unauthorized = 1,
    InvalidInput = 2,
    InsufficientBalance = 3,
    ContractPaused = 4,
    
    // Market errors
    MarketNotFound = 10,
    MarketExpired = 11,
    MarketNotActive = 12,
    MarketAlreadyResolved = 13,
    InvalidMarketCategory = 14,
    InsufficientLiquidity = 15,
    
    // Trading errors  
    InvalidTokenType = 20,
    SlippageExceeded = 21,
    InvalidTradeAmount = 22,
    OrderNotFound = 23,
    InvalidPrice = 24,
    
    // Oracle errors
    OracleNotRegistered = 30,
    InvalidProofData = 31,
    ConsensusNotReached = 32,
    ResolutionNotFound = 33,
    DisputePeriodActive = 34,
    
    // Governance errors
    ProposalNotFound = 40,
    VotingPeriodEnded = 41,
    AlreadyVoted = 42,
    InsufficientVotingPower = 43,
    QuorumNotReached = 44,
    
    // Pool errors
    InsufficientReserves = 50,
    InvalidK = 51,
    NoLiquidity = 52,
    InvalidFeeRate = 53,
}

/// Constants used across contracts
pub const PRECISION: i128 = 1_000_000_000; // 9 decimal precision
pub const MAX_FEE_RATE: u32 = 10000; // 100% in basis points
pub const MIN_LIQUIDITY: i128 = 1000 * PRECISION; // Minimum liquidity in scaled units
pub const MAX_MARKET_DURATION: u64 = 365 * 24 * 60 * 60; // 1 year in seconds
pub const MIN_MARKET_DURATION: u64 = 60 * 60; // 1 hour in seconds
pub const DISPUTE_PERIOD: u64 = 7 * 24 * 60 * 60; // 7 days in seconds

/// Helper functions
impl MarketInfo {
    pub fn is_active(&self) -> bool {
        self.status == MarketStatus::Active
    }
    
    pub fn is_expired(&self, current_time: u64) -> bool {
        current_time >= self.expires_at
    }
    
    pub fn can_trade(&self, current_time: u64) -> bool {
        self.is_active() && !self.is_expired(current_time)
    }
}

impl PoolInfo {
    pub fn calculate_price(&self) -> i128 {
        if self.no_reserve == 0 {
            return PRECISION;
        }
        self.yes_reserve * PRECISION / self.no_reserve
    }
    
    pub fn calculate_k(&self) -> i128 {
        self.yes_reserve * self.no_reserve
    }
}

/// Event types for cross-contract communication
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketCreatedEvent {
    pub market_id: String,
    pub creator: Address,
    pub contract_address: Address,
    pub question: String,
    pub category: MarketCategory,
    pub expires_at: u64,
    pub initial_liquidity: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TradeExecutedEvent {
    pub trader: Address,
    pub market_id: String,
    pub token_type: TokenType,
    pub trade_type: TradeType,
    pub amount: i128,
    pub price: i128,
    pub total_cost: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketResolvedEvent {
    pub market_id: String,
    pub outcome: bool,
    pub oracle: Address,
    pub timestamp: u64,
    pub total_volume: i128,
}

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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub proposer: Address,
    pub proposal_type: ProposalType,
    pub description: String,
    pub voting_period_end: u64,
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
pub struct ResolutionSubmittedEvent {
    pub oracle: Address,
    pub market_address: Address,
    pub outcome: bool,
    pub proof_data: Bytes,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolutionFinalizedEvent {
    pub market_address: Address,
    pub final_outcome: bool,
    pub participating_oracles: Vec<Address>,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgradedEvent {
    pub old_contract: Address,
    pub new_contract: Address,
    pub upgrade_time: u64,
    pub version: String,
}
#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Map, Symbol, Bytes
};

use oryn_shared::{
    ResolutionData, OrynError, ResolutionSubmittedEvent, ResolutionFinalizedEvent,
    ContractUpgradedEvent, DISPUTE_PERIOD
};

// Contract metadata
contractmeta!(
    key = "Description",
    val = "Oryn Finance Oracle Resolver - Decentralized market resolution system"
);

/// Storage keys for the oracle resolver contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Admin address
    Admin,
    /// Registered oracles: Address -> OracleInfo
    Oracle(Address),
    /// List of all registered oracles
    AllOracles,
    /// Market resolutions: market_address -> ResolutionState
    MarketResolution(Address),
    /// Dispute tracking: market_address -> DisputeInfo
    MarketDispute(Address),
    /// Oracle submissions: (market_address, oracle_address) -> ResolutionData
    OracleSubmission(Address, Address),
    /// Consensus threshold (number of oracles required)
    ConsensusThreshold,
    /// Minimum oracle reputation required
    MinOracleReputation,
    /// Dispute bond amount
    DisputeBond,
    /// Oracle stake amounts: Address -> i128
    OracleStake(Address),
    /// Slashed oracles tracking
    SlashedOracle(Address),
    /// Factory contract address (for market verification)
    Factory,
    /// Governance contract address
    Governance,
    /// Paused state
    Paused,
    /// Initialization flag
    Initialized,
}

/// Oracle information
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleInfo {
    pub oracle_address: Address,
    pub reputation_score: i128,
    pub total_resolutions: u64,
    pub correct_resolutions: u64,
    pub stake_amount: i128,
    pub registered_at: u64,
    pub is_active: bool,
    pub specializations: Vec<String>, // Market categories they specialize in
}

/// Market resolution state
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResolutionState {
    Pending,           // No submissions yet
    Collecting,        // Collecting oracle submissions
    Consensus,         // Consensus reached, waiting for dispute period
    Disputed,          // Under dispute
    Finalized,         // Resolution finalized
    Emergency,         // Emergency override active
}

/// Resolution tracking for a market
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketResolutionInfo {
    pub market_address: Address,
    pub state: ResolutionState,
    pub submitted_outcomes: Map<Address, bool>, // Oracle -> outcome
    pub outcome_counts: Map<bool, u32>,         // Outcome -> count
    pub consensus_outcome: Option<bool>,
    pub consensus_reached_at: Option<u64>,
    pub dispute_deadline: Option<u64>,
    pub finalized_at: Option<u64>,
    pub participating_oracles: Vec<Address>,
}

/// Dispute information
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeInfo {
    pub disputer: Address,
    pub disputed_outcome: bool,
    pub proposed_outcome: bool,
    pub bond_amount: i128,
    pub dispute_timestamp: u64,
    pub evidence: Bytes,
    pub resolved: bool,
    pub dispute_winner: Option<Address>,
}

/// Oracle performance metrics
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleMetrics {
    pub accuracy_rate: i128,   // Percentage * PRECISION
    pub response_time: u64,    // Average response time in seconds
    pub stake_at_risk: i128,
    pub recent_performance: Vec<bool>, // Last 10 resolutions
}

#[contract]
pub struct OracleResolverContract;

#[contractimpl]
impl OracleResolverContract {
    /// Initialize the oracle resolver contract
    pub fn initialize(
        env: Env,
        admin: Address,
        factory: Address,
        governance: Address,
        consensus_threshold: u32,
        min_oracle_reputation: i128,
        dispute_bond: i128,
    ) -> Result<(), OrynError> {
        // Ensure contract hasn't been initialized
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput);
        }

        admin.require_auth();

        // Store configuration
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::Factory, &factory);
        env.storage().persistent().set(&StorageKey::Governance, &governance);
        env.storage().persistent().set(&StorageKey::ConsensusThreshold, &consensus_threshold);
        env.storage().persistent().set(&StorageKey::MinOracleReputation, &min_oracle_reputation);
        env.storage().persistent().set(&StorageKey::DisputeBond, &dispute_bond);
        env.storage().persistent().set(&StorageKey::AllOracles, &Vec::<Address>::new(&env));
        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        Ok(())
    }

    /// Register a new oracle (admin only)
    pub fn register_oracle(
        env: Env,
        admin: Address,
        oracle_address: Address,
        initial_reputation: i128,
        stake_amount: i128,
        specializations: Vec<String>,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        // Verify oracle is not already registered
        if env.storage().persistent().has(&StorageKey::Oracle(oracle_address.clone())) {
            return Err(OrynError::InvalidInput);
        }

        // Verify stake amount meets minimum requirements
        let min_reputation = Self::get_min_oracle_reputation(&env);
        if initial_reputation < min_reputation {
            return Err(OrynError::InsufficientBalance);
        }

        // Transfer stake from oracle
        Self::transfer_stake_from_oracle(&env, &oracle_address, stake_amount)?;

        let oracle_info = OracleInfo {
            oracle_address: oracle_address.clone(),
            reputation_score: initial_reputation,
            total_resolutions: 0,
            correct_resolutions: 0,
            stake_amount,
            registered_at: env.ledger().timestamp(),
            is_active: true,
            specializations,
        };

        // Store oracle info
        env.storage().persistent().set(&StorageKey::Oracle(oracle_address.clone()), &oracle_info);
        env.storage().persistent().set(&StorageKey::OracleStake(oracle_address.clone()), &stake_amount);

        // Add to oracle list
        let mut all_oracles: Vec<Address> = env.storage().persistent()
            .get(&StorageKey::AllOracles)
            .unwrap_or(Vec::new(&env));
        all_oracles.push_back(oracle_address);
        env.storage().persistent().set(&StorageKey::AllOracles, &all_oracles);

        Ok(())
    }

    /// Submit a resolution for a market
    pub fn submit_resolution(
        env: Env,
        oracle: Address,
        market_address: Address,
        outcome: bool,
        proof_data: Bytes,
        confidence: u32,
    ) -> Result<(), OrynError> {
        Self::require_not_paused(&env)?;
        oracle.require_auth();

        // Verify oracle is registered and active
        let oracle_info = Self::get_oracle_info(&env, &oracle)?;
        if !oracle_info.is_active {
            return Err(OrynError::OracleNotRegistered);
        }

        // Verify oracle hasn't already submitted for this market
        let submission_key = StorageKey::OracleSubmission(market_address.clone(), oracle.clone());
        if env.storage().persistent().has(&submission_key) {
            return Err(OrynError::InvalidInput);
        }

        // Verify market exists and can be resolved
        Self::verify_market_can_be_resolved(&env, &market_address)?;

        // Validate proof data
        Self::validate_proof_data(&env, &market_address, &proof_data)?;

        let current_time = env.ledger().timestamp();

        // Create resolution data
        let resolution_data = ResolutionData {
            oracle: oracle.clone(),
            market_address: market_address.clone(),
            outcome,
            proof_data,
            timestamp: current_time,
            confidence,
        };

        // Store oracle submission
        env.storage().persistent().set(&submission_key, &resolution_data);

        // Get or create market resolution info
        let resolution_key = StorageKey::MarketResolution(market_address.clone());
        let mut market_resolution = env.storage().persistent()
            .get::<StorageKey, MarketResolutionInfo>(&resolution_key)
            .unwrap_or(MarketResolutionInfo {
                market_address: market_address.clone(),
                state: ResolutionState::Pending,
                submitted_outcomes: Map::new(&env),
                outcome_counts: Map::new(&env),
                consensus_outcome: None,
                consensus_reached_at: None,
                dispute_deadline: None,
                finalized_at: None,
                participating_oracles: Vec::new(&env),
            });

        // Update market resolution state
        market_resolution.state = ResolutionState::Collecting;
        market_resolution.submitted_outcomes.set(oracle.clone(), outcome);
        market_resolution.participating_oracles.push_back(oracle.clone());

        // Update outcome counts
        let current_count = market_resolution.outcome_counts.get(outcome).unwrap_or(0);
        market_resolution.outcome_counts.set(outcome, current_count + 1);

        // Check if consensus is reached
        let consensus_threshold = Self::get_consensus_threshold(&env);
        let total_submissions = market_resolution.participating_oracles.len();
        
        if current_count + 1 >= consensus_threshold {
            market_resolution.consensus_outcome = Some(outcome);
            market_resolution.consensus_reached_at = Some(current_time);
            market_resolution.dispute_deadline = Some(current_time + DISPUTE_PERIOD);
            market_resolution.state = ResolutionState::Consensus;
        }

        // Store updated market resolution
        env.storage().persistent().set(&resolution_key, &market_resolution);

        // Emit resolution submitted event
        env.events().publish((
            symbol_short!("resolution"),
            symbol_short!("submitted"),
        ), ResolutionSubmittedEvent {
            oracle,
            market_address,
            outcome,
            proof_data,
            timestamp: current_time,
        });

        // If consensus reached, start dispute period
        if market_resolution.consensus_outcome.is_some() {
            Self::start_dispute_period(&env, &market_address, outcome)?;
        }

        Ok(())
    }

    /// Dispute a resolution (requires bond)
    pub fn dispute_resolution(
        env: Env,
        disputer: Address,
        market_address: Address,
        proposed_outcome: bool,
        evidence: Bytes,
    ) -> Result<(), OrynError> {
        disputer.require_auth();

        let market_resolution: MarketResolutionInfo = env.storage().persistent()
            .get(&StorageKey::MarketResolution(market_address.clone()))
            .ok_or(OrynError::ResolutionNotFound)?;

        // Verify market is in consensus state and dispute period is active
        if market_resolution.state != ResolutionState::Consensus {
            return Err(OrynError::InvalidInput);
        }

        let current_time = env.ledger().timestamp();
        if current_time > market_resolution.dispute_deadline.unwrap_or(0) {
            return Err(OrynError::DisputePeriodExpired);
        }

        // Verify proposed outcome is different from consensus
        let consensus_outcome = market_resolution.consensus_outcome.unwrap();
        if proposed_outcome == consensus_outcome {
            return Err(OrynError::InvalidInput);
        }

        // Transfer dispute bond from disputer
        let dispute_bond = Self::get_dispute_bond(&env);
        Self::transfer_dispute_bond(&env, &disputer, dispute_bond)?;

        let dispute_info = DisputeInfo {
            disputer: disputer.clone(),
            disputed_outcome: consensus_outcome,
            proposed_outcome,
            bond_amount: dispute_bond,
            dispute_timestamp: current_time,
            evidence,
            resolved: false,
            dispute_winner: None,
        };

        // Store dispute info
        env.storage().persistent().set(&StorageKey::MarketDispute(market_address.clone()), &dispute_info);

        // Update market resolution state
        let mut updated_resolution = market_resolution;
        updated_resolution.state = ResolutionState::Disputed;
        env.storage().persistent().set(&StorageKey::MarketResolution(market_address), &updated_resolution);

        Ok(())
    }

    /// Finalize resolution after dispute period
    pub fn finalize_resolution(
        env: Env,
        market_address: Address,
    ) -> Result<(), OrynError> {
        let mut market_resolution: MarketResolutionInfo = env.storage().persistent()
            .get(&StorageKey::MarketResolution(market_address.clone()))
            .ok_or(OrynError::ResolutionNotFound)?;

        let current_time = env.ledger().timestamp();

        match market_resolution.state {
            ResolutionState::Consensus => {
                // Check if dispute period has expired
                if current_time <= market_resolution.dispute_deadline.unwrap_or(0) {
                    return Err(OrynError::DisputePeriodActive);
                }

                // Finalize with consensus outcome
                let final_outcome = market_resolution.consensus_outcome.unwrap();
                Self::execute_market_resolution(&env, &market_address, final_outcome)?;
                
                market_resolution.state = ResolutionState::Finalized;
                market_resolution.finalized_at = Some(current_time);
            },
            ResolutionState::Disputed => {
                // Check if dispute has been resolved
                let dispute_info: DisputeInfo = env.storage().persistent()
                    .get(&StorageKey::MarketDispute(market_address.clone()))
                    .ok_or(OrynError::InvalidInput)?;
                
                if !dispute_info.resolved {
                    return Err(OrynError::InvalidInput);
                }

                // Finalize with dispute resolution outcome
                Self::execute_market_resolution(&env, &market_address, dispute_info.proposed_outcome)?;
                
                market_resolution.state = ResolutionState::Finalized;
                market_resolution.finalized_at = Some(current_time);
                market_resolution.consensus_outcome = Some(dispute_info.proposed_outcome);
            },
            _ => {
                return Err(OrynError::InvalidInput);
            }
        }

        // Update oracle reputation based on correctness
        Self::update_oracle_reputations(&env, &market_resolution)?;

        // Store updated resolution
        env.storage().persistent().set(&StorageKey::MarketResolution(market_address.clone()), &market_resolution);

        // Emit finalized event
        env.events().publish((
            symbol_short!("resolution"),
            symbol_short!("finalized"),
        ), ResolutionFinalizedEvent {
            market_address,
            final_outcome: market_resolution.consensus_outcome.unwrap(),
            participating_oracles: market_resolution.participating_oracles,
            timestamp: current_time,
        });

        Ok(())
    }

    /// Emergency override (admin only)
    pub fn emergency_override(
        env: Env,
        admin: Address,
        market_address: Address,
        outcome: bool,
        reason: String,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        // Execute market resolution directly
        Self::execute_market_resolution(&env, &market_address, outcome)?;

        // Update market resolution state
        let mut market_resolution = env.storage().persistent()
            .get::<StorageKey, MarketResolutionInfo>(&StorageKey::MarketResolution(market_address.clone()))
            .unwrap_or(MarketResolutionInfo {
                market_address: market_address.clone(),
                state: ResolutionState::Pending,
                submitted_outcomes: Map::new(&env),
                outcome_counts: Map::new(&env),
                consensus_outcome: None,
                consensus_reached_at: None,
                dispute_deadline: None,
                finalized_at: None,
                participating_oracles: Vec::new(&env),
            });

        market_resolution.state = ResolutionState::Emergency;
        market_resolution.consensus_outcome = Some(outcome);
        market_resolution.finalized_at = Some(env.ledger().timestamp());

        env.storage().persistent().set(&StorageKey::MarketResolution(market_address), &market_resolution);

        Ok(())
    }

    /// Slash oracle for incorrect resolution
    pub fn slash_oracle(
        env: Env,
        admin: Address,
        oracle: Address,
        slash_amount: i128,
        reason: String,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        let mut oracle_info = Self::get_oracle_info(&env, &oracle)?;
        let current_stake = Self::get_oracle_stake(&env, &oracle);

        if current_stake < slash_amount {
            return Err(OrynError::InsufficientBalance);
        }

        // Reduce stake and reputation
        let new_stake = current_stake - slash_amount;
        oracle_info.stake_amount = new_stake;
        oracle_info.reputation_score -= slash_amount / 1000; // Reputation penalty

        // If stake falls below minimum, deactivate oracle
        if new_stake < Self::get_min_oracle_reputation(&env) {
            oracle_info.is_active = false;
        }

        // Store updates
        env.storage().persistent().set(&StorageKey::Oracle(oracle.clone()), &oracle_info);
        env.storage().persistent().set(&StorageKey::OracleStake(oracle.clone()), &new_stake);
        env.storage().persistent().set(&StorageKey::SlashedOracle(oracle), &slash_amount);

        Ok(())
    }

    /// Get resolution status for a market
    pub fn get_resolution_status(env: Env, market_address: Address) -> Result<MarketResolutionInfo, OrynError> {
        env.storage().persistent()
            .get(&StorageKey::MarketResolution(market_address))
            .ok_or(OrynError::ResolutionNotFound)
    }

    /// Get oracle information
    pub fn get_oracle_info(env: Env, oracle: Address) -> Result<OracleInfo, OrynError> {
        env.storage().persistent()
            .get(&StorageKey::Oracle(oracle))
            .ok_or(OrynError::OracleNotRegistered)
    }

    /// Get oracle metrics
    pub fn get_oracle_metrics(env: Env, oracle: Address) -> Result<OracleMetrics, OrynError> {
        let oracle_info = Self::get_oracle_info(env.clone(), oracle.clone())?;
        
        let accuracy_rate = if oracle_info.total_resolutions > 0 {
            (oracle_info.correct_resolutions as i128 * 100 * 1_000_000) / oracle_info.total_resolutions as i128
        } else {
            0
        };

        Ok(OracleMetrics {
            accuracy_rate,
            response_time: 0, // Would track this separately
            stake_at_risk: oracle_info.stake_amount,
            recent_performance: Vec::new(&env), // Would track last 10 resolutions
        })
    }

    /// Get all registered oracles
    pub fn get_all_oracles(env: Env) -> Vec<Address> {
        env.storage().persistent()
            .get(&StorageKey::AllOracles)
            .unwrap_or(Vec::new(&env))
    }

    /// Deactivate oracle (admin only)
    pub fn deactivate_oracle(env: Env, admin: Address, oracle: Address) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        let mut oracle_info = Self::get_oracle_info(&env, &oracle)?;
        oracle_info.is_active = false;
        
        env.storage().persistent().set(&StorageKey::Oracle(oracle), &oracle_info);
        Ok(())
    }

    /// Update consensus threshold (governance only)
    pub fn update_consensus_threshold(
        env: Env,
        governance: Address,
        new_threshold: u32,
    ) -> Result<(), OrynError> {
        Self::require_governance(&env, &governance)?;
        governance.require_auth();

        env.storage().persistent().set(&StorageKey::ConsensusThreshold, &new_threshold);
        Ok(())
    }

    // Internal helper functions

    fn require_admin(env: &Env, caller: &Address) -> Result<(), OrynError> {
        let admin: Address = env.storage().persistent().get(&StorageKey::Admin).unwrap();
        if *caller != admin {
            return Err(OrynError::Unauthorized);
        }
        Ok(())
    }

    fn require_governance(env: &Env, caller: &Address) -> Result<(), OrynError> {
        let governance: Address = env.storage().persistent()
            .get(&StorageKey::Governance)
            .unwrap();
        if *caller != governance {
            return Err(OrynError::Unauthorized);
        }
        Ok(())
    }

    fn require_not_paused(env: &Env) -> Result<(), OrynError> {
        let paused: bool = env.storage().persistent().get(&StorageKey::Paused).unwrap_or(false);
        if paused {
            return Err(OrynError::ContractPaused);
        }
        Ok(())
    }

    fn get_consensus_threshold(env: &Env) -> u32 {
        env.storage().persistent().get(&StorageKey::ConsensusThreshold).unwrap_or(3)
    }

    fn get_min_oracle_reputation(env: &Env) -> i128 {
        env.storage().persistent().get(&StorageKey::MinOracleReputation).unwrap_or(1000)
    }

    fn get_dispute_bond(env: &Env) -> i128 {
        env.storage().persistent().get(&StorageKey::DisputeBond).unwrap_or(10000)
    }

    fn get_oracle_stake(env: &Env, oracle: &Address) -> i128 {
        env.storage().persistent().get(&StorageKey::OracleStake(oracle.clone())).unwrap_or(0)
    }

    fn verify_market_can_be_resolved(env: &Env, market_address: &Address) -> Result<(), OrynError> {
        // Verify market exists and is expired
        // This would call the market contract to check status
        Ok(())
    }

    fn validate_proof_data(env: &Env, market_address: &Address, proof_data: &Bytes) -> Result<(), OrynError> {
        // Validate proof data format and content
        // This could include API signature verification, data format checks, etc.
        if proof_data.len() == 0 {
            return Err(OrynError::InvalidProofData);
        }
        Ok(())
    }

    fn start_dispute_period(env: &Env, market_address: &Address, outcome: bool) -> Result<(), OrynError> {
        // Additional logic for starting dispute period
        // Could notify interested parties, etc.
        Ok(())
    }

    fn execute_market_resolution(env: &Env, market_address: &Address, outcome: bool) -> Result<(), OrynError> {
        // Call the prediction market contract to finalize resolution
        // This would be done via cross-contract call
        Ok(())
    }

    fn update_oracle_reputations(env: &Env, market_resolution: &MarketResolutionInfo) -> Result<(), OrynError> {
        let final_outcome = market_resolution.consensus_outcome.unwrap();
        
        for oracle_addr in market_resolution.participating_oracles.iter() {
            let oracle = oracle_addr.unwrap();
            let submitted_outcome = market_resolution.submitted_outcomes.get(oracle.clone()).unwrap();
            let was_correct = submitted_outcome == final_outcome;
            
            let mut oracle_info = Self::get_oracle_info(env, oracle.clone()).unwrap();
            oracle_info.total_resolutions += 1;
            
            if was_correct {
                oracle_info.correct_resolutions += 1;
                oracle_info.reputation_score += 10; // Reward for correct resolution
            } else {
                oracle_info.reputation_score -= 5; // Penalty for incorrect resolution
            }
            
            env.storage().persistent().set(&StorageKey::Oracle(oracle), &oracle_info);
        }
        
        Ok(())
    }

    // Placeholder functions for financial operations
    fn transfer_stake_from_oracle(env: &Env, oracle: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer stake tokens from oracle to contract
        Ok(())
    }

    fn transfer_dispute_bond(env: &Env, disputer: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer dispute bond from disputer to contract
        Ok(())
    }
}
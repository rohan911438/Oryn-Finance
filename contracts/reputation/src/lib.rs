#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Map, Symbol
};

use oryn_shared::{OrynError, PRECISION};

// Contract metadata
contractmeta!(
    key = "Description",
    val = "Oryn Finance Reputation System - User and oracle reliability tracking"
);

/// Storage keys for the reputation contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Admin address
    Admin,
    /// User reputation scores: Address -> ReputationInfo
    UserReputation(Address),
    /// Oracle reputation scores: Address -> OracleReputationInfo  
    OracleReputation(Address),
    /// Market prediction records: (Address, market_id) -> PredictionRecord
    PredictionRecord(Address, String),
    /// Oracle resolution records: (Address, market_id) -> ResolutionRecord
    ResolutionRecord(Address, String),
    /// Leaderboard data
    UserLeaderboard,
    OracleLeaderboard,
    /// Reputation decay parameters
    DecayParameters,
    /// Minimum reputation scores
    MinReputationThresholds,
    /// Authorized reputation updaters: Address -> bool
    ReputationUpdater(Address),
    /// Factory and oracle contracts
    FactoryContract,
    OracleContract,
    /// Initialization flag
    Initialized,
}

/// User reputation information
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationInfo {
    pub user_address: Address,
    pub reputation_score: i128,
    pub total_predictions: u64,
    pub correct_predictions: u64,
    pub total_volume_predicted: i128,
    pub accuracy_rate: i128,        // Percentage * PRECISION
    pub weighted_accuracy: i128,    // Volume-weighted accuracy
    pub last_activity: u64,
    pub reputation_tier: ReputationTier,
    pub streak_count: u32,          // Current correct prediction streak
    pub max_streak: u32,            // Best ever streak
    pub predictions_last_30d: u32,
    pub accuracy_last_30d: i128,
}

/// Oracle reputation information  
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleReputationInfo {
    pub oracle_address: Address,
    pub reputation_score: i128,
    pub total_resolutions: u64,
    pub correct_resolutions: u64,
    pub accuracy_rate: i128,
    pub average_response_time: u64,
    pub stake_amount: i128,
    pub slash_count: u32,
    pub last_activity: u64,
    pub specialization_scores: Map<String, i128>, // Category -> accuracy score
    pub tier: OracleTier,
}

/// Reputation tiers for users
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReputationTier {
    Novice,      // 0-499 reputation
    Amateur,     // 500-999 reputation
    Trader,      // 1000-2499 reputation
    Expert,      // 2500-4999 reputation  
    Master,      // 5000-9999 reputation
    Legend,      // 10000+ reputation
}

/// Oracle tiers
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleTier {
    Bronze,      // Basic oracle
    Silver,      // Proven accuracy
    Gold,        // High accuracy + volume
    Platinum,    // Elite oracle
    Diamond,     // Top tier oracle
}

/// Prediction record for tracking accuracy
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PredictionRecord {
    pub user: Address,
    pub market_id: String,
    pub predicted_outcome: bool,
    pub amount_wagered: i128,
    pub prediction_timestamp: u64,
    pub market_resolution: Option<bool>,
    pub was_correct: Option<bool>,
    pub payout_received: i128,
}

/// Oracle resolution record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolutionRecord {
    pub oracle: Address,
    pub market_id: String,
    pub submitted_outcome: bool,
    pub final_outcome: bool,
    pub submission_timestamp: u64,
    pub resolution_timestamp: u64,
    pub was_correct: bool,
    pub response_time: u64,
    pub market_category: String,
}

/// Leaderboard entry
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LeaderboardEntry {
    pub address: Address,
    pub reputation_score: i128,
    pub accuracy_rate: i128,
    pub total_volume: i128,
    pub rank: u32,
}

/// Reputation decay parameters
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DecayParameters {
    pub decay_rate: i128,           // Daily decay rate (basis points)
    pub min_activity_period: u64,   // Days of inactivity before decay starts
    pub max_decay_amount: i128,     // Maximum reputation loss per decay cycle
}

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    /// Initialize the reputation contract
    pub fn initialize(
        env: Env,
        admin: Address,
        factory_contract: Address,
        oracle_contract: Address,
        decay_params: DecayParameters,
    ) -> Result<(), OrynError> {
        // Ensure contract hasn't been initialized
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput);
        }

        admin.require_auth();

        // Store configuration
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::FactoryContract, &factory_contract);
        env.storage().persistent().set(&StorageKey::OracleContract, &oracle_contract);
        env.storage().persistent().set(&StorageKey::DecayParameters, &decay_params);
        env.storage().persistent().set(&StorageKey::UserLeaderboard, &Vec::<LeaderboardEntry>::new(&env));
        env.storage().persistent().set(&StorageKey::OracleLeaderboard, &Vec::<LeaderboardEntry>::new(&env));
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        // Authorize factory and oracle contracts as reputation updaters
        env.storage().persistent().set(&StorageKey::ReputationUpdater(factory_contract), &true);
        env.storage().persistent().set(&StorageKey::ReputationUpdater(oracle_contract), &true);

        Ok(())
    }

    /// Update user reputation based on prediction accuracy
    pub fn update_user_reputation(
        env: Env,
        updater: Address,
        user: Address,
        market_id: String,
        prediction_outcome: bool,
        actual_outcome: bool,
        amount_wagered: i128,
        market_difficulty: u32, // 1-10 scale
    ) -> Result<(), OrynError> {
        Self::require_authorized_updater(&env, &updater)?;
        updater.require_auth();

        let mut reputation = Self::get_user_reputation_info(&env, &user);
        let was_correct = prediction_outcome == actual_outcome;
        
        // Calculate reputation delta based on accuracy and market difficulty
        let base_delta = if was_correct { 
            10 + (market_difficulty as i128) 
        } else { 
            -(5 + (market_difficulty as i128) / 2) 
        };
        
        // Apply volume weighting (larger bets = more reputation impact)
        let volume_multiplier = (amount_wagered / PRECISION).min(5).max(1); // Cap at 5x multiplier
        let reputation_delta = base_delta * volume_multiplier;

        // Update reputation score
        reputation.reputation_score = (reputation.reputation_score + reputation_delta).max(0);
        reputation.total_predictions += 1;
        reputation.total_volume_predicted += amount_wagered;
        
        if was_correct {
            reputation.correct_predictions += 1;
            reputation.streak_count += 1;
            reputation.max_streak = reputation.max_streak.max(reputation.streak_count);
        } else {
            reputation.streak_count = 0;
        }
        
        // Recalculate accuracy rates
        reputation.accuracy_rate = (reputation.correct_predictions as i128 * 100 * PRECISION) / reputation.total_predictions as i128;
        
        // Update weighted accuracy (considering volume)
        if reputation.total_volume_predicted > 0 {
            reputation.weighted_accuracy = Self::calculate_weighted_accuracy(&env, &user, &reputation);
        }
        
        // Update tier based on new reputation score
        reputation.reputation_tier = Self::calculate_reputation_tier(reputation.reputation_score);
        reputation.last_activity = env.ledger().timestamp();
        
        // Store updated reputation
        env.storage().persistent().set(&StorageKey::UserReputation(user.clone()), &reputation);
        
        // Record the prediction for future reference
        let prediction_record = PredictionRecord {
            user: user.clone(),
            market_id: market_id.clone(),
            predicted_outcome: prediction_outcome,
            amount_wagered,
            prediction_timestamp: env.ledger().timestamp(),
            market_resolution: Some(actual_outcome),
            was_correct: Some(was_correct),
            payout_received: 0, // Would be updated separately
        };
        
        env.storage().persistent().set(
            &StorageKey::PredictionRecord(user, market_id), 
            &prediction_record
        );

        Ok(())
    }

    /// Update oracle reputation based on resolution accuracy
    pub fn oracle_reputation_update(
        env: Env,
        updater: Address,
        oracle: Address,
        market_id: String,
        submitted_outcome: bool,
        final_outcome: bool,
        response_time: u64,
        market_category: String,
    ) -> Result<(), OrynError> {
        Self::require_authorized_updater(&env, &updater)?;
        updater.require_auth();

        let mut oracle_reputation = Self::get_oracle_reputation_info(&env, &oracle);
        let was_correct = submitted_outcome == final_outcome;
        
        // Calculate reputation delta
        let reputation_delta = if was_correct { 20 } else { -10 };
        
        // Apply response time bonus/penalty
        let response_bonus = if response_time < 3600 { 5 } else if response_time > 86400 { -5 } else { 0 };
        
        oracle_reputation.reputation_score = (oracle_reputation.reputation_score + reputation_delta + response_bonus).max(0);
        oracle_reputation.total_resolutions += 1;
        
        if was_correct {
            oracle_reputation.correct_resolutions += 1;
        }
        
        // Update accuracy rate
        oracle_reputation.accuracy_rate = (oracle_reputation.correct_resolutions as i128 * 100 * PRECISION) / oracle_reputation.total_resolutions as i128;
        
        // Update average response time
        oracle_reputation.average_response_time = (oracle_reputation.average_response_time + response_time) / 2;
        
        // Update specialization score for the category
        let current_category_score = oracle_reputation.specialization_scores
            .get(market_category.clone())
            .unwrap_or(5000); // 50% starting score
        
        let category_delta = if was_correct { 500 } else { -250 }; // 5% / -2.5%
        let new_category_score = (current_category_score + category_delta).max(0).min(10000); // 0-100%
        oracle_reputation.specialization_scores.set(market_category.clone(), new_category_score);
        
        // Update tier
        oracle_reputation.tier = Self::calculate_oracle_tier(&oracle_reputation);
        oracle_reputation.last_activity = env.ledger().timestamp();
        
        // Store updated reputation
        env.storage().persistent().set(&StorageKey::OracleReputation(oracle.clone()), &oracle_reputation);
        
        // Record the resolution
        let resolution_record = ResolutionRecord {
            oracle: oracle.clone(),
            market_id: market_id.clone(),
            submitted_outcome,
            final_outcome,
            submission_timestamp: env.ledger().timestamp(), // Approximate
            resolution_timestamp: env.ledger().timestamp(),
            was_correct,
            response_time,
            market_category,
        };
        
        env.storage().persistent().set(
            &StorageKey::ResolutionRecord(oracle, market_id),
            &resolution_record
        );

        Ok(())
    }

    /// Apply reputation decay for inactive users
    pub fn reputation_decay(env: Env, users: Vec<Address>) -> Result<(), OrynError> {
        let decay_params: DecayParameters = env.storage().persistent()
            .get(&StorageKey::DecayParameters)
            .unwrap();
        
        let current_time = env.ledger().timestamp();
        let decay_threshold = current_time - (decay_params.min_activity_period * 86400); // Convert days to seconds
        
        for user_addr in users.iter() {
            let user = user_addr.unwrap();
            let mut reputation = Self::get_user_reputation_info(&env, &user);
            
            // Only apply decay if user has been inactive
            if reputation.last_activity < decay_threshold {
                let days_inactive = (current_time - reputation.last_activity) / 86400;
                let decay_amount = (reputation.reputation_score * decay_params.decay_rate / 10000 * days_inactive as i128)
                    .min(decay_params.max_decay_amount);
                
                reputation.reputation_score = (reputation.reputation_score - decay_amount).max(0);
                reputation.reputation_tier = Self::calculate_reputation_tier(reputation.reputation_score);
                
                env.storage().persistent().set(&StorageKey::UserReputation(user), &reputation);
            }
        }

        Ok(())
    }

    /// Get user reputation information
    pub fn get_user_reputation(env: Env, user: Address) -> ReputationInfo {
        Self::get_user_reputation_info(&env, &user)
    }

    /// Get oracle reputation information
    pub fn get_oracle_reputation(env: Env, oracle: Address) -> OracleReputationInfo {
        Self::get_oracle_reputation_info(&env, &oracle)
    }

    /// Get leaderboard of top users
    pub fn get_user_leaderboard(env: Env, limit: u32) -> Vec<LeaderboardEntry> {
        // In a real implementation, this would maintain a sorted leaderboard
        // For now, return empty vector as placeholder
        Vec::new(&env)
    }

    /// Get leaderboard of top oracles
    pub fn get_oracle_leaderboard(env: Env, limit: u32) -> Vec<LeaderboardEntry> {
        // In a real implementation, this would maintain a sorted leaderboard
        // For now, return empty vector as placeholder
        Vec::new(&env)
    }

    /// Update user's 30-day statistics (called periodically)
    pub fn update_rolling_stats(env: Env, user: Address) -> Result<(), OrynError> {
        let mut reputation = Self::get_user_reputation_info(&env, &user);
        let current_time = env.ledger().timestamp();
        let thirty_days_ago = current_time - (30 * 86400);
        
        // Count predictions in last 30 days
        // In a real implementation, this would query prediction history
        reputation.predictions_last_30d = 0; // Placeholder
        reputation.accuracy_last_30d = 0;    // Placeholder
        
        env.storage().persistent().set(&StorageKey::UserReputation(user), &reputation);
        Ok(())
    }

    /// Authorize reputation updater (admin only)
    pub fn authorize_updater(
        env: Env,
        admin: Address,
        updater: Address,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::ReputationUpdater(updater), &true);
        Ok(())
    }

    /// Remove reputation updater authorization (admin only)
    pub fn remove_updater(
        env: Env,
        admin: Address,
        updater: Address,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().remove(&StorageKey::ReputationUpdater(updater));
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

    fn require_authorized_updater(env: &Env, caller: &Address) -> Result<(), OrynError> {
        let is_authorized: bool = env.storage().persistent()
            .get(&StorageKey::ReputationUpdater(caller.clone()))
            .unwrap_or(false);
        if !is_authorized {
            return Err(OrynError::Unauthorized);
        }
        Ok(())
    }

    fn get_user_reputation_info(env: &Env, user: &Address) -> ReputationInfo {
        env.storage().persistent()
            .get(&StorageKey::UserReputation(user.clone()))
            .unwrap_or(ReputationInfo {
                user_address: user.clone(),
                reputation_score: 0,
                total_predictions: 0,
                correct_predictions: 0,
                total_volume_predicted: 0,
                accuracy_rate: 0,
                weighted_accuracy: 0,
                last_activity: env.ledger().timestamp(),
                reputation_tier: ReputationTier::Novice,
                streak_count: 0,
                max_streak: 0,
                predictions_last_30d: 0,
                accuracy_last_30d: 0,
            })
    }

    fn get_oracle_reputation_info(env: &Env, oracle: &Address) -> OracleReputationInfo {
        env.storage().persistent()
            .get(&StorageKey::OracleReputation(oracle.clone()))
            .unwrap_or(OracleReputationInfo {
                oracle_address: oracle.clone(),
                reputation_score: 1000, // Starting score
                total_resolutions: 0,
                correct_resolutions: 0,
                accuracy_rate: 0,
                average_response_time: 0,
                stake_amount: 0,
                slash_count: 0,
                last_activity: env.ledger().timestamp(),
                specialization_scores: Map::new(env),
                tier: OracleTier::Bronze,
            })
    }

    fn calculate_reputation_tier(reputation_score: i128) -> ReputationTier {
        match reputation_score {
            0..=499 => ReputationTier::Novice,
            500..=999 => ReputationTier::Amateur,
            1000..=2499 => ReputationTier::Trader,
            2500..=4999 => ReputationTier::Expert,
            5000..=9999 => ReputationTier::Master,
            _ => ReputationTier::Legend,
        }
    }

    fn calculate_oracle_tier(oracle_reputation: &OracleReputationInfo) -> OracleTier {
        let accuracy = oracle_reputation.accuracy_rate;
        let resolutions = oracle_reputation.total_resolutions;
        
        if resolutions < 10 {
            OracleTier::Bronze
        } else if accuracy >= 95 * PRECISION / 100 && resolutions >= 100 {
            OracleTier::Diamond
        } else if accuracy >= 90 * PRECISION / 100 && resolutions >= 50 {
            OracleTier::Platinum
        } else if accuracy >= 85 * PRECISION / 100 && resolutions >= 25 {
            OracleTier::Gold
        } else if accuracy >= 80 * PRECISION / 100 {
            OracleTier::Silver
        } else {
            OracleTier::Bronze
        }
    }

    fn calculate_weighted_accuracy(env: &Env, user: &Address, reputation: &ReputationInfo) -> i128 {
        // In a real implementation, this would analyze all user's predictions
        // and calculate volume-weighted accuracy
        // For now, return simplified calculation
        reputation.accuracy_rate
    }
}
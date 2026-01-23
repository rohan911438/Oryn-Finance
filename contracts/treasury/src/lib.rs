#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Map, Symbol, Bytes
};

use oryn_shared::{OrynError, ContractUpgradedEvent, PRECISION};

// Contract metadata
contractmeta!(
    key = "Description",
    val = "Oryn Finance Treasury - Protocol fee collection and fund management"
);

/// Storage keys for the treasury contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Admin address
    Admin,
    /// Governance contract address
    Governance,
    /// Asset balances: Asset -> i128
    Balance(Address),
    /// Fee distribution configuration
    FeeDistribution,
    /// Investment strategies: strategy_id -> StrategyInfo
    Strategy(String),
    /// Active strategies list
    ActiveStrategies,
    /// Fee collection tracking
    TotalFeesCollected,
    /// Fee distribution history
    DistributionHistory,
    /// Emergency withdraw settings
    EmergencySettings,
    /// Authorized fee collectors: Address -> bool
    FeeCollector(Address),
    /// Investment limits per strategy
    InvestmentLimits,
    /// Paused state
    Paused,
    /// Initialization flag
    Initialized,
}

/// Fee distribution configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeDistributionConfig {
    pub liquidity_providers_share: u32,    // Basis points (e.g., 3000 = 30%)
    pub governance_stakers_share: u32,     // Basis points
    pub protocol_development_share: u32,   // Basis points
    pub treasury_reserve_share: u32,       // Basis points
    pub total_should_equal: u32,           // Should equal 10000 (100%)
}

/// Investment strategy information
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StrategyInfo {
    pub strategy_id: String,
    pub name: String,
    pub description: String,
    pub target_asset: Address,
    pub max_allocation: i128,          // Maximum amount to invest
    pub current_allocation: i128,      // Currently invested amount
    pub expected_yield: u32,           // Expected yield in basis points per year
    pub risk_level: u32,              // Risk level 1-10
    pub strategy_contract: Address,    // Contract implementing the strategy
    pub is_active: bool,
    pub created_at: u64,
}

/// Distribution record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DistributionRecord {
    pub timestamp: u64,
    pub total_amount: i128,
    pub asset: Address,
    pub lp_amount: i128,
    pub staker_amount: i128,
    pub development_amount: i128,
    pub reserve_amount: i128,
}

/// Treasury statistics
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryStats {
    pub total_value_locked: i128,
    pub total_fees_collected: i128,
    pub total_distributed: i128,
    pub active_investments: i128,
    pub available_balance: i128,
    pub number_of_strategies: u32,
    pub average_yield: u32,
}

/// Emergency withdrawal settings
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmergencySettings {
    pub timelock_duration: u64,
    pub max_emergency_amount: i128,
    pub authorized_addresses: Vec<Address>,
    pub requires_multisig: bool,
}

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    /// Initialize the treasury contract
    pub fn initialize(
        env: Env,
        admin: Address,
        governance: Address,
        fee_distribution: FeeDistributionConfig,
        emergency_settings: EmergencySettings,
    ) -> Result<(), OrynError> {
        // Ensure contract hasn't been initialized
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput);
        }

        admin.require_auth();

        // Validate fee distribution adds up to 100%
        if fee_distribution.liquidity_providers_share + 
           fee_distribution.governance_stakers_share +
           fee_distribution.protocol_development_share +
           fee_distribution.treasury_reserve_share != 10000 {
            return Err(OrynError::InvalidInput);
        }

        // Store configuration
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::Governance, &governance);
        env.storage().persistent().set(&StorageKey::FeeDistribution, &fee_distribution);
        env.storage().persistent().set(&StorageKey::EmergencySettings, &emergency_settings);
        env.storage().persistent().set(&StorageKey::ActiveStrategies, &Vec::<String>::new(&env));
        env.storage().persistent().set(&StorageKey::TotalFeesCollected, &0i128);
        env.storage().persistent().set(&StorageKey::DistributionHistory, &Vec::<DistributionRecord>::new(&env));
        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        Ok(())
    }

    /// Collect fees from protocol operations
    pub fn collect_fees(
        env: Env,
        collector: Address,
        asset: Address,
        amount: i128,
        source: String, // e.g., "trading_fees", "liquidity_fees"
    ) -> Result<(), OrynError> {
        collector.require_auth();
        Self::require_not_paused(&env)?;
        
        // Verify collector is authorized
        Self::require_authorized_collector(&env, &collector)?;

        if amount <= 0 {
            return Err(OrynError::InvalidInput);
        }

        // Transfer fees to treasury
        Self::transfer_asset_to_treasury(&env, &collector, &asset, amount)?;

        // Update balance tracking
        let current_balance = Self::get_asset_balance(&env, &asset);
        env.storage().persistent().set(&StorageKey::Balance(asset), &(current_balance + amount));

        // Update total fees collected
        let mut total_fees: i128 = env.storage().persistent()
            .get(&StorageKey::TotalFeesCollected)
            .unwrap_or(0);
        total_fees += amount;
        env.storage().persistent().set(&StorageKey::TotalFeesCollected, &total_fees);

        // Emit fee collection event
        env.events().publish((
            symbol_short!("fees"),
            symbol_short!("collected"),
        ), (collector, asset, amount, source));

        Ok(())
    }

    /// Distribute collected fees according to configuration
    pub fn distribute_fees(env: Env, asset: Address) -> Result<(), OrynError> {
        Self::require_not_paused(&env)?;

        let asset_balance = Self::get_asset_balance(&env, &asset);
        if asset_balance <= 0 {
            return Err(OrynError::InsufficientBalance);
        }

        let fee_config: FeeDistributionConfig = env.storage().persistent()
            .get(&StorageKey::FeeDistribution)
            .unwrap();

        // Calculate distribution amounts
        let lp_amount = asset_balance * fee_config.liquidity_providers_share as i128 / 10000;
        let staker_amount = asset_balance * fee_config.governance_stakers_share as i128 / 10000;
        let development_amount = asset_balance * fee_config.protocol_development_share as i128 / 10000;
        let reserve_amount = asset_balance * fee_config.treasury_reserve_share as i128 / 10000;

        // Distribute to liquidity providers (through AMM pools)
        Self::distribute_to_liquidity_providers(&env, &asset, lp_amount)?;

        // Distribute to governance stakers
        Self::distribute_to_governance_stakers(&env, &asset, staker_amount)?;

        // Transfer to development fund
        Self::transfer_to_development_fund(&env, &asset, development_amount)?;

        // Keep reserve amount in treasury
        env.storage().persistent().set(
            &StorageKey::Balance(asset.clone()), 
            &reserve_amount
        );

        // Record distribution
        let distribution_record = DistributionRecord {
            timestamp: env.ledger().timestamp(),
            total_amount: asset_balance,
            asset: asset.clone(),
            lp_amount,
            staker_amount,
            development_amount,
            reserve_amount,
        };

        let mut history: Vec<DistributionRecord> = env.storage().persistent()
            .get(&StorageKey::DistributionHistory)
            .unwrap_or(Vec::new(&env));
        history.push_back(distribution_record);
        env.storage().persistent().set(&StorageKey::DistributionHistory, &history);

        // Emit distribution event
        env.events().publish((
            symbol_short!("fees"),
            symbol_short!("distributed"),
        ), (asset, asset_balance, env.ledger().timestamp()));

        Ok(())
    }

    /// Withdraw protocol funds (governance only)
    pub fn withdraw_protocol_funds(
        env: Env,
        governance: Address,
        asset: Address,
        amount: i128,
        recipient: Address,
        purpose: String,
    ) -> Result<(), OrynError> {
        Self::require_governance(&env, &governance)?;
        governance.require_auth();

        let available_balance = Self::get_asset_balance(&env, &asset);
        if available_balance < amount {
            return Err(OrynError::InsufficientBalance);
        }

        // Transfer funds
        Self::transfer_asset_from_treasury(&env, &asset, &recipient, amount)?;

        // Update balance
        env.storage().persistent().set(&StorageKey::Balance(asset.clone()), &(available_balance - amount));

        // Emit withdrawal event
        env.events().publish((
            symbol_short!("funds"),
            symbol_short!("withdrawn"),
        ), (asset, amount, recipient, purpose));

        Ok(())
    }

    /// Emergency withdrawal with timelock (admin only)
    pub fn emergency_withdraw(
        env: Env,
        admin: Address,
        asset: Address,
        amount: i128,
        reason: String,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        let emergency_settings: EmergencySettings = env.storage().persistent()
            .get(&StorageKey::EmergencySettings)
            .unwrap();

        // Check emergency limits
        if amount > emergency_settings.max_emergency_amount {
            return Err(OrynError::InvalidInput);
        }

        // In a real implementation, this would implement timelock mechanism
        // For now, we'll allow immediate emergency withdrawal

        let available_balance = Self::get_asset_balance(&env, &asset);
        if available_balance < amount {
            return Err(OrynError::InsufficientBalance);
        }

        // Transfer to admin
        Self::transfer_asset_from_treasury(&env, &asset, &admin, amount)?;

        // Update balance
        env.storage().persistent().set(&StorageKey::Balance(asset.clone()), &(available_balance - amount));

        // Emit emergency withdrawal event
        env.events().publish((
            symbol_short!("emergency"),
            symbol_short!("withdraw"),
        ), (admin, asset, amount, reason));

        Ok(())
    }

    /// Add investment strategy
    pub fn add_investment_strategy(
        env: Env,
        governance: Address,
        strategy: StrategyInfo,
    ) -> Result<(), OrynError> {
        Self::require_governance(&env, &governance)?;
        governance.require_auth();

        // Validate strategy
        if strategy.max_allocation <= 0 || strategy.risk_level > 10 {
            return Err(OrynError::InvalidInput);
        }

        // Store strategy
        env.storage().persistent().set(
            &StorageKey::Strategy(strategy.strategy_id.clone()), 
            &strategy
        );

        // Add to active strategies if active
        if strategy.is_active {
            let mut active_strategies: Vec<String> = env.storage().persistent()
                .get(&StorageKey::ActiveStrategies)
                .unwrap_or(Vec::new(&env));
            active_strategies.push_back(strategy.strategy_id);
            env.storage().persistent().set(&StorageKey::ActiveStrategies, &active_strategies);
        }

        Ok(())
    }

    /// Invest idle funds into strategies
    pub fn invest_idle_funds(
        env: Env,
        governance: Address,
        strategy_id: String,
        asset: Address,
        amount: i128,
    ) -> Result<(), OrynError> {
        Self::require_governance(&env, &governance)?;
        governance.require_auth();

        let mut strategy: StrategyInfo = env.storage().persistent()
            .get(&StorageKey::Strategy(strategy_id.clone()))
            .ok_or(OrynError::InvalidInput)?;

        if !strategy.is_active {
            return Err(OrynError::InvalidInput);
        }

        // Check investment limits
        if strategy.current_allocation + amount > strategy.max_allocation {
            return Err(OrynError::InvalidInput);
        }

        let available_balance = Self::get_asset_balance(&env, &asset);
        if available_balance < amount {
            return Err(OrynError::InsufficientBalance);
        }

        // Execute investment through strategy contract
        Self::execute_investment_strategy(&env, &strategy.strategy_contract, &asset, amount)?;

        // Update strategy allocation
        strategy.current_allocation += amount;
        env.storage().persistent().set(&StorageKey::Strategy(strategy_id), &strategy);

        // Update treasury balance
        env.storage().persistent().set(&StorageKey::Balance(asset.clone()), &(available_balance - amount));

        Ok(())
    }

    /// Get treasury balance for an asset
    pub fn get_treasury_balance(env: Env, asset: Address) -> i128 {
        Self::get_asset_balance(&env, &asset)
    }

    /// Get treasury statistics
    pub fn get_treasury_stats(env: Env) -> TreasuryStats {
        let total_fees: i128 = env.storage().persistent()
            .get(&StorageKey::TotalFeesCollected)
            .unwrap_or(0);

        let active_strategies: Vec<String> = env.storage().persistent()
            .get(&StorageKey::ActiveStrategies)
            .unwrap_or(Vec::new(&env));

        let mut total_investments = 0i128;
        let mut total_yield = 0u32;

        for strategy_id in active_strategies.iter() {
            if let Some(strategy) = env.storage().persistent()
                .get::<StorageKey, StrategyInfo>(&StorageKey::Strategy(strategy_id.unwrap())) {
                total_investments += strategy.current_allocation;
                total_yield += strategy.expected_yield;
            }
        }

        let average_yield = if active_strategies.len() > 0 {
            total_yield / active_strategies.len()
        } else {
            0
        };

        TreasuryStats {
            total_value_locked: total_investments, // Would calculate from all assets
            total_fees_collected: total_fees,
            total_distributed: 0, // Would track this separately
            active_investments: total_investments,
            available_balance: 0, // Would sum all asset balances
            number_of_strategies: active_strategies.len(),
            average_yield,
        }
    }

    /// Get distribution history
    pub fn get_distribution_history(env: Env, limit: u32) -> Vec<DistributionRecord> {
        let history: Vec<DistributionRecord> = env.storage().persistent()
            .get(&StorageKey::DistributionHistory)
            .unwrap_or(Vec::new(&env));

        let start = if history.len() > limit {
            history.len() - limit
        } else {
            0
        };

        let mut recent_history = Vec::new(&env);
        for i in start..history.len() {
            if let Some(record) = history.get(i) {
                recent_history.push_back(record.unwrap());
            }
        }

        recent_history
    }

    /// Authorize fee collector (admin only)
    pub fn authorize_fee_collector(
        env: Env,
        admin: Address,
        collector: Address,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::FeeCollector(collector), &true);
        Ok(())
    }

    /// Remove fee collector authorization (admin only)
    pub fn remove_fee_collector(
        env: Env,
        admin: Address,
        collector: Address,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().remove(&StorageKey::FeeCollector(collector));
        Ok(())
    }

    /// Update fee distribution configuration (governance only)
    pub fn update_fee_distribution(
        env: Env,
        governance: Address,
        new_config: FeeDistributionConfig,
    ) -> Result<(), OrynError> {
        Self::require_governance(&env, &governance)?;
        governance.require_auth();

        // Validate new configuration
        if new_config.liquidity_providers_share + 
           new_config.governance_stakers_share +
           new_config.protocol_development_share +
           new_config.treasury_reserve_share != 10000 {
            return Err(OrynError::InvalidInput);
        }

        env.storage().persistent().set(&StorageKey::FeeDistribution, &new_config);
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
        let governance: Address = env.storage().persistent().get(&StorageKey::Governance).unwrap();
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

    fn require_authorized_collector(env: &Env, collector: &Address) -> Result<(), OrynError> {
        let is_authorized: bool = env.storage().persistent()
            .get(&StorageKey::FeeCollector(collector.clone()))
            .unwrap_or(false);
        if !is_authorized {
            return Err(OrynError::Unauthorized);
        }
        Ok(())
    }

    fn get_asset_balance(env: &Env, asset: &Address) -> i128 {
        env.storage().persistent()
            .get(&StorageKey::Balance(asset.clone()))
            .unwrap_or(0)
    }

    // Placeholder functions for external operations
    fn transfer_asset_to_treasury(env: &Env, from: &Address, asset: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer asset from external address to treasury
        Ok(())
    }

    fn transfer_asset_from_treasury(env: &Env, asset: &Address, to: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer asset from treasury to external address
        Ok(())
    }

    fn distribute_to_liquidity_providers(env: &Env, asset: &Address, amount: i128) -> Result<(), OrynError> {
        // Distribute fees to liquidity providers across all AMM pools
        Ok(())
    }

    fn distribute_to_governance_stakers(env: &Env, asset: &Address, amount: i128) -> Result<(), OrynError> {
        // Distribute fees to governance token stakers
        Ok(())
    }

    fn transfer_to_development_fund(env: &Env, asset: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer to protocol development fund address
        Ok(())
    }

    fn execute_investment_strategy(env: &Env, strategy_contract: &Address, asset: &Address, amount: i128) -> Result<(), OrynError> {
        // Call strategy contract to execute investment
        Ok(())
    }
}
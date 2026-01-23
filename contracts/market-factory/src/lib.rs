#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Map, Symbol, Bytes
};

use oryn_shared::{
    MarketInfo, MarketCategory, MarketStatus, OrynError,
    MarketCreatedEvent, ContractUpgradedEvent, MIN_LIQUIDITY, PRECISION
};

// Contract metadata
contractmeta!(
    key = "Description",
    val = "Oryn Finance Market Factory - Creates and manages prediction markets"
);

/// Storage keys for the factory contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Contract admin address
    Admin,
    /// Counter for total markets created
    MarketCount,
    /// Mapping from market ID to market info
    Market(String),
    /// Vector of all market IDs 
    AllMarkets,
    /// Mapping from creator address to their market IDs
    CreatorMarkets(Address),
    /// Contract addresses for other system contracts
    PredictionMarketWasm,
    AmmPoolWasm,
    OracleResolver,
    TreasuryContract,
    GovernanceContract,
    /// Platform configuration
    MinLiquidity,
    PlatformFee,
    MaxMarketDuration,
    MinMarketDuration,
    /// Contract initialization flag
    Initialized,
    /// Contract pause state
    Paused,
    /// Verified users for market creation
    VerifiedUser(Address),
    /// Version tracking for upgrades
    Version,
}

/// Factory configuration parameters
#[contracttype]
#[derive(Clone)]
pub struct FactoryConfig {
    pub min_liquidity: i128,
    pub platform_fee_rate: u32, // In basis points (100 = 1%)
    pub max_market_duration: u64,
    pub min_market_duration: u64,
    pub oracle_resolver: Address,
    pub treasury_contract: Address,
    pub governance_contract: Address,
}

#[contract]
pub struct MarketFactoryContract;

#[contractimpl]
impl MarketFactoryContract {
    /// Initialize the factory contract
    /// Can only be called once during deployment
    pub fn initialize(
        env: Env,
        admin: Address,
        prediction_market_wasm: Bytes,
        amm_pool_wasm: Bytes,
        oracle_resolver: Address,
        treasury_contract: Address,
        governance_contract: Address,
        config: FactoryConfig,
    ) -> Result<(), OrynError> {
        // Ensure contract hasn't been initialized
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput);
        }

        admin.require_auth();

        // Store admin and configuration
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::Initialized, &true);
        env.storage().persistent().set(&StorageKey::MarketCount, &0u64);
        env.storage().persistent().set(&StorageKey::AllMarkets, &Vec::<String>::new(&env));
        env.storage().persistent().set(&StorageKey::PredictionMarketWasm, &prediction_market_wasm);
        env.storage().persistent().set(&StorageKey::AmmPoolWasm, &amm_pool_wasm);
        env.storage().persistent().set(&StorageKey::OracleResolver, &oracle_resolver);
        env.storage().persistent().set(&StorageKey::TreasuryContract, &treasury_contract);
        env.storage().persistent().set(&StorageKey::GovernanceContract, &governance_contract);
        
        // Store configuration parameters
        env.storage().persistent().set(&StorageKey::MinLiquidity, &config.min_liquidity);
        env.storage().persistent().set(&StorageKey::PlatformFee, &config.platform_fee_rate);
        env.storage().persistent().set(&StorageKey::MaxMarketDuration, &config.max_market_duration);
        env.storage().persistent().set(&StorageKey::MinMarketDuration, &config.min_market_duration);
        
        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::Version, &String::from_str(&env, "1.0.0"));

        Ok(())
    }

    /// Create a new prediction market
    /// Only verified users can create markets with minimum liquidity requirements
    pub fn create_market(
        env: Env,
        creator_address: Address,
        market_question: String,
        category: MarketCategory,
        resolution_source: String,
        expiry_timestamp: u64,
        initial_liquidity_usdc: i128,
    ) -> Result<String, OrynError> {
        // Verify contract is not paused
        Self::require_not_paused(&env)?;
        
        // Require authentication from creator
        creator_address.require_auth();

        // Verify user is authorized to create markets
        Self::require_verified_user(&env, &creator_address)?;

        // Validate input parameters
        Self::validate_market_parameters(&env, &market_question, expiry_timestamp, initial_liquidity_usdc)?;

        let current_time = env.ledger().timestamp();
        
        // Generate unique market ID
        let market_count: u64 = env.storage().persistent().get(&StorageKey::MarketCount).unwrap_or(0);
        let market_id = String::from_str(&env, &format!("market_{}", market_count + 1));

        // Deploy prediction market contract
        let prediction_market_wasm: Bytes = env.storage().persistent()
            .get(&StorageKey::PredictionMarketWasm)
            .unwrap();
            
        let market_contract_address = env.deployer()
            .with_current_contract(creator_address.clone())
            .deploy_contract(prediction_market_wasm);

        // Deploy YES and NO tokens for this market
        let (yes_token_id, no_token_id) = Self::deploy_market_tokens(
            &env, 
            &market_id, 
            &market_contract_address
        )?;

        // Deploy AMM pool contract
        let amm_pool_wasm: Bytes = env.storage().persistent()
            .get(&StorageKey::AmmPoolWasm)
            .unwrap();
            
        let pool_address = env.deployer()
            .with_current_contract(creator_address.clone())
            .deploy_contract(amm_pool_wasm);

        // Get oracle resolver address
        let oracle_address: Address = env.storage().persistent()
            .get(&StorageKey::OracleResolver)
            .unwrap();

        // Create market info struct
        let market_info = MarketInfo {
            market_id: market_id.clone(),
            question: market_question.clone(),
            category: category.clone(),
            creator: creator_address.clone(),
            yes_token_id: yes_token_id.clone(),
            no_token_id: no_token_id.clone(),
            pool_address: pool_address.clone(),
            oracle_address: oracle_address.clone(),
            created_at: current_time,
            expires_at: expiry_timestamp,
            resolution_criteria: resolution_source.clone(),
            status: MarketStatus::Pending,
            total_volume: 0,
            total_liquidity: initial_liquidity_usdc,
            outcome: None,
            min_liquidity: initial_liquidity_usdc,
        };

        // Initialize the prediction market contract
        Self::initialize_market_contract(
            &env,
            &market_contract_address,
            &market_info,
        )?;

        // Initialize the AMM pool
        Self::initialize_pool_contract(
            &env,
            &pool_address,
            &market_id,
            &yes_token_id,
            &no_token_id,
            initial_liquidity_usdc,
        )?;

        // Store market in registry
        env.storage().persistent().set(&StorageKey::Market(market_id.clone()), &market_info);
        
        // Update market count
        env.storage().persistent().set(&StorageKey::MarketCount, &(market_count + 1));
        
        // Add to all markets list
        let mut all_markets: Vec<String> = env.storage().persistent()
            .get(&StorageKey::AllMarkets)
            .unwrap_or(Vec::new(&env));
        all_markets.push_back(market_id.clone());
        env.storage().persistent().set(&StorageKey::AllMarkets, &all_markets);
        
        // Add to creator's market list
        let creator_key = StorageKey::CreatorMarkets(creator_address.clone());
        let mut creator_markets: Vec<String> = env.storage().persistent()
            .get(&creator_key)
            .unwrap_or(Vec::new(&env));
        creator_markets.push_back(market_id.clone());
        env.storage().persistent().set(&creator_key, &creator_markets);

        // Emit MarketCreated event
        env.events().publish((
            symbol_short!("market"),
            symbol_short!("created"),
        ), MarketCreatedEvent {
            market_id: market_id.clone(),
            creator: creator_address,
            contract_address: market_contract_address,
            question: market_question,
            category,
            expires_at: expiry_timestamp,
            initial_liquidity: initial_liquidity_usdc,
        });

        Ok(market_id)
    }

    /// Get all markets with pagination
    pub fn get_all_markets(
        env: Env,
        offset: u64,
        limit: u64,
    ) -> Result<Vec<MarketInfo>, OrynError> {
        let all_markets: Vec<String> = env.storage().persistent()
            .get(&StorageKey::AllMarkets)
            .unwrap_or(Vec::new(&env));

        let mut result = Vec::new(&env);
        let start = offset as usize;
        let end = ((offset + limit) as usize).min(all_markets.len());

        for i in start..end {
            if let Some(market_id) = all_markets.get(i as u32) {
                if let Some(market_info) = env.storage().persistent()
                    .get::<StorageKey, MarketInfo>(&StorageKey::Market(market_id.unwrap())) {
                    result.push_back(market_info);
                }
            }
        }

        Ok(result)
    }

    /// Get specific market by ID
    pub fn get_market_by_id(env: Env, market_id: String) -> Result<MarketInfo, OrynError> {
        env.storage().persistent()
            .get(&StorageKey::Market(market_id))
            .ok_or(OrynError::MarketNotFound)
    }

    /// Get total number of markets created
    pub fn market_count(env: Env) -> u64 {
        env.storage().persistent().get(&StorageKey::MarketCount).unwrap_or(0)
    }

    /// Get markets created by a specific user
    pub fn get_user_markets(env: Env, creator: Address) -> Vec<String> {
        env.storage().persistent()
            .get(&StorageKey::CreatorMarkets(creator))
            .unwrap_or(Vec::new(&env))
    }

    /// Get markets by category
    pub fn get_markets_by_category(
        env: Env, 
        category: MarketCategory,
        offset: u64,
        limit: u64,
    ) -> Result<Vec<MarketInfo>, OrynError> {
        let all_markets: Vec<String> = env.storage().persistent()
            .get(&StorageKey::AllMarkets)
            .unwrap_or(Vec::new(&env));

        let mut result = Vec::new(&env);
        let mut count = 0u64;
        let mut found = 0u64;

        for market_id in all_markets.iter() {
            if let Some(market_info) = env.storage().persistent()
                .get::<StorageKey, MarketInfo>(&StorageKey::Market(market_id.unwrap())) {
                
                if market_info.category == category {
                    if count >= offset && found < limit {
                        result.push_back(market_info);
                        found += 1;
                    }
                    count += 1;
                }
            }
        }

        Ok(result)
    }

    /// Update market status (only callable by market contract or admin)
    pub fn update_market_status(
        env: Env,
        market_id: String,
        new_status: MarketStatus,
        caller: Address,
    ) -> Result<(), OrynError> {
        caller.require_auth();

        let mut market_info: MarketInfo = env.storage().persistent()
            .get(&StorageKey::Market(market_id.clone()))
            .ok_or(OrynError::MarketNotFound)?;

        // Verify caller is authorized (admin, market contract, or oracle)
        let admin: Address = env.storage().persistent().get(&StorageKey::Admin).unwrap();
        let oracle: Address = env.storage().persistent().get(&StorageKey::OracleResolver).unwrap();
        
        if caller != admin && caller != market_info.pool_address && caller != oracle {
            return Err(OrynError::Unauthorized);
        }

        market_info.status = new_status;
        env.storage().persistent().set(&StorageKey::Market(market_id), &market_info);

        Ok(())
    }

    /// Add verified user (only admin)
    pub fn add_verified_user(env: Env, admin: Address, user: Address) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::VerifiedUser(user), &true);
        Ok(())
    }

    /// Remove verified user (only admin)
    pub fn remove_verified_user(env: Env, admin: Address, user: Address) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().remove(&StorageKey::VerifiedUser(user));
        Ok(())
    }

    /// Check if user is verified
    pub fn is_verified_user(env: Env, user: Address) -> bool {
        env.storage().persistent().has(&StorageKey::VerifiedUser(user))
    }

    /// Pause/unpause contract (only admin)
    pub fn set_pause_state(env: Env, admin: Address, paused: bool) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Paused, &paused);
        Ok(())
    }

    /// Update configuration (only governance)
    pub fn update_config(
        env: Env,
        governance: Address,
        new_config: FactoryConfig,
    ) -> Result<(), OrynError> {
        Self::require_governance(&env, &governance)?;
        governance.require_auth();

        env.storage().persistent().set(&StorageKey::MinLiquidity, &new_config.min_liquidity);
        env.storage().persistent().set(&StorageKey::PlatformFee, &new_config.platform_fee_rate);
        env.storage().persistent().set(&StorageKey::MaxMarketDuration, &new_config.max_market_duration);
        env.storage().persistent().set(&StorageKey::MinMarketDuration, &new_config.min_market_duration);
        env.storage().persistent().set(&StorageKey::OracleResolver, &new_config.oracle_resolver);
        env.storage().persistent().set(&StorageKey::TreasuryContract, &new_config.treasury_contract);
        env.storage().persistent().set(&StorageKey::GovernanceContract, &new_config.governance_contract);

        Ok(())
    }

    /// Upgrade contract (only governance)
    pub fn upgrade_contract(
        env: Env,
        governance: Address,
        new_wasm_hash: Bytes,
    ) -> Result<(), OrynError> {
        Self::require_governance(&env, &governance)?;
        governance.require_auth();

        let old_contract = env.current_contract_address();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        
        // Increment version
        let current_version: String = env.storage().persistent()
            .get(&StorageKey::Version)
            .unwrap_or(String::from_str(&env, "1.0.0"));
        
        // Emit upgrade event
        env.events().publish((
            symbol_short!("contract"),
            symbol_short!("upgraded"),
        ), ContractUpgradedEvent {
            old_contract,
            new_contract: env.current_contract_address(),
            upgrade_time: env.ledger().timestamp(),
            version: current_version,
        });

        Ok(())
    }

    /// Get factory configuration
    pub fn get_config(env: Env) -> FactoryConfig {
        FactoryConfig {
            min_liquidity: env.storage().persistent()
                .get(&StorageKey::MinLiquidity)
                .unwrap_or(MIN_LIQUIDITY),
            platform_fee_rate: env.storage().persistent()
                .get(&StorageKey::PlatformFee)
                .unwrap_or(50), // 0.5% default
            max_market_duration: env.storage().persistent()
                .get(&StorageKey::MaxMarketDuration)
                .unwrap_or(365 * 24 * 60 * 60), // 1 year
            min_market_duration: env.storage().persistent()
                .get(&StorageKey::MinMarketDuration)
                .unwrap_or(60 * 60), // 1 hour
            oracle_resolver: env.storage().persistent()
                .get(&StorageKey::OracleResolver)
                .unwrap(),
            treasury_contract: env.storage().persistent()
                .get(&StorageKey::TreasuryContract)
                .unwrap(),
            governance_contract: env.storage().persistent()
                .get(&StorageKey::GovernanceContract)
                .unwrap(),
        }
    }

    /// Emergency functions for admin
    pub fn emergency_pause_market(
        env: Env,
        admin: Address,
        market_id: String,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        Self::update_market_status(env, market_id, MarketStatus::Paused, admin)
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
            .get(&StorageKey::GovernanceContract)
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

    fn require_verified_user(env: &Env, user: &Address) -> Result<(), OrynError> {
        if !Self::is_verified_user(env.clone(), user.clone()) {
            return Err(OrynError::Unauthorized);
        }
        Ok(())
    }

    fn validate_market_parameters(
        env: &Env,
        question: &String,
        expiry_timestamp: u64,
        initial_liquidity: i128,
    ) -> Result<(), OrynError> {
        // Validate question length
        if question.len() == 0 || question.len() > 500 {
            return Err(OrynError::InvalidInput);
        }

        let current_time = env.ledger().timestamp();
        let min_duration: u64 = env.storage().persistent()
            .get(&StorageKey::MinMarketDuration)
            .unwrap_or(60 * 60);
        let max_duration: u64 = env.storage().persistent()
            .get(&StorageKey::MaxMarketDuration)
            .unwrap_or(365 * 24 * 60 * 60);

        // Validate expiry time
        if expiry_timestamp <= current_time + min_duration {
            return Err(OrynError::InvalidInput);
        }

        if expiry_timestamp > current_time + max_duration {
            return Err(OrynError::InvalidInput);
        }

        // Validate minimum liquidity
        let min_liquidity: i128 = env.storage().persistent()
            .get(&StorageKey::MinLiquidity)
            .unwrap_or(MIN_LIQUIDITY);
        if initial_liquidity < min_liquidity {
            return Err(OrynError::InsufficientLiquidity);
        }

        Ok(())
    }

    fn deploy_market_tokens(
        env: &Env,
        market_id: &String,
        market_contract: &Address,
    ) -> Result<(Address, Address), OrynError> {
        // In a real implementation, you would deploy actual Soroban token contracts
        // For now, we'll use placeholder addresses
        // These would be proper token contract deployments with metadata
        let yes_token = env.deployer()
            .with_current_contract(market_contract.clone())
            .deploy_contract(Bytes::new(env)); // Would be token WASM
        
        let no_token = env.deployer()
            .with_current_contract(market_contract.clone())
            .deploy_contract(Bytes::new(env)); // Would be token WASM

        Ok((yes_token, no_token))
    }

    fn initialize_market_contract(
        env: &Env,
        contract_address: &Address,
        market_info: &MarketInfo,
    ) -> Result<(), OrynError> {
        // Call initialize function on the deployed prediction market contract
        // This would be done via contract invocation
        // For now, this is a placeholder
        Ok(())
    }

    fn initialize_pool_contract(
        env: &Env,
        pool_address: &Address,
        market_id: &String,
        yes_token: &Address,
        no_token: &Address,
        initial_liquidity: i128,
    ) -> Result<(), OrynError> {
        // Call initialize function on the deployed AMM pool contract
        // This would be done via contract invocation
        // For now, this is a placeholder
        Ok(())
    }
}
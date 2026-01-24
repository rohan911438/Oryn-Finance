#![no_std]
#![allow(unexpected_cfgs)]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec
};

use oryn_shared::{
    MarketInfo, MarketCategory, MarketStatus, OrynError, MIN_LIQUIDITY
};

contractmeta!(
    key = "Description",
    val = "Oryn Finance Market Factory"
);

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    MarketCount,
    Market(u64),
    AllMarkets,
    CreatorMarkets(Address),
    OracleResolver,
    TreasuryContract,
    GovernanceContract,
    MinLiquidity,
    MaxMarketDuration,
    MinMarketDuration,
    Paused,
    VerifiedUser(Address),
    Initialized,
}

#[contracttype]
#[derive(Clone)]
pub struct FactoryConfig {
    pub min_liquidity: i128,
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

    // ---------------- INIT ----------------
    pub fn initialize(
        env: Env,
        admin: Address,
        config: FactoryConfig,
    ) -> Result<(), soroban_sdk::Error> {

        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput.into());
        }

        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::MarketCount, &0u64);
        env.storage().persistent().set(&StorageKey::AllMarkets, &Vec::<u64>::new(&env));
        env.storage().persistent().set(&StorageKey::MinLiquidity, &config.min_liquidity);
        env.storage().persistent().set(&StorageKey::MaxMarketDuration, &config.max_market_duration);
        env.storage().persistent().set(&StorageKey::MinMarketDuration, &config.min_market_duration);
        env.storage().persistent().set(&StorageKey::OracleResolver, &config.oracle_resolver);
        env.storage().persistent().set(&StorageKey::TreasuryContract, &config.treasury_contract);
        env.storage().persistent().set(&StorageKey::GovernanceContract, &config.governance_contract);
        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        Ok(())
    }

    // ---------------- CREATE MARKET ----------------
    pub fn create_market(
        env: Env,
        creator: Address,
        question: String,
        category: MarketCategory,
        expiry_timestamp: u64,
        initial_liquidity: i128,
        market_contract: Address,
        pool_address: Address,
        yes_token: Address,
        no_token: Address,
    ) -> Result<u64, soroban_sdk::Error> {

        creator.require_auth();
        Self::require_not_paused(&env)?;

        let mut count: u64 = env.storage().persistent()
            .get(&StorageKey::MarketCount)
            .unwrap_or(0);

        count += 1;

        if initial_liquidity < env.storage().persistent()
            .get(&StorageKey::MinLiquidity)
            .unwrap_or(MIN_LIQUIDITY)
        {
            return Err(OrynError::InsufficientLiquidity.into());
        }

        let info = MarketInfo {
            market_id: String::from_str(&env, "market"),
            question,
            category,
            creator: creator.clone(),
            yes_token_id: yes_token,
            no_token_id: no_token,
            pool_address,
            oracle_address: env.storage().persistent().get(&StorageKey::OracleResolver).unwrap(),
            created_at: env.ledger().timestamp(),
            expires_at: expiry_timestamp,
            resolution_criteria: String::from_str(&env, ""),
            status: MarketStatus::Pending,
            total_volume: 0,
            total_liquidity: initial_liquidity,
            outcome: None,
            min_liquidity: initial_liquidity,
        };

        env.storage().persistent().set(&StorageKey::Market(count), &info);

        let mut all: Vec<u64> = env.storage().persistent()
            .get(&StorageKey::AllMarkets)
            .unwrap_or(Vec::new(&env));

        all.push_back(count);
        env.storage().persistent().set(&StorageKey::AllMarkets, &all);
        env.storage().persistent().set(&StorageKey::MarketCount, &count);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("created")),
            count
        );

        Ok(count)
    }

    // ---------------- READ ----------------
    pub fn get_market(env: Env, market_id: u64) -> Option<MarketInfo> {
        env.storage().persistent().get(&StorageKey::Market(market_id))
    }

    pub fn get_all_markets(env: Env) -> Vec<u64> {
        env.storage().persistent()
            .get(&StorageKey::AllMarkets)
            .unwrap_or(Vec::new(&env))
    }

    // ---------------- INTERNAL ----------------
    fn require_not_paused(env: &Env) -> Result<(), soroban_sdk::Error> {
        let paused: bool = env.storage().persistent().get(&StorageKey::Paused).unwrap_or(false);
        if paused {
            return Err(OrynError::ContractPaused.into());
        }
        Ok(())
    }
}

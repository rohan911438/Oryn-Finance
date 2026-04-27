#![no_std]
#![allow(unexpected_cfgs)]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, IntoVal, String, Symbol, Vec
};

use oryn_shared::{
    MarketInfo, MarketCategory, MarketStatus, OrynError, MIN_LIQUIDITY, Role, Permission
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
    AccessControlContract,  // New: Access control contract address
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
    pub access_control_contract: Address,  // New: Access control contract
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
        env.storage().persistent().set(&StorageKey::AccessControlContract, &config.access_control_contract);
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

        // Check permission using access control contract
        let access_control: Address = env.storage().persistent()
            .get(&StorageKey::AccessControlContract)
            .ok_or(OrynError::InvalidInput)?;

        // Call access control contract to check permission
        let has_permission: bool = env.invoke_contract(
            &access_control,
            &symbol_short!("has_perm"),
            (creator.clone(), Permission::CreateMarket).into_val(&env)
        );

        if !has_permission {
            return Err(OrynError::Unauthorized.into());
        }

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

    // ---------------- ACCESS CONTROL MANAGEMENT ----------------

    pub fn pause_contract(env: Env, caller: Address) -> Result<(), soroban_sdk::Error> {
        caller.require_auth();

        let access_control: Address = env.storage().persistent()
            .get(&StorageKey::AccessControlContract)
            .ok_or(OrynError::InvalidInput)?;

        // Check permission through access control contract
        env.invoke_contract::<()>(
            &access_control,
            &Symbol::new(&env, "require_perm"),
            (caller.clone(), Permission::PauseContract).into_val(&env)
        );

        env.storage().persistent().set(&StorageKey::Paused, &true);

        env.events().publish(
            (symbol_short!("factory"), symbol_short!("paused")),
            caller
        );

        Ok(())
    }

    pub fn unpause_contract(env: Env, caller: Address) -> Result<(), soroban_sdk::Error> {
        caller.require_auth();

        let access_control: Address = env.storage().persistent()
            .get(&StorageKey::AccessControlContract)
            .ok_or(OrynError::InvalidInput)?;

        // Check permission through access control contract
        env.invoke_contract::<()>(
            &access_control,
            &Symbol::new(&env, "require_perm"),
            (caller.clone(), Permission::PauseContract).into_val(&env)
        );

        env.storage().persistent().set(&StorageKey::Paused, &false);

        env.events().publish(
            (symbol_short!("factory"), symbol_short!("unpaused")),
            caller
        );

        Ok(())
    }

    pub fn grant_user_role(env: Env, admin: Address, user: Address, role: Role) -> Result<(), soroban_sdk::Error> {
        admin.require_auth();

        let access_control: Address = env.storage().persistent()
            .get(&StorageKey::AccessControlContract)
            .ok_or(OrynError::InvalidInput)?;

        // Delegate to access control contract
        env.invoke_contract::<()>(
            &access_control,
            &Symbol::new(&env, "grant_role"),
            (admin, user, role).into_val(&env)
        );

        Ok(())
    }

    pub fn revoke_user_role(env: Env, admin: Address, user: Address) -> Result<(), soroban_sdk::Error> {
        admin.require_auth();

        let access_control: Address = env.storage().persistent()
            .get(&StorageKey::AccessControlContract)
            .ok_or(OrynError::InvalidInput)?;

        // Delegate to access control contract
        env.invoke_contract::<()>(
            &access_control,
            &Symbol::new(&env, "revoke_role"),
            (admin, user).into_val(&env)
        );

        Ok(())
    }

    pub fn blacklist_user(env: Env, admin: Address, user: Address) -> Result<(), soroban_sdk::Error> {
        admin.require_auth();

        let access_control: Address = env.storage().persistent()
            .get(&StorageKey::AccessControlContract)
            .ok_or(OrynError::InvalidInput)?;

        // Delegate to access control contract
        env.invoke_contract::<()>(
            &access_control,
            &symbol_short!("blacklist"),
            (admin, user).into_val(&env)
        );

        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        contract, contractimpl, testutils::Address as _, Address, Env, String,
    };
    use oryn_shared::{MarketCategory, Permission, Role};

    // Stub that satisfies every cross-contract call made by MarketFactoryContract.
    // Function names match the symbol_short! keys used in the factory.
    #[contract]
    struct StubAccessControl;

    #[contractimpl]
    impl StubAccessControl {
        pub fn has_perm(_env: Env, _user: Address, _perm: Permission) -> bool {
            true
        }
        pub fn require_perm(_env: Env, _caller: Address, _perm: Permission) {}
        pub fn grant_role(_env: Env, _admin: Address, _user: Address, _role: Role) {}
        pub fn revoke_role(_env: Env, _admin: Address, _user: Address) {}
        pub fn blacklist(_env: Env, _admin: Address, _user: Address) {}
    }

    fn setup(env: &Env) -> (MarketFactoryContractClient, Address) {
        let stub_id = env.register_contract(None, StubAccessControl);
        let factory_id = env.register_contract(None, MarketFactoryContract);
        let client = MarketFactoryContractClient::new(env, &factory_id);

        let admin = Address::generate(env);
        let config = FactoryConfig {
            min_liquidity: 1_000_000_000_000,
            max_market_duration: 365 * 24 * 60 * 60,
            min_market_duration: 3600,
            oracle_resolver: Address::generate(env),
            treasury_contract: Address::generate(env),
            governance_contract: Address::generate(env),
            access_control_contract: stub_id,
        };
        client.initialize(&admin, &config);
        (client, admin)
    }

    #[test]
    fn test_initialize_starts_with_empty_market_list() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env);
        assert_eq!(client.get_all_markets().len(), 0);
    }

    #[test]
    #[should_panic]
    fn test_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let stub_id = env.register_contract(None, StubAccessControl);
        let factory_id = env.register_contract(None, MarketFactoryContract);
        let client = MarketFactoryContractClient::new(&env, &factory_id);

        let admin = Address::generate(&env);
        let config = FactoryConfig {
            min_liquidity: 1_000_000_000_000,
            max_market_duration: 365 * 24 * 60 * 60,
            min_market_duration: 3600,
            oracle_resolver: Address::generate(&env),
            treasury_contract: Address::generate(&env),
            governance_contract: Address::generate(&env),
            access_control_contract: stub_id,
        };
        client.initialize(&admin, &config);
        client.initialize(&admin, &config);
    }

    #[test]
    fn test_create_market_is_retrievable_and_increments_list() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env);

        let creator = Address::generate(&env);
        let market_id = client.create_market(
            &creator,
            &String::from_str(&env, "Will ETH flip BTC by 2026?"),
            &MarketCategory::Crypto,
            &9_999_999_999u64,
            &1_000_000_000_000i128,
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
        );

        assert_eq!(market_id, 1u64);
        assert_eq!(client.get_all_markets().len(), 1);
        assert!(client.get_market(&market_id).is_some());
    }

    #[test]
    fn test_create_multiple_markets_sequential_ids() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env);

        let creator = Address::generate(&env);
        for _ in 0..3 {
            client.create_market(
                &creator,
                &String::from_str(&env, "Test market?"),
                &MarketCategory::Other,
                &9_999_999_999u64,
                &1_000_000_000_000i128,
                &Address::generate(&env),
                &Address::generate(&env),
                &Address::generate(&env),
                &Address::generate(&env),
            );
        }

        assert_eq!(client.get_all_markets().len(), 3);
        assert!(client.get_market(&3u64).is_some());
    }

    #[test]
    fn test_get_nonexistent_market_returns_none() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env);
        assert!(client.get_market(&999u64).is_none());
    }

    #[test]
    #[should_panic]
    fn test_create_market_with_insufficient_liquidity_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env);

        let creator = Address::generate(&env);
        client.create_market(
            &creator,
            &String::from_str(&env, "Test?"),
            &MarketCategory::Other,
            &9_999_999_999u64,
            &100i128, // below MIN_LIQUIDITY
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
        );
    }
}

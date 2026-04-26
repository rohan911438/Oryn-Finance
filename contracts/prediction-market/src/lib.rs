#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype,
    Address, Env, String, Error,
};

use oryn_shared::{
    MarketInfo,
    MarketStatus,
    TokenType,
    OrynError,
};

/// Fixed-point precision (same as shared)
const PRECISION: i128 = 1_000_000_000;

contractmeta!(
    key = "Description",
    val = "Oryn Prediction Market (Optimized & Build-Safe)"
);

/* ============================================================
   STORAGE
============================================================ */

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    MarketInfo,
    UserPosition(Address),
    Outcome,
    HasClaimed(Address),
    Admin,
    Oracle,
    Paused,
}

/* ============================================================
   DATA TYPES
============================================================ */

#[contracttype]
#[derive(Clone)]
pub struct UserPosition {
    pub user: Address,
    pub yes_tokens: i128,
    pub no_tokens: i128,
    pub total_invested: i128,
    pub average_yes_price: i128,
    pub average_no_price: i128,
    pub realized_pnl: i128,
}

/* ============================================================
   CONTRACT
============================================================ */

#[contract]
pub struct PredictionMarket;

/* ============================================================
   IMPLEMENTATION
============================================================ */

#[contractimpl]
impl PredictionMarket {

    /* ---------------- INIT ---------------- */

    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        market: MarketInfo,
    ) -> Result<(), Error> {
        if env.storage().persistent().has(&StorageKey::MarketInfo) {
            return Err(OrynError::InvalidInput.into());
        }

        admin.require_auth();

        env.storage().persistent().set(&StorageKey::MarketInfo, &market);
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::Oracle, &oracle);
        env.storage().persistent().set(&StorageKey::Paused, &false);

        Ok(())
    }

    /* ---------------- BUY ---------------- */

    pub fn buy(
        env: Env,
        user: Address,
        token: TokenType,
        amount: i128,
        price: i128,
    ) -> Result<(), Error> {
        user.require_auth();
        Self::require_active(&env)?;

        if amount <= 0 || price <= 0 {
            return Err(OrynError::InvalidTradeAmount.into());
        }

        let mut pos = Self::load_position(&env, &user);
        let cost = amount * price / PRECISION;

        match token {
            TokenType::Yes => {
                pos.yes_tokens += amount;
                pos.average_yes_price = price;
            }
            TokenType::No => {
                pos.no_tokens += amount;
                pos.average_no_price = price;
            }
        }

        pos.total_invested += cost;

        env.storage()
            .persistent()
            .set(&StorageKey::UserPosition(user), &pos);

        Ok(())
    }

    /* ---------------- SELL ---------------- */

    pub fn sell(
        env: Env,
        user: Address,
        token: TokenType,
        amount: i128,
        price: i128,
    ) -> Result<(), Error> {
        user.require_auth();
        Self::require_active(&env)?;

        let mut pos = Self::load_position(&env, &user);
        let value = amount * price / PRECISION;

        match token {
            TokenType::Yes => {
                if pos.yes_tokens < amount {
                    return Err(OrynError::InsufficientBalance.into());
                }
                pos.yes_tokens -= amount;
            }
            TokenType::No => {
                if pos.no_tokens < amount {
                    return Err(OrynError::InsufficientBalance.into());
                }
                pos.no_tokens -= amount;
            }
        }

        pos.realized_pnl += value;

        env.storage()
            .persistent()
            .set(&StorageKey::UserPosition(user), &pos);

        Ok(())
    }

    /* ---------------- RESOLVE ---------------- */

    pub fn resolve(
        env: Env,
        oracle: Address,
        outcome: bool,
    ) -> Result<(), Error> {
        oracle.require_auth();

        let stored_oracle: Address =
            env.storage().persistent().get(&StorageKey::Oracle).unwrap();

        if oracle != stored_oracle {
            return Err(OrynError::Unauthorized.into());
        }

        let mut market: MarketInfo =
            env.storage().persistent().get(&StorageKey::MarketInfo).unwrap();

        if market.status != MarketStatus::Active {
            return Err(OrynError::InvalidInput.into());
        }

        market.status = MarketStatus::Resolved;
        market.outcome = Some(outcome);

        env.storage().persistent().set(&StorageKey::MarketInfo, &market);
        env.storage().persistent().set(&StorageKey::Outcome, &outcome);

        Ok(())
    }

    /* ---------------- CLAIM ---------------- */

    pub fn claim(env: Env, user: Address) -> Result<i128, Error> {
        user.require_auth();

        if env.storage().persistent().has(&StorageKey::HasClaimed(user.clone())) {
            return Err(OrynError::InvalidInput.into());
        }

        let market: MarketInfo =
            env.storage().persistent().get(&StorageKey::MarketInfo).unwrap();

        if market.status != MarketStatus::Resolved {
            return Err(OrynError::InvalidInput.into());
        }

        let outcome = market.outcome.unwrap();
        let pos = Self::load_position(&env, &user);

        let winnings = match outcome {
            true => pos.yes_tokens,
            false => pos.no_tokens,
        };

        env.storage()
            .persistent()
            .set(&StorageKey::HasClaimed(user), &true);

        Ok(winnings)
    }

    /* ---------------- GETTERS ---------------- */

    pub fn get_position(env: Env, user: Address) -> UserPosition {
        Self::load_position(&env, &user)
    }

    pub fn get_market(env: Env) -> MarketInfo {
        env.storage().persistent().get(&StorageKey::MarketInfo).unwrap()
    }

    /* ---------------- INTERNAL ---------------- */

    fn load_position(env: &Env, user: &Address) -> UserPosition {
        env.storage()
            .persistent()
            .get(&StorageKey::UserPosition(user.clone()))
            .unwrap_or(UserPosition {
                user: user.clone(),
                yes_tokens: 0,
                no_tokens: 0,
                total_invested: 0,
                average_yes_price: 0,
                average_no_price: 0,
                realized_pnl: 0,
            })
    }

    fn require_active(env: &Env) -> Result<(), Error> {
        let paused: bool =
            env.storage().persistent().get(&StorageKey::Paused).unwrap_or(false);

        if paused {
            return Err(OrynError::ContractPaused.into());
        }

        let market: MarketInfo =
            env.storage().persistent().get(&StorageKey::MarketInfo).unwrap();

        if market.status != MarketStatus::Active {
            return Err(OrynError::MarketNotActive.into());
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env, String};
    use oryn_shared::{MarketCategory, MarketInfo, MarketStatus, TokenType};

    fn make_market(env: &Env, oracle: &Address) -> MarketInfo {
        MarketInfo {
            market_id: String::from_str(env, "mkt-1"),
            question: String::from_str(env, "Will BTC hit 100k?"),
            category: MarketCategory::Crypto,
            creator: Address::generate(env),
            yes_token_id: Address::generate(env),
            no_token_id: Address::generate(env),
            pool_address: Address::generate(env),
            oracle_address: oracle.clone(),
            created_at: 0,
            expires_at: 9_999_999_999,
            resolution_criteria: String::from_str(env, "Price feed"),
            status: MarketStatus::Active,
            total_volume: 0,
            total_liquidity: 1_000_000_000_000,
            outcome: None,
            min_liquidity: 1_000_000_000_000,
        }
    }

    #[test]
    fn test_initialize_stores_market_info() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        let m = client.get_market();
        assert_eq!(m.question, String::from_str(&env, "Will BTC hit 100k?"));
        assert_eq!(m.status, MarketStatus::Active);
    }

    #[test]
    #[should_panic]
    fn test_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let market = make_market(&env, &oracle);
        client.initialize(&admin, &oracle, &market);
        client.initialize(&admin, &oracle, &market);
    }

    #[test]
    fn test_buy_yes_tokens_increases_position() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let user = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        client.buy(&user, &TokenType::Yes, &1_000_000_000, &500_000_000);

        let pos = client.get_position(&user);
        assert_eq!(pos.yes_tokens, 1_000_000_000);
        assert_eq!(pos.no_tokens, 0);
    }

    #[test]
    fn test_buy_no_tokens_increases_position() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let user = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        client.buy(&user, &TokenType::No, &2_000_000_000, &500_000_000);

        let pos = client.get_position(&user);
        assert_eq!(pos.no_tokens, 2_000_000_000);
        assert_eq!(pos.yes_tokens, 0);
    }

    #[test]
    fn test_sell_reduces_position_and_records_pnl() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let user = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        client.buy(&user, &TokenType::Yes, &3_000_000_000, &500_000_000);
        client.sell(&user, &TokenType::Yes, &1_000_000_000, &600_000_000);

        let pos = client.get_position(&user);
        assert_eq!(pos.yes_tokens, 2_000_000_000);
        assert!(pos.realized_pnl > 0);
    }

    #[test]
    #[should_panic]
    fn test_sell_exceeds_balance_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let user = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        client.buy(&user, &TokenType::Yes, &500_000_000, &500_000_000);
        client.sell(&user, &TokenType::Yes, &1_000_000_000, &500_000_000);
    }

    #[test]
    fn test_resolve_by_oracle_sets_outcome() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        client.resolve(&oracle, &true);

        let m = client.get_market();
        assert_eq!(m.status, MarketStatus::Resolved);
        assert_eq!(m.outcome, Some(true));
    }

    #[test]
    #[should_panic]
    fn test_resolve_unauthorized_oracle_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        let fake = Address::generate(&env);
        client.resolve(&fake, &true);
    }

    #[test]
    fn test_claim_yes_winner_returns_tokens() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let user = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        let amount = 2_000_000_000i128;
        client.buy(&user, &TokenType::Yes, &amount, &500_000_000);
        client.resolve(&oracle, &true);

        let winnings = client.claim(&user);
        assert_eq!(winnings, amount);
    }

    #[test]
    fn test_claim_losing_side_returns_zero() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let loser = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        client.buy(&loser, &TokenType::No, &1_000_000_000, &500_000_000);
        client.resolve(&oracle, &true); // YES wins; loser holds NO

        let winnings = client.claim(&loser);
        assert_eq!(winnings, 0);
    }

    #[test]
    #[should_panic]
    fn test_claim_twice_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let user = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        client.buy(&user, &TokenType::Yes, &1_000_000_000, &500_000_000);
        client.resolve(&oracle, &true);
        client.claim(&user);
        client.claim(&user);
    }
}

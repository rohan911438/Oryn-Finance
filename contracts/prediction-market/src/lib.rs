#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, Address, Env, Error,
};

use oryn_shared::{MarketInfo, MarketStatus, OrynError, TokenType};

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

#[contracttype]
#[derive(Clone)]
pub struct BatchTradeRequest {
    pub user: Address,
    pub token: u32,
    pub is_buy: bool,
    pub amount: i128,
    pub max_price: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct BatchTradeResult {
    pub user: Address,
    pub executed_amount: i128,
    pub executed_price: i128,
    pub gas_saved: i128,
    pub success: bool,
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

        env.storage()
            .persistent()
            .set(&StorageKey::MarketInfo, &market);
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

    /* ---------------- BATCHED EXECUTION ---------------- */

    pub fn execute_batch_trades(
        env: Env,
        executor: Address,
        trades: soroban_sdk::Vec<BatchTradeRequest>,
    ) -> Result<soroban_sdk::Vec<BatchTradeResult>, Error> {
        executor.require_auth();
        Self::require_active(&env)?;

        if trades.is_empty() || trades.len() > 50 {
            return Err(OrynError::InvalidInput.into());
        }

        let mut results = soroban_sdk::Vec::new(&env);
        let base_gas_cost = 100_000i128; // Base gas cost per individual trade
        let batch_gas_cost = 150_000i128; // Total gas cost for batch
        let gas_saved_per_trade =
            (base_gas_cost * trades.len() as i128 - batch_gas_cost) / trades.len() as i128;

        // Group trades by token type and direction for optimization
        let mut yes_buy_total = 0i128;
        let mut yes_sell_total = 0i128;
        let mut no_buy_total = 0i128;
        let mut no_sell_total = 0i128;

        // Calculate totals for price impact
        for trade in trades.iter() {
            let token = Self::token_from_code(trade.token)?;
            match (token, trade.is_buy) {
                (TokenType::Yes, true) => yes_buy_total += trade.amount,
                (TokenType::Yes, false) => yes_sell_total += trade.amount,
                (TokenType::No, true) => no_buy_total += trade.amount,
                (TokenType::No, false) => no_sell_total += trade.amount,
            }
        }

        // Calculate batch price impact (reduced compared to individual trades)
        let total_volume = yes_buy_total + yes_sell_total + no_buy_total + no_sell_total;
        let batch_price_impact = Self::calculate_batch_price_impact(total_volume);

        // Execute trades with optimized pricing
        for trade in trades.iter() {
            let mut result = BatchTradeResult {
                user: trade.user.clone(),
                executed_amount: 0,
                executed_price: 0,
                gas_saved: gas_saved_per_trade,
                success: false,
            };

            // Calculate execution price with batch discount
            let token = Self::token_from_code(trade.token)?;
            let base_price = Self::get_current_price(&env, &token)?;
            let execution_price = if trade.is_buy {
                base_price + (batch_price_impact / 2) // Reduced price impact
            } else {
                base_price - (batch_price_impact / 2)
            };

            // Validate price limits
            if trade.is_buy && execution_price > trade.max_price {
                results.push_back(result); // Failed due to price limit
                continue;
            }
            if !trade.is_buy && execution_price < trade.max_price {
                results.push_back(result); // Failed due to price limit
                continue;
            }

            // Execute the trade
            let execute_result = if trade.is_buy {
                Self::buy(
                    env.clone(),
                    trade.user.clone(),
                    token.clone(),
                    trade.amount,
                    execution_price,
                )
            } else {
                Self::sell(
                    env.clone(),
                    trade.user.clone(),
                    token.clone(),
                    trade.amount,
                    execution_price,
                )
            };

            if execute_result.is_ok() {
                result.executed_amount = trade.amount;
                result.executed_price = execution_price;
                result.success = true;
            }

            results.push_back(result);
        }

        Ok(results)
    }

    fn calculate_batch_price_impact(total_volume: i128) -> i128 {
        // Reduced price impact for batched trades
        // Individual trades would have higher cumulative impact
        let base_impact = total_volume * 100 / PRECISION; // 0.01% per unit
        core::cmp::min(base_impact, PRECISION / 20) // Cap at 5%
    }

    fn get_current_price(_env: &Env, token: &TokenType) -> Result<i128, Error> {
        // Simplified price calculation - in real implementation,
        // this would query the AMM pool or oracle
        match token {
            TokenType::Yes => Ok(PRECISION / 2), // 50 cents
            TokenType::No => Ok(PRECISION / 2),  // 50 cents
        }
    }

    fn token_from_code(token: u32) -> Result<TokenType, Error> {
        match token {
            0 => Ok(TokenType::Yes),
            1 => Ok(TokenType::No),
            _ => Err(OrynError::InvalidTokenType.into()),
        }
    }

    /* ---------------- RESOLVE ---------------- */

    pub fn resolve(env: Env, oracle: Address, outcome: bool) -> Result<(), Error> {
        oracle.require_auth();

        let stored_oracle: Address = env.storage().persistent().get(&StorageKey::Oracle).unwrap();

        if oracle != stored_oracle {
            return Err(OrynError::Unauthorized.into());
        }

        let mut market: MarketInfo = env
            .storage()
            .persistent()
            .get(&StorageKey::MarketInfo)
            .unwrap();

        if market.status != MarketStatus::Active {
            return Err(OrynError::InvalidInput.into());
        }

        market.status = MarketStatus::Resolved;
        market.outcome = Some(outcome);

        env.storage()
            .persistent()
            .set(&StorageKey::MarketInfo, &market);
        env.storage()
            .persistent()
            .set(&StorageKey::Outcome, &outcome);

        Ok(())
    }

    /* ---------------- CLAIM ---------------- */

    pub fn claim(env: Env, user: Address) -> Result<i128, Error> {
        user.require_auth();

        if env
            .storage()
            .persistent()
            .has(&StorageKey::HasClaimed(user.clone()))
        {
            return Err(OrynError::InvalidInput.into());
        }

        let market: MarketInfo = env
            .storage()
            .persistent()
            .get(&StorageKey::MarketInfo)
            .unwrap();

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
        env.storage()
            .persistent()
            .get(&StorageKey::MarketInfo)
            .unwrap()
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
        let paused: bool = env
            .storage()
            .persistent()
            .get(&StorageKey::Paused)
            .unwrap_or(false);

        if paused {
            return Err(OrynError::ContractPaused.into());
        }

        let market: MarketInfo = env
            .storage()
            .persistent()
            .get(&StorageKey::MarketInfo)
            .unwrap();

        if market.status != MarketStatus::Active {
            return Err(OrynError::MarketNotActive.into());
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use oryn_shared::{MarketCategory, MarketInfo, MarketStatus, TokenType};
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

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
    fn test_simulated_market_lifecycle_tracks_trades_resolution_and_claims() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let yes_trader = Address::generate(&env);
        let no_trader = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        client.buy(&yes_trader, &TokenType::Yes, &3_000_000_000, &500_000_000);
        client.buy(&no_trader, &TokenType::No, &2_000_000_000, &400_000_000);
        client.sell(&yes_trader, &TokenType::Yes, &1_000_000_000, &600_000_000);

        let yes_position = client.get_position(&yes_trader);
        assert_eq!(yes_position.yes_tokens, 2_000_000_000);
        assert_eq!(yes_position.realized_pnl, 600_000_000);

        let no_position = client.get_position(&no_trader);
        assert_eq!(no_position.no_tokens, 2_000_000_000);

        client.resolve(&oracle, &true);

        let market = client.get_market();
        assert_eq!(market.status, MarketStatus::Resolved);
        assert_eq!(market.outcome, Some(true));

        let winning_claim = client.claim(&yes_trader);
        let losing_claim = client.claim(&no_trader);
        assert_eq!(winning_claim, 2_000_000_000);
        assert_eq!(losing_claim, 0);
    }

    #[test]
    #[should_panic]
    fn test_buy_after_resolution_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let user = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));
        client.resolve(&oracle, &true);

        client.buy(&user, &TokenType::Yes, &1_000_000_000, &500_000_000);
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

    #[test]
    fn test_stress_high_volume_trading_maintains_position_integrity() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let trader = Address::generate(&env);
        client.initialize(&admin, &oracle, &make_market(&env, &oracle));

        let mut expected_yes: i128 = 0;
        let mut expected_no: i128 = 0;

        for i in 0..50 {
            if i % 3 == 0 {
                client.buy(&trader, &TokenType::Yes, &100_000_000, &500_000_000);
                expected_yes += 100_000_000;
            } else if i % 3 == 1 {
                client.buy(&trader, &TokenType::No, &100_000_000, &500_000_000);
                expected_no += 100_000_000;
            } else if expected_yes >= 50_000_000 {
                client.sell(&trader, &TokenType::Yes, &50_000_000, &550_000_000);
                expected_yes -= 50_000_000;
            }
        }

        let pos = client.get_position(&trader);
        assert_eq!(pos.yes_tokens, expected_yes);
        assert_eq!(pos.no_tokens, expected_no);
        assert!(pos.yes_tokens >= 0);
        assert!(pos.no_tokens >= 0);
    }
}

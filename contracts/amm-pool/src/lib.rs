#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Error, String,
};

use oryn_shared::{
    LiquidityEvent, OrynError, PoolInfo, SwapEvent, TokenType, MAX_FEE_RATE, MAX_SLIPPAGE_BPS,
    PRECISION,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlippageConfig {
    pub max_slippage_bps: u32,
    pub price_impact_protection: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    PoolInfo,
    YesReserve,
    NoReserve,
    KConstant,
    TotalLpTokens,
    LpBalance(Address),
    Factory,
    Market,
    Admin,
    FeeRate,
    TotalFeesCollected,
    LpToken,
    Treasury,
    Paused,
    Initialized,
    ReentrancyGuard,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapResult {
    pub amount_out: i128,
    pub price_impact: i128,
    pub fee: i128,
    pub new_yes_reserve: i128,
    pub new_no_reserve: i128,
}

#[contract]
pub struct AmmPoolContract;

#[contractimpl]
impl AmmPoolContract {
    // --------------------------------------------------
    // INITIALIZE
    // --------------------------------------------------
    pub fn initialize(
        env: Env,
        factory: Address,
        market: Address,
        admin: Address,
        pool_id: String,
        yes_token: Address,
        no_token: Address,
        lp_token: Address,
        treasury: Address,
        fee_rate: u32,
    ) -> Result<(), Error> {
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput.into());
        }

        factory.require_auth();

        if fee_rate > MAX_FEE_RATE {
            return Err(OrynError::InvalidFeeRate.into());
        }

        let pool_info = PoolInfo {
            pool_id,
            market_address: market.clone(),
            yes_token,
            no_token,
            yes_reserve: 0,
            no_reserve: 0,
            k_constant: 0,
            total_liquidity: 0,
            fee_rate,
            total_fees_collected: 0,
        };

        let store = env.storage().persistent();
        store.set(&StorageKey::PoolInfo, &pool_info);
        store.set(&StorageKey::Factory, &factory);
        store.set(&StorageKey::Market, &market);
        store.set(&StorageKey::Admin, &admin);
        store.set(&StorageKey::LpToken, &lp_token);
        store.set(&StorageKey::Treasury, &treasury);
        store.set(&StorageKey::FeeRate, &fee_rate);
        store.set(&StorageKey::YesReserve, &0i128);
        store.set(&StorageKey::NoReserve, &0i128);
        store.set(&StorageKey::KConstant, &0i128);
        store.set(&StorageKey::TotalLpTokens, &0i128);
        store.set(&StorageKey::TotalFeesCollected, &0i128);
        store.set(&StorageKey::Paused, &false);
        store.set(&StorageKey::ReentrancyGuard, &false);
        store.set(&StorageKey::Initialized, &true);

        Ok(())
    }

    // --------------------------------------------------
    // ADD LIQUIDITY
    // --------------------------------------------------
    pub fn add_liquidity(env: Env, provider: Address, usdc_amount: i128) -> Result<i128, Error> {
        provider.require_auth();
        Self::require_not_paused(&env)?;

        if usdc_amount <= 0 {
            return Err(OrynError::InvalidInput.into());
        }

        let yes_reserve = Self::get_yes_reserve(&env);
        let no_reserve = Self::get_no_reserve(&env);
        let total_lp = Self::get_total_lp_tokens(&env);

        let (yes_amt, no_amt, lp_mint) = if total_lp == 0 {
            (usdc_amount / 2, usdc_amount / 2, usdc_amount)
        } else {
            let total = yes_reserve + no_reserve;
            let yes = usdc_amount * yes_reserve / total;
            let no = usdc_amount - yes;
            let lp = usdc_amount * total_lp / total;
            (yes, no, lp)
        };

        Self::set_reserves(&env, yes_reserve + yes_amt, no_reserve + no_amt)?;
        Self::mint_lp(&env, &provider, lp_mint)?;

        let pool_id = Self::get_pool_info_internal(&env).pool_id.clone();

        env.events().publish(
            (symbol_short!("liq"), symbol_short!("add")),
            LiquidityEvent {
                provider,
                pool_id,
                amount: usdc_amount,
                yes_tokens: yes_amt,
                no_tokens: no_amt,
                lp_tokens: lp_mint,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(lp_mint)
    }

    // --------------------------------------------------
    // SWAP
    // --------------------------------------------------
    pub fn swap(
        env: Env,
        trader: Address,
        token_in: TokenType,
        amount_in: i128,
        min_out: i128,
    ) -> Result<i128, Error> {
        trader.require_auth();
        Self::require_not_paused(&env)?;

        let result = Self::calculate_swap(&env, &token_in, amount_in)?;
        if result.amount_out < min_out {
            return Err(OrynError::SlippageExceeded.into());
        }

        Self::set_reserves(&env, result.new_yes_reserve, result.new_no_reserve)?;

        let pool_id = Self::get_pool_info_internal(&env).pool_id.clone();
        let token_in_clone = token_in.clone();

        env.events().publish(
            (symbol_short!("swap"), symbol_short!("exec")),
            SwapEvent {
                trader,
                pool_id,
                token_in: token_in_clone,
                token_out: if matches!(token_in, TokenType::Yes) {
                    TokenType::No
                } else {
                    TokenType::Yes
                },
                amount_in,
                amount_out: result.amount_out,
                price: Self::price(&env),
                fee: result.fee,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(result.amount_out)
    }

    // --------------------------------------------------
    // GETTERS
    // --------------------------------------------------

    pub fn get_pool_info(env: Env) -> PoolInfo {
        Self::get_pool_info_internal(&env)
    }

    pub fn get_yes_reserve_pub(env: Env) -> i128 {
        Self::get_yes_reserve(&env)
    }

    pub fn get_no_reserve_pub(env: Env) -> i128 {
        Self::get_no_reserve(&env)
    }

    // --------------------------------------------------
    // INTERNALS
    // --------------------------------------------------

    fn calculate_swap(env: &Env, token: &TokenType, amount: i128) -> Result<SwapResult, Error> {
        let yes = Self::get_yes_reserve(env);
        let no = Self::get_no_reserve(env);
        let fee_rate = Self::get_fee_rate(env) as i128;

        let fee = amount * fee_rate / 10_000;
        let amount_after_fee = amount - fee;

        let (rin, rout) = match token {
            TokenType::Yes => (yes, no),
            TokenType::No => (no, yes),
        };

        let k = rin * rout;
        let new_rin = rin + amount_after_fee;
        let new_rout = k / new_rin;

        let out = rout - new_rout;
        let price_impact = if rin > 0 && new_rin > 0 {
            ((rout * PRECISION / rin) - (new_rout * PRECISION / new_rin)).max(0)
        } else {
            0
        };

        if price_impact > MAX_SLIPPAGE_BPS as i128 * PRECISION / 10_000 {
            return Err(OrynError::SlippageExceeded.into());
        }

        let (new_yes, new_no) = match token {
            TokenType::Yes => (new_rin, new_rout),
            TokenType::No => (new_rout, new_rin),
        };

        Ok(SwapResult {
            amount_out: out,
            price_impact,
            fee,
            new_yes_reserve: new_yes,
            new_no_reserve: new_no,
        })
    }

    fn price(env: &Env) -> i128 {
        let yes = Self::get_yes_reserve(env);
        let no = Self::get_no_reserve(env);
        if no == 0 {
            PRECISION
        } else {
            yes * PRECISION / no
        }
    }

    fn require_not_paused(env: &Env) -> Result<(), Error> {
        if env
            .storage()
            .persistent()
            .get(&StorageKey::Paused)
            .unwrap_or(false)
        {
            return Err(OrynError::ContractPaused.into());
        }
        Ok(())
    }

    fn get_yes_reserve(env: &Env) -> i128 {
        env.storage()
            .persistent()
            .get(&StorageKey::YesReserve)
            .unwrap_or(0)
    }

    fn get_no_reserve(env: &Env) -> i128 {
        env.storage()
            .persistent()
            .get(&StorageKey::NoReserve)
            .unwrap_or(0)
    }

    fn get_total_lp_tokens(env: &Env) -> i128 {
        env.storage()
            .persistent()
            .get(&StorageKey::TotalLpTokens)
            .unwrap_or(0)
    }

    fn get_fee_rate(env: &Env) -> u32 {
        env.storage()
            .persistent()
            .get(&StorageKey::FeeRate)
            .unwrap_or(30)
    }

    fn get_pool_info_internal(env: &Env) -> PoolInfo {
        env.storage()
            .persistent()
            .get(&StorageKey::PoolInfo)
            .unwrap()
    }

    fn set_reserves(env: &Env, yes: i128, no: i128) -> Result<(), Error> {
        let store = env.storage().persistent();
        store.set(&StorageKey::YesReserve, &yes);
        store.set(&StorageKey::NoReserve, &no);
        store.set(&StorageKey::KConstant, &(yes * no));
        Ok(())
    }

    fn mint_lp(env: &Env, user: &Address, amount: i128) -> Result<(), Error> {
        let mut bal = env
            .storage()
            .persistent()
            .get(&StorageKey::LpBalance(user.clone()))
            .unwrap_or(0);
        bal += amount;
        env.storage()
            .persistent()
            .set(&StorageKey::LpBalance(user.clone()), &bal);

        let total = Self::get_total_lp_tokens(env) + amount;
        env.storage()
            .persistent()
            .set(&StorageKey::TotalLpTokens, &total);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env, String};
    use oryn_shared::TokenType;

    fn setup(env: &Env, fee_rate: u32) -> (AmmPoolContractClient, Address) {
        let factory = Address::generate(env);
        let market = Address::generate(env);
        let admin = Address::generate(env);
        let contract_id = env.register_contract(None, AmmPoolContract);
        let client = AmmPoolContractClient::new(env, &contract_id);

        client.initialize(
            &factory,
            &market,
            &admin,
            &String::from_str(env, "pool-1"),
            &Address::generate(env),
            &Address::generate(env),
            &Address::generate(env),
            &Address::generate(env),
            &fee_rate,
        );

        (client, admin)
    }

    #[test]
    fn test_initialize_creates_empty_pool() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let info = client.get_pool_info();
        assert_eq!(info.yes_reserve, 0);
        assert_eq!(info.no_reserve, 0);
        assert_eq!(info.fee_rate, 30);
    }

    #[test]
    #[should_panic]
    fn test_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let factory = Address::generate(&env);
        let contract_id = env.register_contract(None, AmmPoolContract);
        let client = AmmPoolContractClient::new(&env, &contract_id);
        let args = (
            factory.clone(),
            Address::generate(&env),
            Address::generate(&env),
            String::from_str(&env, "pool-1"),
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            30u32,
        );
        client.initialize(
            &args.0, &args.1, &args.2, &args.3, &args.4, &args.5, &args.6, &args.7, &args.8,
        );
        client.initialize(
            &factory,
            &Address::generate(&env),
            &Address::generate(&env),
            &String::from_str(&env, "pool-1"),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &30u32,
        );
    }

    #[test]
    #[should_panic]
    fn test_initialize_fee_above_max_fails() {
        let env = Env::default();
        env.mock_all_auths();
        setup(&env, 10_001); // above MAX_FEE_RATE
    }

    #[test]
    fn test_add_initial_liquidity_splits_evenly_and_mints_lp() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let provider = Address::generate(&env);
        let usdc = 2_000_000_000i128;
        let lp = client.add_liquidity(&provider, &usdc);

        assert_eq!(lp, usdc);
        // Reserves are stored separately from PoolInfo — use the dedicated getters
        assert_eq!(client.get_yes_reserve_pub(), usdc / 2);
        assert_eq!(client.get_no_reserve_pub(), usdc / 2);
    }

    #[test]
    fn test_add_proportional_liquidity_after_first_deposit() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);

        client.add_liquidity(&p1, &2_000_000_000);
        let lp2 = client.add_liquidity(&p2, &1_000_000_000);

        assert!(lp2 > 0);
        assert!(lp2 < 2_000_000_000); // proportional share, not equal to first deposit
    }

    #[test]
    fn test_swap_yes_for_no_returns_positive_output() {
        let env = Env::default();
        env.mock_all_auths();
        // Use 2B reserves so that a 10M swap (~0.5%) stays under MAX_SLIPPAGE_BPS (5%)
        let (client, _) = setup(&env, 30);

        let provider = Address::generate(&env);
        client.add_liquidity(&provider, &2_000_000_000);

        let trader = Address::generate(&env);
        let amount_in = 10_000_000i128;
        let out = client.swap(&trader, &TokenType::Yes, &amount_in, &0);

        assert!(out > 0);
        assert!(out < amount_in); // fee + slippage means output is always less than input
    }

    #[test]
    fn test_swap_no_for_yes_returns_positive_output() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let provider = Address::generate(&env);
        client.add_liquidity(&provider, &2_000_000_000);

        let trader = Address::generate(&env);
        let out = client.swap(&trader, &TokenType::No, &10_000_000, &0);

        assert!(out > 0);
    }

    #[test]
    fn test_swap_updates_reserves_correctly() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let provider = Address::generate(&env);
        client.add_liquidity(&provider, &2_000_000_000);

        let yes_before = client.get_yes_reserve_pub();
        let no_before = client.get_no_reserve_pub();

        let trader = Address::generate(&env);
        client.swap(&trader, &TokenType::Yes, &10_000_000, &0);

        // YES reserve increases, NO reserve decreases after a YES→NO swap
        assert!(client.get_yes_reserve_pub() > yes_before);
        assert!(client.get_no_reserve_pub() < no_before);
    }

    #[test]
    #[should_panic]
    fn test_swap_min_out_not_met_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let provider = Address::generate(&env);
        client.add_liquidity(&provider, &2_000_000_000);

        let trader = Address::generate(&env);
        // With 10M in and ~9.87M expected out, demanding 15M should fail
        client.swap(&trader, &TokenType::Yes, &10_000_000, &15_000_000);
    }

    #[test]
    fn test_get_pool_info_returns_fee_rate() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 50);

        let info = client.get_pool_info();
        assert_eq!(info.fee_rate, 50);
        assert_eq!(info.total_fees_collected, 0);
    }
}

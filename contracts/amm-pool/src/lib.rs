#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Error, String, Vec,
};

use oryn_shared::{
    CircuitBreakerEvent, CircuitBreakerState, EmergencyPauseEvent, LiquidityImbalanceEvent,
    LiquidityImbalanceState, LiquidityEvent, OrynError, PoolInfo, RiskAlert, RiskAlertType,
    RiskMetrics, SwapEvent, TradingLimits, TradingLimitEvent, TokenType, MAX_DRAWDOWN_BPS,
    MAX_FEE_RATE, MAX_SLIPPAGE_BPS, MAX_TRADE_SIZE_BPS, PRECISION, CIRCUIT_BREAKER_COOLDOWN,
    CIRCUIT_BREAKER_THRESHOLD_BPS, LIQUIDITY_IMBALANCE_THRESHOLD_BPS,
    PRICE_DEVIATION_THRESHOLD_BPS, VOLUME_SPIKE_MULTIPLIER, DYNAMIC_LIMIT_WINDOW,
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
    // Risk Control Storage Keys
    CircuitBreaker,
    LiquidityImbalance,
    TradingLimits,
    EmergencyPaused,
    PriceHistory,
    PeakPrice,
    TradeVolumeWindow,
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
    #[allow(clippy::too_many_arguments)]
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

        // Initialize risk control state
        store.set(&StorageKey::CircuitBreaker, &CircuitBreakerState::default());
        store.set(&StorageKey::LiquidityImbalance, &LiquidityImbalanceState {
            yes_reserve: 0,
            no_reserve: 0,
            imbalance_bps: 0,
            is_imbalanced: false,
            last_check_timestamp: 0,
        });
        store.set(&StorageKey::TradingLimits, &TradingLimits {
            max_trade_size: 0,
            max_trades_per_window: 100,
            current_window_trades: 0,
            window_start: env.ledger().timestamp(),
            max_drawdown_bps: MAX_DRAWDOWN_BPS,
            current_drawdown_bps: 0,
        });
        store.set(&StorageKey::EmergencyPaused, &false);
        store.set(&StorageKey::PeakPrice, &0i128);

        Ok(())
    }

    // --------------------------------------------------
    // ADD LIQUIDITY
    // --------------------------------------------------
    pub fn add_liquidity(env: Env, provider: Address, usdc_amount: i128) -> Result<i128, Error> {
        provider.require_auth();
        Self::require_not_paused(&env)?;
        Self::require_not_emergency_paused(&env)?;
        Self::check_circuit_breaker(&env)?;
        Self::check_reentrancy(&env)?;

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

        // Check liquidity imbalance after adding liquidity
        Self::check_liquidity_imbalance(&env)?;

        // Reset reentrancy guard
        env.storage()
            .persistent()
            .set(&StorageKey::ReentrancyGuard, &false);

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
        Self::require_not_emergency_paused(&env)?;
        Self::check_circuit_breaker(&env)?;
        Self::check_reentrancy(&env)?;
        Self::check_trading_limits(&env, &trader, amount_in)?;

        let result = Self::calculate_swap(&env, &token_in, amount_in)?;
        if result.amount_out < min_out {
            return Err(OrynError::SlippageExceeded.into());
        }

        Self::set_reserves(&env, result.new_yes_reserve, result.new_no_reserve)?;

        // Update circuit breaker state with new price
        Self::update_circuit_breaker(&env, &result)?;

        // Update trading limits
        Self::update_trading_limits(&env, amount_in)?;

        // Check for drawdown after swap
        Self::check_drawdown(&env)?;

        let pool_id = Self::get_pool_info_internal(&env).pool_id.clone();
        let token_in_clone = token_in.clone();

        env.events().publish(
            (symbol_short!("swap"), symbol_short!("exec")),
            SwapEvent {
                trader: trader.clone(),
                pool_id: pool_id.clone(),
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

        // Emit trading limit event if near limit
        let limits = Self::get_trading_limits(&env);
        if limits.current_window_trades >= limits.max_trades_per_window.saturating_sub(5) {
            env.events().publish(
                (symbol_short!("risk"), symbol_short!("limit")),
                TradingLimitEvent {
                    pool_id,
                    trader,
                    trade_size: amount_in,
                    max_allowed: limits.max_trade_size,
                    timestamp: env.ledger().timestamp(),
                },
            );
        }

        // Reset reentrancy guard
        env.storage()
            .persistent()
            .set(&StorageKey::ReentrancyGuard, &false);

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

    // Risk Control Getters
    pub fn get_circuit_breaker_state(env: Env) -> CircuitBreakerState {
        Self::get_circuit_breaker(&env)
    }

    pub fn get_liquidity_imbalance_state(env: Env) -> LiquidityImbalanceState {
        Self::get_liquidity_imbalance(&env)
    }

    pub fn get_trading_limits_state(env: Env) -> TradingLimits {
        Self::get_trading_limits(&env)
    }

    pub fn is_emergency_paused(env: Env) -> bool {
        Self::is_emergency_paused_internal(&env)
    }

    pub fn get_risk_metrics(env: Env) -> RiskMetrics {
        let circuit_breaker = Self::get_circuit_breaker(&env);
        let liquidity_imbalance = Self::get_liquidity_imbalance(&env);
        let trading_limits = Self::get_trading_limits(&env);
        let emergency_paused = Self::is_emergency_paused_internal(&env);
        let last_price = Self::price(&env);
        let peak_price = Self::get_peak_price(&env);

        RiskMetrics {
            circuit_breaker,
            liquidity_imbalance,
            trading_limits,
            emergency_paused,
            last_price,
            peak_price,
            price_history_len: 0,
        }
    }

    // --------------------------------------------------
    // ADMIN FUNCTIONS
    // --------------------------------------------------

    pub fn trigger_circuit_breaker(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env)?;

        let mut cb = Self::get_circuit_breaker(&env);
        cb.is_triggered = true;
        cb.triggered_at = env.ledger().timestamp();
        cb.cooldown_end = env.ledger().timestamp() + CIRCUIT_BREAKER_COOLDOWN;
        cb.trigger_count += 1;

        env.storage().persistent().set(&StorageKey::CircuitBreaker, &cb);

        env.events().publish(
            (symbol_short!("risk"), symbol_short!("circuit")),
            CircuitBreakerEvent {
                pool_id: Self::get_pool_info_internal(&env).pool_id,
                is_triggered: true,
                trigger_count: cb.trigger_count,
                price_deviation_bps: 0,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    pub fn reset_circuit_breaker(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env)?;

        let mut cb = Self::get_circuit_breaker(&env);
        cb.is_triggered = false;
        cb.cooldown_end = 0;

        env.storage().persistent().set(&StorageKey::CircuitBreaker, &cb);

        Ok(())
    }

    pub fn activate_emergency_pause(env: Env, admin: Address, reason: String) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env)?;

        env.storage().persistent().set(&StorageKey::EmergencyPaused, &true);
        env.storage().persistent().set(&StorageKey::Paused, &true);

        env.events().publish(
            (symbol_short!("risk"), symbol_short!("pause")),
            EmergencyPauseEvent {
                pool_id: Self::get_pool_info_internal(&env).pool_id,
                reason,
                triggered_by: admin,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    pub fn deactivate_emergency_pause(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env)?;

        env.storage().persistent().set(&StorageKey::EmergencyPaused, &false);
        env.storage().persistent().set(&StorageKey::Paused, &false);

        // Reset circuit breaker on emergency pause deactivation
        let mut cb = Self::get_circuit_breaker(&env);
        cb.is_triggered = false;
        cb.cooldown_end = 0;
        env.storage().persistent().set(&StorageKey::CircuitBreaker, &cb);

        Ok(())
    }

    pub fn update_trading_limits_config(
        env: Env,
        admin: Address,
        max_trade_size: i128,
        max_trades_per_window: u32,
    ) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env)?;

        let mut limits = Self::get_trading_limits(&env);
        limits.max_trade_size = max_trade_size;
        limits.max_trades_per_window = max_trades_per_window;

        env.storage().persistent().set(&StorageKey::TradingLimits, &limits);

        Ok(())
    }

    pub fn check_liquidity_imbalance_manual(env: Env) -> Result<LiquidityImbalanceState, Error> {
        Self::check_liquidity_imbalance(&env)
    }

    // --------------------------------------------------
    // INTERNALS
    // --------------------------------------------------

    fn calculate_swap(env: &Env, token: &TokenType, amount: i128) -> Result<SwapResult, Error> {
        if amount <= 0 {
            return Err(OrynError::InvalidTradeAmount.into());
        }

        let yes = Self::get_yes_reserve(env);
        let no = Self::get_no_reserve(env);

        if yes == 0 || no == 0 {
            return Err(OrynError::NoLiquidity.into());
        }

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
        if out <= 0 {
            return Err(OrynError::InsufficientLiquidity.into());
        }

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

    // --------------------------------------------------
    // RISK CONTROL INTERNALS
    // --------------------------------------------------

    fn require_admin(env: &Env) -> Result<(), Error> {
        let admin: Address = env.storage().persistent().get(&StorageKey::Admin).unwrap();
        admin.require_auth();
        Ok(())
    }

    fn check_reentrancy(env: &Env) -> Result<(), Error> {
        let guard = env
            .storage()
            .persistent()
            .get(&StorageKey::ReentrancyGuard)
            .unwrap_or(false);
        if guard {
            return Err(OrynError::InvalidInput.into());
        }
        env.storage()
            .persistent()
            .set(&StorageKey::ReentrancyGuard, &true);
        Ok(())
    }

    fn is_emergency_paused_internal(env: &Env) -> bool {
        env.storage()
            .persistent()
            .get(&StorageKey::EmergencyPaused)
            .unwrap_or(false)
    }

    fn require_not_emergency_paused(env: &Env) -> Result<(), Error> {
        if Self::is_emergency_paused_internal(env) {
            return Err(OrynError::EmergencyPauseActive.into());
        }
        Ok(())
    }

    fn get_circuit_breaker(env: &Env) -> CircuitBreakerState {
        env.storage()
            .persistent()
            .get(&StorageKey::CircuitBreaker)
            .unwrap_or(CircuitBreakerState::default())
    }

    fn get_liquidity_imbalance(env: &Env) -> LiquidityImbalanceState {
        env.storage()
            .persistent()
            .get(&StorageKey::LiquidityImbalance)
            .unwrap_or(LiquidityImbalanceState {
                yes_reserve: 0,
                no_reserve: 0,
                imbalance_bps: 0,
                is_imbalanced: false,
                last_check_timestamp: 0,
            })
    }

    fn get_trading_limits(env: &Env) -> TradingLimits {
        env.storage()
            .persistent()
            .get(&StorageKey::TradingLimits)
            .unwrap_or(TradingLimits {
                max_trade_size: 0,
                max_trades_per_window: 100,
                current_window_trades: 0,
                window_start: env.ledger().timestamp(),
                max_drawdown_bps: MAX_DRAWDOWN_BPS,
                current_drawdown_bps: 0,
            })
    }

    fn get_peak_price(env: &Env) -> i128 {
        env.storage()
            .persistent()
            .get(&StorageKey::PeakPrice)
            .unwrap_or(0)
    }

    fn check_circuit_breaker(env: &Env) -> Result<(), Error> {
        let cb = Self::get_circuit_breaker(env);

        if !cb.is_triggered {
            return Ok(());
        }

        let now = env.ledger().timestamp();
        if now >= cb.cooldown_end {
            // Cooldown period has elapsed, allow trading again
            let mut updated_cb = cb;
            updated_cb.is_triggered = false;
            updated_cb.cooldown_end = 0;
            env.storage()
                .persistent()
                .set(&StorageKey::CircuitBreaker, &updated_cb);
            return Ok(());
        }

        Err(OrynError::CircuitBreakerTriggered.into())
    }

    fn update_circuit_breaker(env: &Env, swap_result: &SwapResult) -> Result<(), Error> {
        let mut cb = Self::get_circuit_breaker(env);
        let current_price = Self::price(env);

        // Check if this is the first swap
        if cb.last_price == 0 {
            cb.last_price = current_price;
            env.storage()
                .persistent()
                .set(&StorageKey::CircuitBreaker, &cb);
            return Ok(());
        }

        // Calculate price deviation
        let price_diff = (current_price - cb.last_price).abs();
        let deviation_bps = if cb.last_price > 0 {
            price_diff * 10_000 / cb.last_price
        } else {
            0
        };

        // Update peak price
        let peak = Self::get_peak_price(env);
        if current_price > peak {
            env.storage()
                .persistent()
                .set(&StorageKey::PeakPrice, &current_price);
        }

        // Check if circuit breaker should be triggered
        if deviation_bps >= CIRCUIT_BREAKER_THRESHOLD_BPS {
            cb.is_triggered = true;
            cb.triggered_at = env.ledger().timestamp();
            cb.cooldown_end = env.ledger().timestamp() + CIRCUIT_BREAKER_COOLDOWN;
            cb.trigger_count += 1;

            env.events().publish(
                (symbol_short!("risk"), symbol_short!("circuit")),
                CircuitBreakerEvent {
                    pool_id: Self::get_pool_info_internal(env).pool_id,
                    is_triggered: true,
                    trigger_count: cb.trigger_count,
                    price_deviation_bps: deviation_bps,
                    timestamp: env.ledger().timestamp(),
                },
            );
        }

        cb.last_price = current_price;
        env.storage()
            .persistent()
            .set(&StorageKey::CircuitBreaker, &cb);

        Ok(())
    }

    fn check_liquidity_imbalance(env: &Env) -> Result<LiquidityImbalanceState, Error> {
        let yes = Self::get_yes_reserve(env);
        let no = Self::get_no_reserve(env);

        if yes == 0 && no == 0 {
            return Ok(LiquidityImbalanceState {
                yes_reserve: 0,
                no_reserve: 0,
                imbalance_bps: 0,
                is_imbalanced: false,
                last_check_timestamp: env.ledger().timestamp(),
            });
        }

        let total = yes + no;
        let imbalance_bps = if total > 0 {
            ((yes as i128 - no as i128).abs() * 10_000 / total)
        } else {
            0
        };

        let is_imbalanced = imbalance_bps > LIQUIDITY_IMBALANCE_THRESHOLD_BPS;

        let state = LiquidityImbalanceState {
            yes_reserve: yes,
            no_reserve: no,
            imbalance_bps,
            is_imbalanced,
            last_check_timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&StorageKey::LiquidityImbalance, &state);

        if is_imbalanced {
            env.events().publish(
                (symbol_short!("risk"), symbol_short!("imbalance")),
                LiquidityImbalanceEvent {
                    pool_id: Self::get_pool_info_internal(env).pool_id,
                    yes_reserve: yes,
                    no_reserve: no,
                    imbalance_bps,
                    timestamp: env.ledger().timestamp(),
                },
            );
        }

        Ok(state)
    }

    fn check_trading_limits(env: &Env, trader: &Address, amount_in: i128) -> Result<(), Error> {
        let mut limits = Self::get_trading_limits(env);
        let now = env.ledger().timestamp();

        // Reset window if expired
        if now >= limits.window_start + DYNAMIC_LIMIT_WINDOW {
            limits.current_window_trades = 0;
            limits.window_start = now;
        }

        // Check trade count limit
        if limits.current_window_trades >= limits.max_trades_per_window {
            return Err(OrynError::TradingLimitExceeded.into());
        }

        // Check individual trade size limit (5% of pool reserves)
        let yes = Self::get_yes_reserve(env);
        let no = Self::get_no_reserve(env);
        let total_reserves = yes + no;
        let max_trade_size = total_reserves * MAX_TRADE_SIZE_BPS / 10_000;

        if amount_in > max_trade_size && max_trade_size > 0 {
            return Err(OrynError::TradingLimitExceeded.into());
        }

        limits.max_trade_size = max_trade_size;
        env.storage()
            .persistent()
            .set(&StorageKey::TradingLimits, &limits);

        Ok(())
    }

    fn update_trading_limits(env: &Env, amount_in: i128) -> Result<(), Error> {
        let mut limits = Self::get_trading_limits(&env);
        limits.current_window_trades += 1;
        env.storage()
            .persistent()
            .set(&StorageKey::TradingLimits, &limits);
        Ok(())
    }

    fn check_drawdown(env: &Env) -> Result<(), Error> {
        let current_price = Self::price(env);
        let peak_price = Self::get_peak_price(env);

        if peak_price == 0 || current_price == 0 {
            return Ok(());
        }

        let drawdown_bps = if peak_price > 0 {
            ((peak_price - current_price) * 10_000 / peak_price).max(0)
        } else {
            0
        };

        let mut limits = Self::get_trading_limits(&env);
        limits.current_drawdown_bps = drawdown_bps;
        env.storage()
            .persistent()
            .set(&StorageKey::TradingLimits, &limits);

        if drawdown_bps >= MAX_DRAWDOWN_BPS {
            // Auto-activate emergency pause
            env.storage().persistent().set(&StorageKey::EmergencyPaused, &true);
            env.storage().persistent().set(&StorageKey::Paused, &true);

            env.events().publish(
                (symbol_short!("risk"), symbol_short!("drawdown")),
                EmergencyPauseEvent {
                    pool_id: Self::get_pool_info_internal(env).pool_id,
                    reason: String::from_str(env, "Max drawdown exceeded"),
                    triggered_by: Self::get_pool_info_internal(env)
                        .market_address
                        .clone(),
                    timestamp: env.ledger().timestamp(),
                },
            );
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use oryn_shared::TokenType;
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    fn setup(env: &Env, fee_rate: u32) -> (AmmPoolContractClient<'_>, Address) {
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
    #[should_panic]
    fn test_swap_without_liquidity_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let trader = Address::generate(&env);
        client.swap(&trader, &TokenType::Yes, &10_000_000, &0);
    }

    #[test]
    #[should_panic]
    fn test_zero_amount_swap_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let provider = Address::generate(&env);
        client.add_liquidity(&provider, &2_000_000_000);

        let trader = Address::generate(&env);
        client.swap(&trader, &TokenType::Yes, &0, &0);
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
    #[should_panic]
    fn test_large_swap_against_shallow_pool_fails_on_slippage() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let provider = Address::generate(&env);
        client.add_liquidity(&provider, &100_000);

        let trader = Address::generate(&env);
        client.swap(&trader, &TokenType::Yes, &50_000, &0);
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

    #[test]
    fn test_stress_rapid_swaps_maintain_pool_invariants() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup(&env, 30);

        let provider = Address::generate(&env);
        client.add_liquidity(&provider, &10_000_000_000);

        let trader = Address::generate(&env);
        let initial_k = client.get_yes_reserve_pub() * client.get_no_reserve_pub();

        for i in 0..25 {
            let token = if i % 2 == 0 {
                TokenType::Yes
            } else {
                TokenType::No
            };
            let amount_in = 100_000 + (i as i128 * 10_000);
            let out = client.swap(&trader, &token, &amount_in, &0);
            assert!(out > 0);

            let yes = client.get_yes_reserve_pub();
            let no = client.get_no_reserve_pub();
            assert!(yes > 0);
            assert!(no > 0);
            assert!(yes * no <= initial_k);
        }
    }
}

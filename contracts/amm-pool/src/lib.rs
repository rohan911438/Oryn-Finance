#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Map, Symbol, Bytes
};

use oryn_shared::{
    TokenType, PoolInfo, OrynError, LiquidityEvent, SwapEvent, 
    ContractUpgradedEvent, PRECISION, MAX_FEE_RATE
};

// Contract metadata
contractmeta!(
    key = "Description",
    val = "Oryn Finance AMM Pool - Automated Market Maker for prediction tokens"
);

/// Storage keys for the AMM pool contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Pool configuration and metadata
    PoolInfo,
    /// YES token reserve
    YesReserve,
    /// NO token reserve  
    NoReserve,
    /// K constant (YES_reserve * NO_reserve)
    KConstant,
    /// Total LP tokens issued
    TotalLpTokens,
    /// LP token balance for each user: Address -> i128
    LpBalance(Address),
    /// Factory contract address
    Factory,
    /// Market contract address
    Market,
    /// Admin address
    Admin,
    /// Fee rate in basis points (30 = 0.3%)
    FeeRate,
    /// Total fees collected
    TotalFeesCollected,
    /// LP token contract address
    LpToken,
    /// Protocol treasury address
    Treasury,
    /// Paused state
    Paused,
    /// Initialization flag
    Initialized,
    /// Re-entrancy guard
    ReentrancyGuard,
}

/// Liquidity provider information
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityProvider {
    pub address: Address,
    pub lp_tokens: i128,
    pub yes_contributed: i128,
    pub no_contributed: i128,
    pub fees_earned: i128,
    pub joined_at: u64,
}

/// Pool statistics  
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolStats {
    pub total_liquidity_usdc: i128,
    pub total_volume: i128,
    pub total_fees: i128,
    pub current_price: i128,
    pub price_24h_change: i128,
    pub total_lp_tokens: i128,
    pub number_of_lps: u32,
}

/// Swap calculation result
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapResult {
    pub amount_out: i128,
    pub price_impact: i128, // In basis points
    pub fee: i128,
    pub new_yes_reserve: i128,
    pub new_no_reserve: i128,
}

#[contract]
pub struct AmmPoolContract;

#[contractimpl]
impl AmmPoolContract {
    /// Initialize the AMM pool
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
    ) -> Result<(), OrynError> {
        // Ensure contract hasn't been initialized
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput);
        }

        factory.require_auth();

        // Validate fee rate
        if fee_rate > MAX_FEE_RATE {
            return Err(OrynError::InvalidFeeRate);
        }

        // Initialize pool info
        let pool_info = PoolInfo {
            pool_id,
            market_address: market.clone(),
            yes_token: yes_token.clone(),
            no_token: no_token.clone(),
            yes_reserve: 0,
            no_reserve: 0,
            k_constant: 0,
            total_liquidity: 0,
            fee_rate,
            total_fees_collected: 0,
        };

        // Store configuration
        env.storage().persistent().set(&StorageKey::PoolInfo, &pool_info);
        env.storage().persistent().set(&StorageKey::Factory, &factory);
        env.storage().persistent().set(&StorageKey::Market, &market);
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::LpToken, &lp_token);
        env.storage().persistent().set(&StorageKey::Treasury, &treasury);
        env.storage().persistent().set(&StorageKey::FeeRate, &fee_rate);
        env.storage().persistent().set(&StorageKey::YesReserve, &0i128);
        env.storage().persistent().set(&StorageKey::NoReserve, &0i128);
        env.storage().persistent().set(&StorageKey::KConstant, &0i128);
        env.storage().persistent().set(&StorageKey::TotalLpTokens, &0i128);
        env.storage().persistent().set(&StorageKey::TotalFeesCollected, &0i128);
        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::Initialized, &true);
        env.storage().persistent().set(&StorageKey::ReentrancyGuard, &false);

        Ok(())
    }

    /// Add liquidity to the pool
    /// Returns amount of LP tokens minted
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        usdc_amount: i128,
    ) -> Result<i128, OrynError> {
        Self::require_not_paused(&env)?;
        Self::require_no_reentrancy(&env)?;
        Self::set_reentrancy_guard(&env, true)?;

        provider.require_auth();

        if usdc_amount <= 0 {
            Self::set_reentrancy_guard(&env, false)?;
            return Err(OrynError::InvalidInput);
        }

        let yes_reserve = Self::get_yes_reserve(&env);
        let no_reserve = Self::get_no_reserve(&env);
        let total_lp_tokens = Self::get_total_lp_tokens(&env);

        let (yes_amount, no_amount, lp_tokens_to_mint) = if total_lp_tokens == 0 {
            // First liquidity provision - split USDC equally
            let yes_amount = usdc_amount / 2;
            let no_amount = usdc_amount / 2;
            let lp_tokens = usdc_amount; // 1:1 ratio for initial liquidity
            (yes_amount, no_amount, lp_tokens)
        } else {
            // Subsequent liquidity - maintain proportion
            let yes_amount = usdc_amount * yes_reserve / (yes_reserve + no_reserve);
            let no_amount = usdc_amount - yes_amount;
            let lp_tokens = usdc_amount * total_lp_tokens / (yes_reserve + no_reserve);
            (yes_amount, no_amount, lp_tokens)
        };

        // Transfer USDC from provider
        Self::transfer_usdc_from_user(&env, &provider, usdc_amount)?;

        // Mint YES and NO tokens to the pool
        Self::mint_yes_tokens(&env, yes_amount)?;
        Self::mint_no_tokens(&env, no_amount)?;

        // Update reserves
        let new_yes_reserve = yes_reserve + yes_amount;
        let new_no_reserve = no_reserve + no_amount;
        Self::set_reserves(&env, new_yes_reserve, new_no_reserve)?;

        // Update K constant
        let new_k = new_yes_reserve * new_no_reserve;
        env.storage().persistent().set(&StorageKey::KConstant, &new_k);

        // Mint LP tokens to provider
        Self::mint_lp_tokens(&env, &provider, lp_tokens_to_mint)?;

        // Update total LP tokens
        env.storage().persistent().set(&StorageKey::TotalLpTokens, &(total_lp_tokens + lp_tokens_to_mint));

        // Emit liquidity event
        env.events().publish((
            symbol_short!("liquidity"),
            symbol_short!("added"),
        ), LiquidityEvent {
            provider: provider.clone(),
            pool_id: Self::get_pool_info(&env).pool_id,
            amount: usdc_amount,
            yes_tokens: yes_amount,
            no_tokens: no_amount,
            lp_tokens: lp_tokens_to_mint,
            timestamp: env.ledger().timestamp(),
        });

        Self::set_reentrancy_guard(&env, false)?;
        Ok(lp_tokens_to_mint)
    }

    /// Remove liquidity from the pool
    /// Returns (yes_tokens, no_tokens) received
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        lp_token_amount: i128,
    ) -> Result<(i128, i128), OrynError> {
        Self::require_not_paused(&env)?;
        Self::require_no_reentrancy(&env)?;
        Self::set_reentrancy_guard(&env, true)?;

        provider.require_auth();

        if lp_token_amount <= 0 {
            Self::set_reentrancy_guard(&env, false)?;
            return Err(OrynError::InvalidInput);
        }

        let provider_lp_balance = Self::get_lp_balance(&env, &provider);
        if provider_lp_balance < lp_token_amount {
            Self::set_reentrancy_guard(&env, false)?;
            return Err(OrynError::InsufficientBalance);
        }

        let yes_reserve = Self::get_yes_reserve(&env);
        let no_reserve = Self::get_no_reserve(&env);
        let total_lp_tokens = Self::get_total_lp_tokens(&env);

        if total_lp_tokens == 0 {
            Self::set_reentrancy_guard(&env, false)?;
            return Err(OrynError::NoLiquidity);
        }

        // Calculate proportional share
        let yes_share = yes_reserve * lp_token_amount / total_lp_tokens;
        let no_share = no_reserve * lp_token_amount / total_lp_tokens;

        // Burn LP tokens from provider
        Self::burn_lp_tokens(&env, &provider, lp_token_amount)?;

        // Update reserves
        let new_yes_reserve = yes_reserve - yes_share;
        let new_no_reserve = no_reserve - no_share;
        Self::set_reserves(&env, new_yes_reserve, new_no_reserve)?;

        // Update K constant
        let new_k = new_yes_reserve * new_no_reserve;
        env.storage().persistent().set(&StorageKey::KConstant, &new_k);

        // Transfer tokens to provider
        Self::transfer_yes_tokens(&env, &provider, yes_share)?;
        Self::transfer_no_tokens(&env, &provider, no_share)?;

        // Update total LP tokens
        env.storage().persistent().set(&StorageKey::TotalLpTokens, &(total_lp_tokens - lp_token_amount));

        // Emit liquidity event
        env.events().publish((
            symbol_short!("liquidity"),
            symbol_short!("removed"),
        ), LiquidityEvent {
            provider: provider.clone(),
            pool_id: Self::get_pool_info(&env).pool_id,
            amount: -(yes_share + no_share), // Negative to indicate removal
            yes_tokens: -yes_share,
            no_tokens: -no_share,
            lp_tokens: -lp_token_amount,
            timestamp: env.ledger().timestamp(),
        });

        Self::set_reentrancy_guard(&env, false)?;
        Ok((yes_share, no_share))
    }

    /// Swap tokens using constant product formula
    pub fn swap(
        env: Env,
        trader: Address,
        token_in: TokenType,
        amount_in: i128,
        min_amount_out: i128,
    ) -> Result<i128, OrynError> {
        Self::require_not_paused(&env)?;
        Self::require_no_reentrancy(&env)?;
        Self::set_reentrancy_guard(&env, true)?;

        trader.require_auth();

        if amount_in <= 0 {
            Self::set_reentrancy_guard(&env, false)?;
            return Err(OrynError::InvalidInput);
        }

        let swap_result = Self::calculate_swap_result(&env, &token_in, amount_in)?;

        if swap_result.amount_out < min_amount_out {
            Self::set_reentrancy_guard(&env, false)?;
            return Err(OrynError::SlippageExceeded);
        }

        // Execute the swap
        match token_in {
            TokenType::Yes => {
                // Transfer YES tokens from trader
                Self::transfer_yes_tokens_from_user(&env, &trader, amount_in)?;
                // Transfer NO tokens to trader
                Self::transfer_no_tokens(&env, &trader, swap_result.amount_out)?;
            },
            TokenType::No => {
                // Transfer NO tokens from trader  
                Self::transfer_no_tokens_from_user(&env, &trader, amount_in)?;
                // Transfer YES tokens to trader
                Self::transfer_yes_tokens(&env, &trader, swap_result.amount_out)?;
            }
        }

        // Update reserves
        Self::set_reserves(&env, swap_result.new_yes_reserve, swap_result.new_no_reserve)?;

        // Update K constant
        let new_k = swap_result.new_yes_reserve * swap_result.new_no_reserve;
        env.storage().persistent().set(&StorageKey::KConstant, &new_k);

        // Collect fees
        Self::collect_fees(&env, swap_result.fee)?;

        // Calculate current price after swap
        let current_price = Self::calculate_price(&env);

        // Emit swap event
        env.events().publish((
            symbol_short!("swap"),
            symbol_short!("executed"),
        ), SwapEvent {
            trader: trader.clone(),
            pool_id: Self::get_pool_info(&env).pool_id,
            token_in: token_in.clone(),
            token_out: match token_in {
                TokenType::Yes => TokenType::No,
                TokenType::No => TokenType::Yes,
            },
            amount_in,
            amount_out: swap_result.amount_out,
            price: current_price,
            fee: swap_result.fee,
            timestamp: env.ledger().timestamp(),
        });

        Self::set_reentrancy_guard(&env, false)?;
        Ok(swap_result.amount_out)
    }

    /// Calculate swap result without executing
    pub fn calculate_swap_result(
        env: &Env,
        token_in: &TokenType,
        amount_in: i128,
    ) -> Result<SwapResult, OrynError> {
        let yes_reserve = Self::get_yes_reserve(env);
        let no_reserve = Self::get_no_reserve(env);
        let fee_rate = Self::get_fee_rate(env);

        if yes_reserve == 0 || no_reserve == 0 {
            return Err(OrynError::InsufficientReserves);
        }

        // Apply fee (subtract fee from input amount)
        let fee = amount_in * fee_rate as i128 / 10000;
        let amount_in_after_fee = amount_in - fee;

        let (reserve_in, reserve_out) = match token_in {
            TokenType::Yes => (yes_reserve, no_reserve),
            TokenType::No => (no_reserve, yes_reserve),
        };

        // Constant product formula: k = reserve_in * reserve_out
        // amount_out = reserve_out - (k / (reserve_in + amount_in_after_fee))
        let k = reserve_in * reserve_out;
        let new_reserve_in = reserve_in + amount_in_after_fee;
        let new_reserve_out = k / new_reserve_in;
        let amount_out = reserve_out - new_reserve_out;

        // Calculate price impact
        let old_price = reserve_out * PRECISION / reserve_in;
        let new_price = new_reserve_out * PRECISION / new_reserve_in;
        let price_impact = ((old_price - new_price) * 10000 / old_price).abs();

        let (new_yes_reserve, new_no_reserve) = match token_in {
            TokenType::Yes => (new_reserve_in, new_reserve_out),
            TokenType::No => (new_reserve_out, new_reserve_in),
        };

        Ok(SwapResult {
            amount_out,
            price_impact,
            fee,
            new_yes_reserve,
            new_no_reserve,
        })
    }

    /// Get current price (YES tokens per NO token)
    pub fn get_price(env: Env) -> i128 {
        Self::calculate_price(&env)
    }

    /// Get current reserves
    pub fn get_reserves(env: Env) -> (i128, i128) {
        (Self::get_yes_reserve(&env), Self::get_no_reserve(&env))
    }

    /// Calculate price impact for a given trade
    pub fn price_impact_calculator(
        env: Env,
        token_in: TokenType,
        amount_in: i128,
    ) -> Result<(i128, i128), OrynError> {
        let swap_result = Self::calculate_swap_result(&env, &token_in, amount_in)?;
        Ok((swap_result.amount_out, swap_result.price_impact))
    }

    /// Get pool statistics
    pub fn get_pool_stats(env: Env) -> PoolStats {
        let yes_reserve = Self::get_yes_reserve(&env);
        let no_reserve = Self::get_no_reserve(&env);
        let total_lp_tokens = Self::get_total_lp_tokens(&env);
        let total_fees = Self::get_total_fees_collected(&env);

        PoolStats {
            total_liquidity_usdc: yes_reserve + no_reserve,
            total_volume: 0, // Would track this separately
            total_fees,
            current_price: Self::calculate_price(&env),
            price_24h_change: 0, // Would track this with historical data
            total_lp_tokens,
            number_of_lps: 0, // Would count unique LP addresses
        }
    }

    /// Get pool information
    pub fn get_pool_info(env: Env) -> PoolInfo {
        env.storage().persistent().get(&StorageKey::PoolInfo).unwrap()
    }

    /// Get LP token balance for user
    pub fn get_lp_balance(env: Env, user: Address) -> i128 {
        env.storage().persistent()
            .get(&StorageKey::LpBalance(user))
            .unwrap_or(0)
    }

    /// Emergency pause (admin only)
    pub fn emergency_pause(env: Env, admin: Address) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Paused, &true);
        Ok(())
    }

    /// Emergency unpause (admin only)
    pub fn emergency_unpause(env: Env, admin: Address) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Paused, &false);
        Ok(())
    }

    /// Update fee rate (admin only)
    pub fn update_fee_rate(env: Env, admin: Address, new_fee_rate: u32) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        if new_fee_rate > MAX_FEE_RATE {
            return Err(OrynError::InvalidFeeRate);
        }

        env.storage().persistent().set(&StorageKey::FeeRate, &new_fee_rate);
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

    fn require_not_paused(env: &Env) -> Result<(), OrynError> {
        let paused: bool = env.storage().persistent().get(&StorageKey::Paused).unwrap_or(false);
        if paused {
            return Err(OrynError::ContractPaused);
        }
        Ok(())
    }

    fn require_no_reentrancy(env: &Env) -> Result<(), OrynError> {
        let guard: bool = env.storage().persistent().get(&StorageKey::ReentrancyGuard).unwrap_or(false);
        if guard {
            return Err(OrynError::InvalidInput); // Reentrancy detected
        }
        Ok(())
    }

    fn set_reentrancy_guard(env: &Env, value: bool) -> Result<(), OrynError> {
        env.storage().persistent().set(&StorageKey::ReentrancyGuard, &value);
        Ok(())
    }

    fn get_yes_reserve(env: &Env) -> i128 {
        env.storage().persistent().get(&StorageKey::YesReserve).unwrap_or(0)
    }

    fn get_no_reserve(env: &Env) -> i128 {
        env.storage().persistent().get(&StorageKey::NoReserve).unwrap_or(0)
    }

    fn get_total_lp_tokens(env: &Env) -> i128 {
        env.storage().persistent().get(&StorageKey::TotalLpTokens).unwrap_or(0)
    }

    fn get_fee_rate(env: &Env) -> u32 {
        env.storage().persistent().get(&StorageKey::FeeRate).unwrap_or(30) // 0.3% default
    }

    fn get_total_fees_collected(env: &Env) -> i128 {
        env.storage().persistent().get(&StorageKey::TotalFeesCollected).unwrap_or(0)
    }

    fn set_reserves(env: &Env, yes_reserve: i128, no_reserve: i128) -> Result<(), OrynError> {
        env.storage().persistent().set(&StorageKey::YesReserve, &yes_reserve);
        env.storage().persistent().set(&StorageKey::NoReserve, &no_reserve);
        Ok(())
    }

    fn calculate_price(env: &Env) -> i128 {
        let yes_reserve = Self::get_yes_reserve(env);
        let no_reserve = Self::get_no_reserve(env);
        
        if no_reserve == 0 {
            return PRECISION; // 100% price if no NO tokens
        }
        
        yes_reserve * PRECISION / no_reserve
    }

    fn collect_fees(env: &Env, fee_amount: i128) -> Result<(), OrynError> {
        let mut total_fees = Self::get_total_fees_collected(env);
        total_fees += fee_amount;
        env.storage().persistent().set(&StorageKey::TotalFeesCollected, &total_fees);

        // Distribute fees (70% to LPs, 30% to treasury)
        let lp_fee_share = fee_amount * 70 / 100;
        let treasury_fee_share = fee_amount - lp_fee_share;

        // For LPs, we add to pool reserves proportionally
        // For treasury, we transfer to treasury contract
        Self::transfer_fees_to_treasury(env, treasury_fee_share)?;

        Ok(())
    }

    // Placeholder functions for token operations
    // In a real implementation, these would call actual token contracts
    
    fn transfer_usdc_from_user(env: &Env, user: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer USDC from user to pool contract
        Ok(())
    }

    fn mint_yes_tokens(env: &Env, amount: i128) -> Result<(), OrynError> {
        // Mint YES tokens to pool
        Ok(())
    }

    fn mint_no_tokens(env: &Env, amount: i128) -> Result<(), OrynError> {
        // Mint NO tokens to pool
        Ok(())
    }

    fn transfer_yes_tokens(env: &Env, to: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer YES tokens from pool to user
        Ok(())
    }

    fn transfer_no_tokens(env: &Env, to: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer NO tokens from pool to user
        Ok(())
    }

    fn transfer_yes_tokens_from_user(env: &Env, user: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer YES tokens from user to pool
        Ok(())
    }

    fn transfer_no_tokens_from_user(env: &Env, user: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer NO tokens from user to pool
        Ok(())
    }

    fn mint_lp_tokens(env: &Env, to: &Address, amount: i128) -> Result<(), OrynError> {
        // Mint LP tokens to user
        let mut balance = Self::get_lp_balance(env, to);
        balance += amount;
        env.storage().persistent().set(&StorageKey::LpBalance(to.clone()), &balance);
        Ok(())
    }

    fn burn_lp_tokens(env: &Env, from: &Address, amount: i128) -> Result<(), OrynError> {
        // Burn LP tokens from user
        let mut balance = Self::get_lp_balance(env, from);
        if balance < amount {
            return Err(OrynError::InsufficientBalance);
        }
        balance -= amount;
        env.storage().persistent().set(&StorageKey::LpBalance(from.clone()), &balance);
        Ok(())
    }

    fn transfer_fees_to_treasury(env: &Env, amount: i128) -> Result<(), OrynError> {
        // Transfer fees to treasury contract
        Ok(())
    }
}
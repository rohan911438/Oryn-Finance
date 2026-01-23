#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Map, Symbol, Bytes, token
};

use oryn_shared::{
    MarketInfo, MarketCategory, MarketStatus, TokenType, TradeType, OrderType,
    UserPosition, TradeInfo, OrynError, TradeExecutedEvent, MarketResolvedEvent,
    ContractUpgradedEvent, PRECISION
};

// Contract metadata
contractmeta!(
    key = "Description", 
    val = "Oryn Finance Prediction Market - Individual market trading and resolution"
);

/// Storage keys for the prediction market contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Market information and metadata
    MarketInfo,
    /// User positions mapping: Address -> UserPosition
    UserPosition(Address),
    /// Trade history
    TradeHistory,
    /// Open orders mapping: order_id -> Order
    OpenOrder(String),
    /// User's open orders: Address -> Vec<order_id>
    UserOrders(Address),
    /// Total volume traded
    TotalVolume,
    /// Market outcome (set when resolved)
    Outcome,
    /// Oracle address authorized to resolve
    Oracle,
    /// Admin address for emergency functions
    Admin,
    /// Paused state
    Paused,
    /// Factory contract address
    Factory,
    /// Pool contract address for pricing
    Pool,
    /// Settlement data for winners
    SettlementData,
    /// Claim tracking: Address -> bool (has claimed)
    HasClaimed(Address),
}

/// Order structure for limit orders
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub order_id: String,
    pub user: Address,
    pub token_type: TokenType,
    pub trade_type: TradeType,
    pub amount: i128,
    pub price: i128,
    pub filled: i128,
    pub timestamp: u64,
    pub expires_at: u64,
}

/// Settlement data after market resolution
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementInfo {
    pub winning_token: TokenType,
    pub total_winning_tokens: i128,
    pub total_settlement_pool: i128,
    pub settlement_rate: i128, // Rate per winning token
}

#[contract]
pub struct PredictionMarketContract;

#[contractimpl]
impl PredictionMarketContract {
    /// Initialize the prediction market contract
    pub fn initialize(
        env: Env,
        factory: Address,
        admin: Address,
        market_info: MarketInfo,
    ) -> Result<(), OrynError> {
        // Ensure not already initialized
        if env.storage().persistent().has(&StorageKey::MarketInfo) {
            return Err(OrynError::InvalidInput);
        }

        factory.require_auth();

        // Store market information
        env.storage().persistent().set(&StorageKey::MarketInfo, &market_info);
        env.storage().persistent().set(&StorageKey::Factory, &factory);
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::Oracle, &market_info.oracle_address);
        env.storage().persistent().set(&StorageKey::Pool, &market_info.pool_address);
        env.storage().persistent().set(&StorageKey::TotalVolume, &0i128);
        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::TradeHistory, &Vec::<TradeInfo>::new(&env));

        Ok(())
    }

    /// Place an order (market or limit order)
    pub fn place_order(
        env: Env,
        user: Address,
        token_type: TokenType,
        trade_type: TradeType,
        order_type: OrderType,
        amount: i128,
        max_price: Option<i128>, // For buy orders / min_price for sell orders
        max_slippage: Option<i128>, // In basis points (100 = 1%)
    ) -> Result<String, OrynError> {
        user.require_auth();

        // Validate market is active and can trade
        Self::require_market_active(&env)?;
        Self::require_not_paused(&env)?;

        // Validate inputs
        if amount <= 0 {
            return Err(OrynError::InvalidTradeAmount);
        }

        let market_info: MarketInfo = Self::get_market_info(&env)?;
        let current_time = env.ledger().timestamp();

        // Check market hasn't expired
        if current_time >= market_info.expires_at {
            return Err(OrynError::MarketExpired);
        }

        let trade_id = format!("trade_{}_{}", current_time, amount);
        let trade_id_string = String::from_str(&env, &trade_id);

        match order_type {
            OrderType::Market => {
                Self::execute_market_order(
                    &env,
                    &user,
                    token_type,
                    trade_type,
                    amount,
                    max_slippage.unwrap_or(500), // 5% default slippage
                )?;
            },
            OrderType::Limit => {
                let price = max_price.ok_or(OrynError::InvalidPrice)?;
                Self::create_limit_order(
                    &env,
                    &user,
                    token_type,
                    trade_type,
                    amount,
                    price,
                    current_time,
                )?;
            }
        }

        Ok(trade_id_string)
    }

    /// Execute a market order immediately
    fn execute_market_order(
        env: &Env,
        user: &Address,
        token_type: TokenType,
        trade_type: TradeType,
        amount: i128,
        max_slippage_bp: i128,
    ) -> Result<(), OrynError> {
        // Get current price from AMM pool
        let pool_address: Address = env.storage().persistent().get(&StorageKey::Pool).unwrap();
        
        // Call pool contract to get current price
        let current_price = Self::get_token_price(env, &pool_address, &token_type)?;
        
        let (total_cost, tokens_received) = match trade_type {
            TradeType::Buy => {
                // Calculate cost and slippage
                let expected_cost = amount * current_price / PRECISION;
                let max_cost = expected_cost * (10000 + max_slippage_bp) / 10000;
                
                // Transfer USDC from user
                let usdc_token = Self::get_usdc_token(env)?;
                Self::transfer_from_user(env, user, &usdc_token, max_cost)?;
                
                // Execute buy through AMM pool
                let actual_tokens = Self::buy_tokens_from_pool(
                    env,
                    &pool_address,
                    &token_type,
                    amount,
                    max_cost,
                )?;
                
                // Mint prediction tokens to user
                let token_address = Self::get_token_address(env, &token_type)?;
                Self::mint_tokens(env, &token_address, user, actual_tokens)?;
                
                (max_cost, actual_tokens)
            },
            TradeType::Sell => {
                // Verify user has tokens to sell
                let token_address = Self::get_token_address(env, &token_type)?;
                let user_balance = Self::get_token_balance(env, &token_address, user)?;
                
                if user_balance < amount {
                    return Err(OrynError::InsufficientBalance);
                }
                
                // Burn user's prediction tokens
                Self::burn_tokens(env, &token_address, user, amount)?;
                
                // Execute sell through AMM pool
                let usdc_received = Self::sell_tokens_to_pool(
                    env,
                    &pool_address,
                    &token_type,
                    amount,
                )?;
                
                // Apply slippage check
                let expected_value = amount * current_price / PRECISION;
                let min_value = expected_value * (10000 - max_slippage_bp) / 10000;
                
                if usdc_received < min_value {
                    return Err(OrynError::SlippageExceeded);
                }
                
                // Transfer USDC to user
                let usdc_token = Self::get_usdc_token(env)?;
                Self::transfer_to_user(env, &usdc_token, user, usdc_received)?;
                
                (usdc_received, amount)
            }
        };

        // Update user position
        Self::update_user_position(env, user, &token_type, &trade_type, tokens_received, total_cost)?;

        // Update total volume
        let mut total_volume: i128 = env.storage().persistent().get(&StorageKey::TotalVolume).unwrap_or(0);
        total_volume += total_cost;
        env.storage().persistent().set(&StorageKey::TotalVolume, &total_volume);

        // Record trade in history
        Self::record_trade(env, user, &token_type, &trade_type, tokens_received, current_price, total_cost)?;

        // Emit trade event
        env.events().publish((
            symbol_short!("trade"),
            symbol_short!("executed"),
        ), TradeExecutedEvent {
            trader: user.clone(),
            market_id: Self::get_market_info(env)?.market_id,
            token_type,
            trade_type,
            amount: tokens_received,
            price: current_price,
            total_cost,
            timestamp: env.ledger().timestamp(),
        });

        Ok(())
    }

    /// Create a limit order
    fn create_limit_order(
        env: &Env,
        user: &Address,
        token_type: TokenType,
        trade_type: TradeType,
        amount: i128,
        price: i128,
        current_time: u64,
    ) -> Result<(), OrynError> {
        let order_id = format!("order_{}_{}_{}", current_time, user.to_string(), amount);
        let order_id_string = String::from_str(env, &order_id);

        let order = Order {
            order_id: order_id_string.clone(),
            user: user.clone(),
            token_type,
            trade_type,
            amount,
            price,
            filled: 0,
            timestamp: current_time,
            expires_at: current_time + 24 * 60 * 60, // 24 hours default
        };

        // Store order
        env.storage().persistent().set(&StorageKey::OpenOrder(order_id_string.clone()), &order);

        // Add to user's orders
        let user_orders_key = StorageKey::UserOrders(user.clone());
        let mut user_orders: Vec<String> = env.storage().persistent()
            .get(&user_orders_key)
            .unwrap_or(Vec::new(env));
        user_orders.push_back(order_id_string);
        env.storage().persistent().set(&user_orders_key, &user_orders);

        Ok(())
    }

    /// Cancel an open order
    pub fn cancel_order(env: Env, user: Address, order_id: String) -> Result<(), OrynError> {
        user.require_auth();

        let order: Order = env.storage().persistent()
            .get(&StorageKey::OpenOrder(order_id.clone()))
            .ok_or(OrynError::OrderNotFound)?;

        // Verify user owns this order
        if order.user != user {
            return Err(OrynError::Unauthorized);
        }

        // Remove order from storage
        env.storage().persistent().remove(&StorageKey::OpenOrder(order_id.clone()));

        // Remove from user's orders list
        let user_orders_key = StorageKey::UserOrders(user);
        let mut user_orders: Vec<String> = env.storage().persistent()
            .get(&user_orders_key)
            .unwrap_or(Vec::new(&env));
        
        user_orders.retain(|id| id != &order_id);
        env.storage().persistent().set(&user_orders_key, &user_orders);

        Ok(())
    }

    /// Get market information
    pub fn get_market_info(env: Env) -> Result<MarketInfo, OrynError> {
        env.storage().persistent()
            .get(&StorageKey::MarketInfo)
            .ok_or(OrynError::MarketNotFound)
    }

    /// Get user position in the market
    pub fn get_user_position(env: Env, user: Address) -> UserPosition {
        env.storage().persistent()
            .get(&StorageKey::UserPosition(user.clone()))
            .unwrap_or(UserPosition {
                user: user.clone(),
                market_id: Self::get_market_info(env).unwrap().market_id,
                yes_tokens: 0,
                no_tokens: 0,
                total_invested: 0,
                average_yes_price: 0,
                average_no_price: 0,
                realized_pnl: 0,
                unrealized_pnl: 0,
            })
    }

    /// Get user's open orders
    pub fn get_user_orders(env: Env, user: Address) -> Vec<Order> {
        let user_orders: Vec<String> = env.storage().persistent()
            .get(&StorageKey::UserOrders(user))
            .unwrap_or(Vec::new(&env));

        let mut orders = Vec::new(&env);
        for order_id in user_orders.iter() {
            if let Some(order) = env.storage().persistent()
                .get::<StorageKey, Order>(&StorageKey::OpenOrder(order_id.unwrap())) {
                orders.push_back(order);
            }
        }
        orders
    }

    /// Resolve market (only oracle can call)
    pub fn resolve_market(
        env: Env,
        oracle: Address,
        final_outcome: bool,
        proof_data: Bytes,
    ) -> Result<(), OrynError> {
        oracle.require_auth();

        // Verify caller is authorized oracle
        let authorized_oracle: Address = env.storage().persistent()
            .get(&StorageKey::Oracle)
            .unwrap();
        if oracle != authorized_oracle {
            return Err(OrynError::Unauthorized);
        }

        let mut market_info: MarketInfo = Self::get_market_info(&env)?;

        // Verify market can be resolved
        if market_info.status != MarketStatus::Active {
            return Err(OrynError::InvalidInput);
        }

        let current_time = env.ledger().timestamp();
        if current_time < market_info.expires_at {
            return Err(OrynError::MarketNotExpired);
        }

        // Update market status and outcome
        market_info.status = MarketStatus::Resolved;
        market_info.outcome = Some(final_outcome);
        env.storage().persistent().set(&StorageKey::MarketInfo, &market_info);
        env.storage().persistent().set(&StorageKey::Outcome, &final_outcome);

        // Calculate settlement data
        Self::calculate_settlement(&env, final_outcome)?;

        // Cancel all open orders
        Self::cancel_all_open_orders(&env)?;

        // Emit resolution event
        env.events().publish((
            symbol_short!("market"),
            symbol_short!("resolved"),
        ), MarketResolvedEvent {
            market_id: market_info.market_id,
            outcome: final_outcome,
            oracle,
            timestamp: current_time,
            total_volume: env.storage().persistent().get(&StorageKey::TotalVolume).unwrap_or(0),
        });

        Ok(())
    }

    /// Claim winnings after market resolution
    pub fn claim_winnings(env: Env, user: Address) -> Result<i128, OrynError> {
        user.require_auth();

        let market_info: MarketInfo = Self::get_market_info(&env)?;

        // Verify market is resolved
        if market_info.status != MarketStatus::Resolved {
            return Err(OrynError::MarketNotResolved);
        }

        // Verify user hasn't already claimed
        if env.storage().persistent().has(&StorageKey::HasClaimed(user.clone())) {
            return Err(OrynError::AlreadyClaimed);
        }

        let user_position = Self::get_user_position(env.clone(), user.clone());
        let outcome = market_info.outcome.unwrap();
        
        let winning_tokens = match outcome {
            true => user_position.yes_tokens,
            false => user_position.no_tokens,
        };

        if winning_tokens <= 0 {
            return Err(OrynError::NoWinningsAvailable);
        }

        let settlement_info: SettlementInfo = env.storage().persistent()
            .get(&StorageKey::SettlementData)
            .unwrap();

        let payout = winning_tokens * settlement_info.settlement_rate / PRECISION;

        if payout > 0 {
            // Transfer payout to user
            let usdc_token = Self::get_usdc_token(&env)?;
            Self::transfer_to_user(&env, &usdc_token, &user, payout)?;

            // Mark user as claimed
            env.storage().persistent().set(&StorageKey::HasClaimed(user), &true);
        }

        Ok(payout)
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

    /// Get trade history for the market
    pub fn get_trade_history(env: Env, offset: u64, limit: u64) -> Vec<TradeInfo> {
        let all_trades: Vec<TradeInfo> = env.storage().persistent()
            .get(&StorageKey::TradeHistory)
            .unwrap_or(Vec::new(&env));

        let mut result = Vec::new(&env);
        let start = offset as usize;
        let end = ((offset + limit) as usize).min(all_trades.len());

        for i in start..end {
            if let Some(trade) = all_trades.get(i as u32) {
                result.push_back(trade.unwrap());
            }
        }

        result
    }

    // Internal helper functions

    fn require_admin(env: &Env, caller: &Address) -> Result<(), OrynError> {
        let admin: Address = env.storage().persistent().get(&StorageKey::Admin).unwrap();
        if *caller != admin {
            return Err(OrynError::Unauthorized);
        }
        Ok(())
    }

    fn require_market_active(env: &Env) -> Result<(), OrynError> {
        let market_info: MarketInfo = Self::get_market_info(env)?;
        if market_info.status != MarketStatus::Active {
            return Err(OrynError::MarketNotActive);
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

    fn update_user_position(
        env: &Env,
        user: &Address,
        token_type: &TokenType,
        trade_type: &TradeType,
        amount: i128,
        cost: i128,
    ) -> Result<(), OrynError> {
        let mut position = Self::get_user_position(env.clone(), user.clone());

        match (token_type, trade_type) {
            (TokenType::Yes, TradeType::Buy) => {
                let old_total = position.yes_tokens * position.average_yes_price / PRECISION;
                position.yes_tokens += amount;
                position.average_yes_price = (old_total + cost) * PRECISION / position.yes_tokens;
                position.total_invested += cost;
            },
            (TokenType::No, TradeType::Buy) => {
                let old_total = position.no_tokens * position.average_no_price / PRECISION;
                position.no_tokens += amount;
                position.average_no_price = (old_total + cost) * PRECISION / position.no_tokens;
                position.total_invested += cost;
            },
            (TokenType::Yes, TradeType::Sell) => {
                position.yes_tokens -= amount;
                position.realized_pnl += cost - (amount * position.average_yes_price / PRECISION);
            },
            (TokenType::No, TradeType::Sell) => {
                position.no_tokens -= amount;
                position.realized_pnl += cost - (amount * position.average_no_price / PRECISION);
            }
        }

        env.storage().persistent().set(&StorageKey::UserPosition(user.clone()), &position);
        Ok(())
    }

    fn record_trade(
        env: &Env,
        trader: &Address,
        token_type: &TokenType,
        trade_type: &TradeType,
        amount: i128,
        price: i128,
        total_cost: i128,
    ) -> Result<(), OrynError> {
        let market_info = Self::get_market_info(env)?;
        
        let trade_info = TradeInfo {
            trader: trader.clone(),
            market_id: market_info.market_id,
            token_type: token_type.clone(),
            trade_type: trade_type.clone(),
            amount,
            price,
            timestamp: env.ledger().timestamp(),
            total_cost,
            fees: total_cost * 50 / 10000, // 0.5% fee
        };

        let mut trade_history: Vec<TradeInfo> = env.storage().persistent()
            .get(&StorageKey::TradeHistory)
            .unwrap_or(Vec::new(env));
        trade_history.push_back(trade_info);
        env.storage().persistent().set(&StorageKey::TradeHistory, &trade_history);

        Ok(())
    }

    fn calculate_settlement(env: &Env, outcome: bool) -> Result<(), OrynError> {
        let market_info = Self::get_market_info(env)?;
        
        // Get total supply of winning and losing tokens
        let winning_token = if outcome { TokenType::Yes } else { TokenType::No };
        let losing_token = if outcome { TokenType::No } else { TokenType::Yes };
        
        let winning_token_address = Self::get_token_address(env, &winning_token)?;
        let losing_token_address = Self::get_token_address(env, &losing_token)?;
        
        let total_winning_tokens = Self::get_total_supply(env, &winning_token_address)?;
        let total_losing_tokens = Self::get_total_supply(env, &losing_token_address)?;
        
        // Settlement pool is total liquidity minus winning token value
        let total_pool = market_info.total_liquidity;
        let settlement_pool = total_pool - total_winning_tokens + total_losing_tokens;
        
        let settlement_rate = if total_winning_tokens > 0 {
            settlement_pool * PRECISION / total_winning_tokens
        } else {
            0
        };

        let settlement_info = SettlementInfo {
            winning_token,
            total_winning_tokens,
            total_settlement_pool: settlement_pool,
            settlement_rate,
        };

        env.storage().persistent().set(&StorageKey::SettlementData, &settlement_info);
        Ok(())
    }

    fn cancel_all_open_orders(env: &Env) -> Result<(), OrynError> {
        // This would iterate through all open orders and cancel them
        // Implementation depends on how orders are stored
        Ok(())
    }

    // Placeholder functions for token operations
    // In a real implementation, these would call actual token contracts
    
    fn get_usdc_token(env: &Env) -> Result<Address, OrynError> {
        // Return USDC token contract address
        // This would be stored during initialization
        Ok(env.current_contract_address()) // Placeholder
    }

    fn get_token_address(env: &Env, token_type: &TokenType) -> Result<Address, OrynError> {
        let market_info = Self::get_market_info(env)?;
        Ok(match token_type {
            TokenType::Yes => market_info.yes_token_id,
            TokenType::No => market_info.no_token_id,
        })
    }

    fn get_token_price(env: &Env, pool: &Address, token_type: &TokenType) -> Result<i128, OrynError> {
        // Call AMM pool to get current price
        Ok(PRECISION / 2) // Placeholder: 50% price
    }

    fn get_token_balance(env: &Env, token: &Address, user: &Address) -> Result<i128, OrynError> {
        // Call token contract to get balance
        Ok(0) // Placeholder
    }

    fn get_total_supply(env: &Env, token: &Address) -> Result<i128, OrynError> {
        // Call token contract to get total supply
        Ok(0) // Placeholder
    }

    fn transfer_from_user(env: &Env, user: &Address, token: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer tokens from user to contract
        Ok(())
    }

    fn transfer_to_user(env: &Env, token: &Address, user: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer tokens from contract to user
        Ok(())
    }

    fn mint_tokens(env: &Env, token: &Address, to: &Address, amount: i128) -> Result<(), OrynError> {
        // Mint tokens to user
        Ok(())
    }

    fn burn_tokens(env: &Env, token: &Address, from: &Address, amount: i128) -> Result<(), OrynError> {
        // Burn tokens from user
        Ok(())
    }

    fn buy_tokens_from_pool(
        env: &Env,
        pool: &Address,
        token_type: &TokenType,
        amount: i128,
        max_cost: i128,
    ) -> Result<i128, OrynError> {
        // Execute buy order through AMM pool
        Ok(amount) // Placeholder
    }

    fn sell_tokens_to_pool(
        env: &Env,
        pool: &Address,
        token_type: &TokenType,
        amount: i128,
    ) -> Result<i128, OrynError> {
        // Execute sell order through AMM pool
        Ok(amount * PRECISION / 2) // Placeholder
    }
}
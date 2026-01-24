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

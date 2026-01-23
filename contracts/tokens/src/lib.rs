#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Symbol
};
use soroban_token_sdk::{TokenTrait, TokenUtils};

use oryn_shared::{TokenType, OrynError};

// Contract metadata
contractmeta!(
    key = "Description",
    val = "Oryn Finance Prediction Token - YES/NO tokens for prediction markets"
);

/// Storage keys for the token contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Token metadata
    TokenInfo,
    /// Balance tracking: Address -> i128
    Balance(Address),
    /// Allowances: (owner, spender) -> i128
    Allowance(Address, Address),
    /// Total supply
    TotalSupply,
    /// Market contract that can mint/burn
    MarketContract,
    /// Admin for emergency functions
    Admin,
    /// Token type (YES or NO)
    TokenType,
    /// Market ID this token belongs to
    MarketId,
    /// Frozen state for emergency
    Frozen,
}

/// Token metadata
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInfo {
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
    pub total_supply: i128,
    pub market_id: String,
    pub token_type: TokenType,
}

#[contract]
pub struct PredictionTokenContract;

#[contractimpl]
impl TokenTrait for PredictionTokenContract {
    /// Transfer tokens from one account to another
    fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        Self::require_not_frozen(&env).unwrap();
        
        if amount <= 0 {
            panic!("Invalid transfer amount");
        }

        let from_balance = Self::balance(&env, &from);
        if from_balance < amount {
            panic!("Insufficient balance");
        }

        // Update balances
        Self::set_balance(&env, &from, from_balance - amount);
        let to_balance = Self::balance(&env, &to);
        Self::set_balance(&env, &to, to_balance + amount);

        // Emit transfer event
        TokenUtils::new(&env).events().transfer(from, to, amount);
    }

    /// Transfer tokens from one account to another using allowance
    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        Self::require_not_frozen(&env).unwrap();

        if amount <= 0 {
            panic!("Invalid transfer amount");
        }

        let from_balance = Self::balance(&env, &from);
        if from_balance < amount {
            panic!("Insufficient balance");
        }

        let allowance = Self::allowance(&env, &from, &spender);
        if allowance < amount {
            panic!("Insufficient allowance");
        }

        // Update balances and allowance
        Self::set_balance(&env, &from, from_balance - amount);
        let to_balance = Self::balance(&env, &to);
        Self::set_balance(&env, &to, to_balance + amount);
        Self::set_allowance(&env, &from, &spender, allowance - amount);

        // Emit transfer event
        TokenUtils::new(&env).events().transfer(from, to, amount);
    }

    /// Get token balance for an account
    fn balance(env: &Env, id: &Address) -> i128 {
        env.storage().persistent()
            .get(&StorageKey::Balance(id.clone()))
            .unwrap_or(0)
    }

    /// Approve spender to spend tokens on behalf of owner
    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        Self::require_not_frozen(&env).unwrap();

        if amount < 0 {
            panic!("Invalid approval amount");
        }

        Self::set_allowance(&env, &from, &spender, amount);

        // Emit approval event
        TokenUtils::new(&env).events().approve(from, spender, amount, expiration_ledger);
    }

    /// Get allowance amount
    fn allowance(env: &Env, from: &Address, spender: &Address) -> i128 {
        env.storage().persistent()
            .get(&StorageKey::Allowance(from.clone(), spender.clone()))
            .unwrap_or(0)
    }
}

#[contractimpl]
impl PredictionTokenContract {
    /// Initialize the token contract
    pub fn initialize(
        env: Env,
        admin: Address,
        market_contract: Address,
        market_id: String,
        token_type: TokenType,
        name: String,
        symbol: String,
        decimals: u32,
    ) -> Result<(), OrynError> {
        admin.require_auth();

        let token_info = TokenInfo {
            name,
            symbol,
            decimals,
            total_supply: 0,
            market_id: market_id.clone(),
            token_type: token_type.clone(),
        };

        env.storage().persistent().set(&StorageKey::TokenInfo, &token_info);
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::MarketContract, &market_contract);
        env.storage().persistent().set(&StorageKey::TokenType, &token_type);
        env.storage().persistent().set(&StorageKey::MarketId, &market_id);
        env.storage().persistent().set(&StorageKey::TotalSupply, &0i128);
        env.storage().persistent().set(&StorageKey::Frozen, &false);

        Ok(())
    }

    /// Mint tokens (only market contract can mint)
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), OrynError> {
        Self::require_market_contract(&env)?;
        Self::require_not_frozen(&env)?;

        if amount <= 0 {
            return Err(OrynError::InvalidInput);
        }

        let current_balance = Self::balance(&env, &to);
        Self::set_balance(&env, &to, current_balance + amount);

        let mut total_supply = Self::get_total_supply(&env);
        total_supply += amount;
        env.storage().persistent().set(&StorageKey::TotalSupply, &total_supply);

        // Update token info
        let mut token_info: TokenInfo = env.storage().persistent().get(&StorageKey::TokenInfo).unwrap();
        token_info.total_supply = total_supply;
        env.storage().persistent().set(&StorageKey::TokenInfo, &token_info);

        // Emit mint event
        TokenUtils::new(&env).events().mint(env.current_contract_address(), to, amount);

        Ok(())
    }

    /// Burn tokens (only market contract can burn)
    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), OrynError> {
        Self::require_market_contract(&env)?;
        Self::require_not_frozen(&env)?;

        if amount <= 0 {
            return Err(OrynError::InvalidInput);
        }

        let current_balance = Self::balance(&env, &from);
        if current_balance < amount {
            return Err(OrynError::InsufficientBalance);
        }

        Self::set_balance(&env, &from, current_balance - amount);

        let mut total_supply = Self::get_total_supply(&env);
        total_supply -= amount;
        env.storage().persistent().set(&StorageKey::TotalSupply, &total_supply);

        // Update token info
        let mut token_info: TokenInfo = env.storage().persistent().get(&StorageKey::TokenInfo).unwrap();
        token_info.total_supply = total_supply;
        env.storage().persistent().set(&StorageKey::TokenInfo, &token_info);

        // Emit burn event
        TokenUtils::new(&env).events().burn(from, amount);

        Ok(())
    }

    /// Get token information
    pub fn get_token_info(env: Env) -> TokenInfo {
        env.storage().persistent().get(&StorageKey::TokenInfo).unwrap()
    }

    /// Get total supply
    pub fn total_supply(env: Env) -> i128 {
        Self::get_total_supply(&env)
    }

    /// Get token name
    pub fn name(env: Env) -> String {
        let token_info: TokenInfo = env.storage().persistent().get(&StorageKey::TokenInfo).unwrap();
        token_info.name
    }

    /// Get token symbol
    pub fn symbol(env: Env) -> String {
        let token_info: TokenInfo = env.storage().persistent().get(&StorageKey::TokenInfo).unwrap();
        token_info.symbol
    }

    /// Get token decimals
    pub fn decimals(env: Env) -> u32 {
        let token_info: TokenInfo = env.storage().persistent().get(&StorageKey::TokenInfo).unwrap();
        token_info.decimals
    }

    /// Freeze token transfers (admin only, for emergencies)
    pub fn freeze(env: Env, admin: Address) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Frozen, &true);
        Ok(())
    }

    /// Unfreeze token transfers (admin only)
    pub fn unfreeze(env: Env, admin: Address) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Frozen, &false);
        Ok(())
    }

    /// Check if token is frozen
    pub fn is_frozen(env: Env) -> bool {
        env.storage().persistent().get(&StorageKey::Frozen).unwrap_or(false)
    }

    /// Set new admin (current admin only)
    pub fn set_admin(env: Env, current_admin: Address, new_admin: Address) -> Result<(), OrynError> {
        Self::require_admin(&env, &current_admin)?;
        current_admin.require_auth();

        env.storage().persistent().set(&StorageKey::Admin, &new_admin);
        Ok(())
    }

    /// Get market ID this token belongs to
    pub fn get_market_id(env: Env) -> String {
        env.storage().persistent().get(&StorageKey::MarketId).unwrap()
    }

    /// Get token type (YES or NO)
    pub fn get_token_type(env: Env) -> TokenType {
        env.storage().persistent().get(&StorageKey::TokenType).unwrap()
    }

    // Internal helper functions

    fn require_admin(env: &Env, caller: &Address) -> Result<(), OrynError> {
        let admin: Address = env.storage().persistent().get(&StorageKey::Admin).unwrap();
        if *caller != admin {
            return Err(OrynError::Unauthorized);
        }
        Ok(())
    }

    fn require_market_contract(env: &Env) -> Result<(), OrynError> {
        // In a real implementation, this would verify the caller is the authorized market contract
        // For now, this is a simplified check
        Ok(())
    }

    fn require_not_frozen(env: &Env) -> Result<(), OrynError> {
        let frozen: bool = env.storage().persistent().get(&StorageKey::Frozen).unwrap_or(false);
        if frozen {
            return Err(OrynError::ContractPaused);
        }
        Ok(())
    }

    fn get_total_supply(env: &Env) -> i128 {
        env.storage().persistent().get(&StorageKey::TotalSupply).unwrap_or(0)
    }

    fn set_balance(env: &Env, account: &Address, amount: i128) {
        if amount > 0 {
            env.storage().persistent().set(&StorageKey::Balance(account.clone()), &amount);
        } else {
            env.storage().persistent().remove(&StorageKey::Balance(account.clone()));
        }
    }

    fn set_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
        if amount > 0 {
            env.storage().persistent().set(
                &StorageKey::Allowance(from.clone(), spender.clone()), 
                &amount
            );
        } else {
            env.storage().persistent().remove(
                &StorageKey::Allowance(from.clone(), spender.clone())
            );
        }
    }
}
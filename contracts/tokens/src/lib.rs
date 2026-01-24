#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype,
    panic_with_error,
    Address, Env, Vec, String,
};

use oryn_shared::OrynError;

contractmeta!(
    key = "Description",
    val = "Oryn Finance Treasury Contract"
);

/// ---------------- STORAGE ----------------

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    Balance(Address),
    Strategy(String),
    DistributionLog,
}

#[contracttype]
#[derive(Clone)]
pub struct StrategyInfo {
    pub active: bool,
    pub name: String,
}

#[contracttype]
#[derive(Clone)]
pub struct DistributionRecord {
    pub asset: Address,
    pub amount: i128,
    pub recipient: Address,
}

/// ---------------- CONTRACT ----------------

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {

    /// ---------- INIT ----------

    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().persistent().set(&StorageKey::Admin, &admin);
    }

    /// ---------- BALANCES ----------

    pub fn balance(env: Env, asset: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&StorageKey::Balance(asset))
            .unwrap_or(0)
    }

    fn set_balance(env: &Env, asset: Address, amount: i128) {
        if amount == 0 {
            env.storage().persistent().remove(&StorageKey::Balance(asset));
        } else {
            env.storage().persistent().set(&StorageKey::Balance(asset), &amount);
        }
    }

    /// ---------- STRATEGIES ----------

    pub fn register_strategy(env: Env, id: String, name: String) {
        Self::require_admin(&env);

        let info = StrategyInfo {
            active: true,
            name,
        };

        env.storage()
            .persistent()
            .set(&StorageKey::Strategy(id), &info);
    }

    pub fn strategy(env: Env, id: String) -> StrategyInfo {
        match env.storage().persistent().get(&StorageKey::Strategy(id)) {
            Some(info) => info,
            None => panic_with_error!(&env, OrynError::NotFound),
        }
    }

    /// ---------- DISTRIBUTION ----------

    pub fn distribute(
        env: Env,
        asset: Address,
        recipient: Address,
        amount: i128,
    ) {
        Self::require_admin(&env);

        let current = Self::balance(env.clone(), asset.clone());
        if current < amount {
            panic_with_error!(&env, OrynError::InsufficientBalance);
        }

        // Update balance
        Self::set_balance(&env, asset.clone(), current - amount);

        // Load history
        let mut log: Vec<DistributionRecord> = env
            .storage()
            .persistent()
            .get(&StorageKey::DistributionLog)
            .unwrap_or(Vec::new(&env));

        // Append record
        log.push_back(DistributionRecord {
            asset,
            amount,
            recipient,
        });

        // Save history
        env.storage()
            .persistent()
            .set(&StorageKey::DistributionLog, &log);
    }

    pub fn distribution_history(env: Env) -> Vec<DistributionRecord> {
        env.storage()
            .persistent()
            .get(&StorageKey::DistributionLog)
            .unwrap_or(Vec::new(&env))
    }

    /// ---------- INTERNAL ----------

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&StorageKey::Admin)
            .unwrap();

        admin.require_auth();
    }
}

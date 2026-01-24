#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, Error,
};

use oryn_shared::OrynError;

// --------------------------------------------------
// Metadata
// --------------------------------------------------

contractmeta!(
    key = "Description",
    val = "Oryn Reputation Contract"
);

// --------------------------------------------------
// Storage Keys
// --------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    Reputation(Address),
    Initialized,
}

// --------------------------------------------------
// Reputation Data
// --------------------------------------------------

#[contracttype]
#[derive(Clone, Default)]
pub struct ReputationScore {
    pub score: i128,
    pub updated_at: u64,
}

// --------------------------------------------------
// Contract
// --------------------------------------------------

#[contract]
pub struct Reputation;

// --------------------------------------------------
// Contract Implementation
// --------------------------------------------------

#[contractimpl]
impl Reputation {

    // -------------------------
    // Initialize
    // -------------------------
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput.into()); // ✅ FIX
        }

        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        Ok(())
    }

    // -------------------------
    // Update Reputation
    // -------------------------
    pub fn update_reputation(
        env: Env,
        admin: Address,
        user: Address,
        delta: i128,
    ) -> Result<(), Error> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        if delta == 0 {
            return Err(OrynError::InvalidInput.into());
        }

        let mut rep: ReputationScore = env
            .storage()
            .persistent()
            .get(&StorageKey::Reputation(user.clone()))
            .unwrap_or_default();

        rep.score += delta;
        rep.updated_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&StorageKey::Reputation(user.clone()), &rep);

        // ✅ FIXED: symbols <= 9 chars
        env.events().publish(
            (symbol_short!("rep"), symbol_short!("upd")),
            (user, rep.score),
        );

        Ok(())
    }

    // -------------------------
    // Read Reputation
    // -------------------------
    pub fn get_reputation(env: Env, user: Address) -> Result<ReputationScore, Error> {
        Ok(env
            .storage()
            .persistent()
            .get(&StorageKey::Reputation(user))
            .unwrap_or_default())
    }

    // -------------------------
    // Internal Admin Check
    // -------------------------
    fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&StorageKey::Admin)
            .ok_or(OrynError::Unauthorized)?; // ✅ FIX

        if caller != &admin {
            return Err(OrynError::Unauthorized.into());
        }

        Ok(())
    }
}

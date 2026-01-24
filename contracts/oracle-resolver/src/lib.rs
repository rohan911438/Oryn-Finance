#![no_std]
#![allow(unexpected_cfgs)]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, Vec, Map, Bytes, Error,
};

use oryn_shared::{
    OrynError,
    ResolutionSubmittedEvent,
    ResolutionFinalizedEvent,
    DISPUTE_PERIOD,
};

contractmeta!(
    key = "Description",
    val = "Oryn Oracle Resolver"
);

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    Oracle(Address),
    AllOracles,
    Market(Address),
    Threshold,
    Paused,
    Init,
}

#[contracttype]
#[derive(Clone)]
pub struct OracleInfo {
    pub addr: Address,
    pub reputation: i128,
    pub active: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct MarketResolution {
    pub market: Address,
    pub votes: Map<bool, u32>,
    pub outcome: Option<bool>,
    pub deadline: Option<u64>,
    pub oracles: Vec<Address>,
}

#[contract]
pub struct OracleResolver;

#[contractimpl]
impl OracleResolver {

    pub fn initialize(env: Env, admin: Address, threshold: u32) -> Result<(), Error> {
        if env.storage().persistent().has(&StorageKey::Init) {
            return Err(Error::from(OrynError::InvalidInput));
        }

        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::Threshold, &threshold);
        env.storage().persistent().set(&StorageKey::AllOracles, &Vec::<Address>::new(&env));
        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::Init, &true);

        Ok(())
    }

    pub fn register_oracle(
        env: Env,
        admin: Address,
        oracle: Address,
        reputation: i128,
    ) -> Result<(), Error> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        let info = OracleInfo {
            addr: oracle.clone(),
            reputation,
            active: true,
        };

        env.storage().persistent().set(&StorageKey::Oracle(oracle.clone()), &info);

        let mut list: Vec<Address> =
            env.storage().persistent().get(&StorageKey::AllOracles).unwrap();

        list.push_back(oracle);
        env.storage().persistent().set(&StorageKey::AllOracles, &list);

        Ok(())
    }

    pub fn submit_resolution(
        env: Env,
        oracle: Address,
        market: Address,
        outcome: bool,
        _proof: Bytes,
    ) -> Result<(), Error> {
        oracle.require_auth();

        let mut res = env.storage().persistent()
            .get(&StorageKey::Market(market.clone()))
            .unwrap_or(MarketResolution {
                market: market.clone(),
                votes: Map::new(&env),
                outcome: None,
                deadline: None,
                oracles: Vec::new(&env),
            });

        let count = res.votes.get(outcome).unwrap_or(0) + 1;
        res.votes.set(outcome, count);
        res.oracles.push_back(oracle.clone());

        let threshold: u32 = env.storage().persistent()
            .get(&StorageKey::Threshold)
            .unwrap();

        if count >= threshold {
            res.outcome = Some(outcome);
            res.deadline = Some(env.ledger().timestamp() + DISPUTE_PERIOD);
        }

        env.storage().persistent().set(&StorageKey::Market(market.clone()), &res);

        env.events().publish(
            (symbol_short!("resolve"), symbol_short!("submit")),
            ResolutionSubmittedEvent {
                oracle,
                market_address: market,
                outcome,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    pub fn finalize(env: Env, market: Address) -> Result<(), Error> {
        let res: MarketResolution = env.storage().persistent()
            .get(&StorageKey::Market(market.clone()))
            .ok_or(Error::from(OrynError::ResolutionNotFound))?;

        if env.ledger().timestamp() <= res.deadline.unwrap_or(0) {
            return Err(Error::from(OrynError::DisputePeriodActive));
        }

        let outcome = res
            .outcome
            .ok_or(Error::from(OrynError::InvalidInput))?;

        env.events().publish(
            (symbol_short!("resolve"), symbol_short!("final")),
            ResolutionFinalizedEvent {
                market_address: market,
                final_outcome: outcome,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let admin: Address = env.storage().persistent()
            .get(&StorageKey::Admin)
            .unwrap();

        if *caller != admin {
            return Err(Error::from(OrynError::Unauthorized));
        }
        Ok(())
    }
}

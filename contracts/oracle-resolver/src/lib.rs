#![no_std]
#![allow(unexpected_cfgs)]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short, Address, Bytes, Env, Error,
    Map, Vec,
};

use oryn_shared::{OrynError, ResolutionFinalizedEvent, ResolutionSubmittedEvent, DISPUTE_PERIOD};

contractmeta!(key = "Description", val = "Oryn Oracle Resolver");

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

        if threshold == 0 {
            return Err(Error::from(OrynError::InvalidInput));
        }

        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage()
            .persistent()
            .set(&StorageKey::Threshold, &threshold);
        env.storage()
            .persistent()
            .set(&StorageKey::AllOracles, &Vec::<Address>::new(&env));
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

        env.storage()
            .persistent()
            .set(&StorageKey::Oracle(oracle.clone()), &info);

        let mut list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&StorageKey::AllOracles)
            .unwrap();

        list.push_back(oracle);
        env.storage()
            .persistent()
            .set(&StorageKey::AllOracles, &list);

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

        let oracle_info: OracleInfo = env
            .storage()
            .persistent()
            .get(&StorageKey::Oracle(oracle.clone()))
            .ok_or(Error::from(OrynError::OracleNotRegistered))?;

        if !oracle_info.active {
            return Err(Error::from(OrynError::OracleNotRegistered));
        }

        let mut res = env
            .storage()
            .persistent()
            .get(&StorageKey::Market(market.clone()))
            .unwrap_or(MarketResolution {
                market: market.clone(),
                votes: Map::new(&env),
                outcome: None,
                deadline: None,
                oracles: Vec::new(&env),
            });

        if res.oracles.contains(&oracle) {
            return Err(Error::from(OrynError::InvalidInput));
        }

        let count = res.votes.get(outcome).unwrap_or(0) + 1;
        res.votes.set(outcome, count);
        res.oracles.push_back(oracle.clone());

        let threshold: u32 = env
            .storage()
            .persistent()
            .get(&StorageKey::Threshold)
            .unwrap();

        if count >= threshold {
            res.outcome = Some(outcome);
            res.deadline = Some(env.ledger().timestamp() + DISPUTE_PERIOD);
        }

        env.storage()
            .persistent()
            .set(&StorageKey::Market(market.clone()), &res);

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
        let res: MarketResolution = env
            .storage()
            .persistent()
            .get(&StorageKey::Market(market.clone()))
            .ok_or(Error::from(OrynError::ResolutionNotFound))?;

        if env.ledger().timestamp() <= res.deadline.unwrap_or(0) {
            return Err(Error::from(OrynError::DisputePeriodActive));
        }

        let outcome = res
            .outcome
            .ok_or(Error::from(OrynError::ConsensusNotReached))?;

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
        let admin: Address = env.storage().persistent().get(&StorageKey::Admin).unwrap();

        if *caller != admin {
            return Err(Error::from(OrynError::Unauthorized));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, Bytes, Env,
    };

    fn proof(env: &Env) -> Bytes {
        Bytes::from_slice(env, &[1, 2, 3, 4])
    }

    fn set_timestamp(env: &Env, timestamp: u64) {
        env.ledger().with_mut(|li| {
            li.timestamp = timestamp;
        });
    }

    fn setup(env: &Env, threshold: u32) -> (OracleResolverClient<'_>, Address, Address) {
        let admin = Address::generate(env);
        let contract_id = env.register_contract(None, OracleResolver);
        let client = OracleResolverClient::new(env, &contract_id);
        client.initialize(&admin, &threshold);
        (client, admin, contract_id)
    }

    #[test]
    fn test_registered_oracles_reach_threshold_and_finalize_after_dispute_period() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 10);

        let (client, admin, contract_id) = setup(&env, 2);
        let oracle_a = Address::generate(&env);
        let oracle_b = Address::generate(&env);
        let market = Address::generate(&env);
        let proof = proof(&env);

        client.register_oracle(&admin, &oracle_a, &120);
        client.register_oracle(&admin, &oracle_b, &95);

        client.submit_resolution(&oracle_a, &market, &true, &proof);

        let pending: MarketResolution = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get(&StorageKey::Market(market.clone()))
                .unwrap()
        });
        assert_eq!(pending.outcome, None);
        assert_eq!(pending.votes.get(true), Some(1));

        client.submit_resolution(&oracle_b, &market, &true, &proof);

        let resolved: MarketResolution = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get(&StorageKey::Market(market.clone()))
                .unwrap()
        });
        assert_eq!(resolved.outcome, Some(true));
        assert_eq!(resolved.votes.get(true), Some(2));
        assert_eq!(resolved.deadline, Some(10 + DISPUTE_PERIOD));

        set_timestamp(&env, 10 + DISPUTE_PERIOD + 1);
        client.finalize(&market);
    }

    #[test]
    #[should_panic]
    fn test_initialize_with_zero_threshold_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, OracleResolver);
        let client = OracleResolverClient::new(&env, &contract_id);
        client.initialize(&admin, &0);
    }

    #[test]
    #[should_panic]
    fn test_unregistered_oracle_cannot_submit_resolution() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _) = setup(&env, 2);
        let oracle = Address::generate(&env);
        let market = Address::generate(&env);

        client.submit_resolution(&oracle, &market, &true, &proof(&env));
    }

    #[test]
    #[should_panic]
    fn test_duplicate_oracle_submission_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, _) = setup(&env, 2);
        let oracle = Address::generate(&env);
        let market = Address::generate(&env);
        let proof = proof(&env);

        client.register_oracle(&admin, &oracle, &150);
        client.submit_resolution(&oracle, &market, &true, &proof);
        client.submit_resolution(&oracle, &market, &true, &proof);
    }

    #[test]
    #[should_panic]
    fn test_finalize_before_consensus_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 20);

        let (client, admin, _) = setup(&env, 2);
        let oracle = Address::generate(&env);
        let market = Address::generate(&env);

        client.register_oracle(&admin, &oracle, &100);
        client.submit_resolution(&oracle, &market, &true, &proof(&env));

        set_timestamp(&env, 20 + DISPUTE_PERIOD + 1);
        client.finalize(&market);
    }

    #[test]
    #[should_panic]
    fn test_finalize_before_dispute_period_fails() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 30);

        let (client, admin, _) = setup(&env, 2);
        let oracle_a = Address::generate(&env);
        let oracle_b = Address::generate(&env);
        let market = Address::generate(&env);
        let proof = proof(&env);

        client.register_oracle(&admin, &oracle_a, &110);
        client.register_oracle(&admin, &oracle_b, &105);
        client.submit_resolution(&oracle_a, &market, &false, &proof);
        client.submit_resolution(&oracle_b, &market, &false, &proof);

        set_timestamp(&env, 30 + DISPUTE_PERIOD);
        client.finalize(&market);
    }

    #[test]
    fn test_stress_many_oracle_submissions_reach_consensus() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 100);

        let (client, admin, contract_id) = setup(&env, 3);
        let proof = proof(&env);

        let oracle_a = Address::generate(&env);
        let oracle_b = Address::generate(&env);
        let oracle_c = Address::generate(&env);
        let oracle_d = Address::generate(&env);
        let oracle_e = Address::generate(&env);

        client.register_oracle(&admin, &oracle_a, &100);
        client.register_oracle(&admin, &oracle_b, &100);
        client.register_oracle(&admin, &oracle_c, &100);
        client.register_oracle(&admin, &oracle_d, &100);
        client.register_oracle(&admin, &oracle_e, &100);

        for _ in 0..10 {
            let market = Address::generate(&env);
            client.submit_resolution(&oracle_a, &market, &true, &proof);
            client.submit_resolution(&oracle_b, &market, &true, &proof);
            client.submit_resolution(&oracle_c, &market, &true, &proof);

            let resolved: MarketResolution = env.as_contract(&contract_id, || {
                env.storage()
                    .persistent()
                    .get(&StorageKey::Market(market.clone()))
                    .unwrap()
            });
            assert_eq!(resolved.outcome, Some(true));
            assert_eq!(resolved.votes.get(true), Some(3));
        }
    }
}

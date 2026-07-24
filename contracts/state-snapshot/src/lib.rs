#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short, Address, Bytes, Env, Error,
    String, Vec,
};

use oryn_shared::{
    OrynError, SnapshotCreatedEvent, SnapshotMetadata, SnapshotRegistryEntry,
    SnapshotRestoredEvent, SnapshotStatus, SnapshotVerifiedEvent, MAX_SNAPSHOTS,
};

contractmeta!(
    key = "Description",
    val = "Oryn Finance Protocol State Snapshot & Rollback Contract"
);

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    SnapshotCounter,
    SnapshotMeta(String),
    SnapshotRegistry(String),
    LastSnapshotTimestamp,
    Paused,
    Initialized,
}

#[contract]
pub struct StateSnapshotContract;

fn make_version_id(env: &Env, version: u64) -> String {
    let digits = [
        b"0", b"1", b"2", b"3", b"4", b"5", b"6", b"7", b"8", b"9",
    ];
    let mut buf = [0u8; 24];
    buf[0..5].copy_from_slice(b"SNAP_");
    let mut pos = 5;
    let mut v = version;
    if v == 0 {
        buf[pos] = b'0';
        pos += 1;
    } else {
        let mut digits_buf = [0u8; 20];
        let mut dpos = 0;
        while v > 0 {
            digits_buf[dpos] = digits[(v % 10) as usize][0];
            dpos += 1;
            v /= 10;
        }
        for i in (0..dpos).rev() {
            buf[pos] = digits_buf[i];
            pos += 1;
        }
    }
    String::from_bytes(env, &buf[..pos])
}

#[contractimpl]
impl StateSnapshotContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput.into());
        }

        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage()
            .persistent()
            .set(&StorageKey::SnapshotCounter, &0u64);
        env.storage()
            .persistent()
            .set(&StorageKey::LastSnapshotTimestamp, &0u64);
        env.storage()
            .persistent()
            .set(&StorageKey::Paused, &false);
        env.storage()
            .persistent()
            .set(&StorageKey::Initialized, &true);

        env.events().publish(
            (symbol_short!("snapshot"), symbol_short!("init")),
            admin,
        );

        Ok(())
    }

    pub fn pause(env: Env, caller: Address) -> Result<(), Error> {
        caller.require_auth();
        Self::require_admin(&env, &caller)?;
        env.storage().persistent().set(&StorageKey::Paused, &true);
        Ok(())
    }

    pub fn unpause(env: Env, caller: Address) -> Result<(), Error> {
        caller.require_auth();
        Self::require_admin(&env, &caller)?;
        env.storage().persistent().set(&StorageKey::Paused, &false);
        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .persistent()
            .get(&StorageKey::Paused)
            .unwrap_or(false)
    }

    pub fn create_snapshot(
        env: Env,
        caller: Address,
        description: String,
        contracts_registry: Vec<SnapshotRegistryEntry>,
    ) -> Result<SnapshotMetadata, Error> {
        caller.require_auth();
        Self::require_admin(&env, &caller)?;

        if Self::is_paused(env.clone()) {
            return Err(OrynError::ContractPaused.into());
        }

        let counter: u64 = env
            .storage()
            .persistent()
            .get(&StorageKey::SnapshotCounter)
            .unwrap_or(0);

        if counter >= MAX_SNAPSHOTS as u64 {
            return Err(OrynError::SnapshotCreationFailed.into());
        }

        let version = counter + 1;
        let timestamp = env.ledger().timestamp();
        let contract_count = contracts_registry.len() as u32;

        let snapshot_id = make_version_id(&env, version);

        let mut state_data = Vec::new(&env);
        let mut hash_bytes = Bytes::new(&env);

        for entry in contracts_registry.iter() {
            let eh = entry.state_hash.clone();
            for i in 0..32u32 {
                if let Some(b) = eh.get(i) {
                    hash_bytes.push_back(b);
                }
            }
            state_data.push_back(entry);
        }

        let digest = env.crypto().sha256(&hash_bytes);
        let digest_arr = digest.to_array();
        let state_hash_bytes = Bytes::from_array(&env, &digest_arr);

        let metadata = SnapshotMetadata {
            snapshot_id: snapshot_id.clone(),
            version,
            timestamp,
            contract_count,
            state_hash: state_hash_bytes.clone(),
            status: SnapshotStatus::Created,
            created_by: caller.clone(),
            description,
            parent_snapshot_id: String::from_str(&env, ""),
            contracts_registry: String::from_str(&env, "stored"),
        };

        env.storage()
            .persistent()
            .set(&StorageKey::SnapshotMeta(snapshot_id.clone()), &metadata);
        env.storage().persistent().set(
            &StorageKey::SnapshotRegistry(snapshot_id.clone()),
            &state_data,
        );
        env.storage()
            .persistent()
            .set(&StorageKey::SnapshotCounter, &version);
        env.storage()
            .persistent()
            .set(&StorageKey::LastSnapshotTimestamp, &timestamp);

        env.events().publish(
            (symbol_short!("snapshot"), symbol_short!("created")),
            SnapshotCreatedEvent {
                snapshot_id: snapshot_id.clone(),
                version,
                contract_count,
                state_hash: state_hash_bytes,
                created_by: caller,
                timestamp,
            },
        );

        Ok(metadata)
    }

    pub fn get_snapshot(
        env: Env,
        snapshot_id: String,
    ) -> Result<SnapshotMetadata, Error> {
        env.storage()
            .persistent()
            .get(&StorageKey::SnapshotMeta(snapshot_id.clone()))
            .ok_or_else(|| OrynError::SnapshotNotFound.into())
    }

    pub fn get_snapshot_registry(
        env: Env,
        snapshot_id: String,
    ) -> Result<Vec<SnapshotRegistryEntry>, Error> {
        env.storage()
            .persistent()
            .get(&StorageKey::SnapshotRegistry(snapshot_id.clone()))
            .ok_or_else(|| OrynError::SnapshotNotFound.into())
    }

    pub fn list_snapshots(env: Env) -> Vec<SnapshotMetadata> {
        let counter: u64 = env
            .storage()
            .persistent()
            .get(&StorageKey::SnapshotCounter)
            .unwrap_or(0);

        let mut snapshots = Vec::new(&env);
        for v in 1..=counter {
            let sid = make_version_id(&env, v);
            if let Some(meta) = env
                .storage()
                .persistent()
                .get(&StorageKey::SnapshotMeta(sid))
            {
                snapshots.push_back(meta);
            }
        }
        snapshots
    }

    pub fn verify_snapshot(
        env: Env,
        caller: Address,
        snapshot_id: String,
        expected_hash: Bytes,
    ) -> Result<SnapshotMetadata, Error> {
        caller.require_auth();
        Self::require_admin(&env, &caller)?;

        let mut metadata: SnapshotMetadata =
            Self::get_snapshot(env.clone(), snapshot_id.clone())?;

        if metadata.status == SnapshotStatus::Corrupted {
            return Err(OrynError::SnapshotCorrupted.into());
        }

        let current_hash = metadata.state_hash.clone();
        let is_valid = current_hash == expected_hash;

        metadata.status = if is_valid {
            SnapshotStatus::Verified
        } else {
            SnapshotStatus::Corrupted
        };

        env.storage()
            .persistent()
            .set(&StorageKey::SnapshotMeta(snapshot_id.clone()), &metadata);

        env.events().publish(
            (symbol_short!("snapshot"), symbol_short!("verified")),
            SnapshotVerifiedEvent {
                snapshot_id: snapshot_id.clone(),
                integrity_valid: is_valid,
                timestamp: env.ledger().timestamp(),
            },
        );

        if !is_valid {
            return Err(OrynError::SnapshotIntegrityCheckFailed.into());
        }

        Ok(metadata)
    }

    pub fn initiate_rollback(
        env: Env,
        caller: Address,
        snapshot_id: String,
        _rollback_reason: String,
    ) -> Result<SnapshotMetadata, Error> {
        caller.require_auth();
        Self::require_admin(&env, &caller)?;

        let mut metadata: SnapshotMetadata =
            Self::get_snapshot(env.clone(), snapshot_id.clone())?;

        if metadata.status != SnapshotStatus::Verified {
            return Err(OrynError::SnapshotRollbackNotAuthorized.into());
        }

        metadata.status = SnapshotStatus::Restored;

        env.storage()
            .persistent()
            .set(&StorageKey::SnapshotMeta(snapshot_id.clone()), &metadata);

        env.events().publish(
            (symbol_short!("snapshot"), symbol_short!("restored")),
            SnapshotRestoredEvent {
                snapshot_id: snapshot_id.clone(),
                restored_by: caller,
                previous_state_hash: metadata.state_hash.clone(),
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(metadata)
    }

    pub fn get_latest_snapshot(env: Env) -> Option<SnapshotMetadata> {
        let counter: u64 = env
            .storage()
            .persistent()
            .get(&StorageKey::SnapshotCounter)
            .unwrap_or(0);
        if counter == 0 {
            return None;
        }
        let sid = make_version_id(&env, counter);
        env.storage()
            .persistent()
            .get(&StorageKey::SnapshotMeta(sid))
    }

    pub fn get_snapshot_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&StorageKey::SnapshotCounter)
            .unwrap_or(0)
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&StorageKey::Admin)
            .ok_or(OrynError::Unauthorized)?;
        if caller != &admin {
            return Err(OrynError::Unauthorized.into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events as _};

    fn create_test_registry(env: &Env) -> Vec<SnapshotRegistryEntry> {
        let mut registry = Vec::new(env);
        registry.push_back(SnapshotRegistryEntry {
            contract_address: Address::generate(env),
            contract_type: String::from_str(env, "MARKET_FACTORY"),
            state_keys: Vec::from_array(
                env,
                [
                    String::from_str(env, "Admin"),
                    String::from_str(env, "Paused"),
                ],
            ),
            state_hash: Bytes::from_array(env, &[1u8; 32]),
        });
        registry.push_back(SnapshotRegistryEntry {
            contract_address: Address::generate(env),
            contract_type: String::from_str(env, "AMM_POOL"),
            state_keys: Vec::from_array(
                env,
                [
                    String::from_str(env, "PoolInfo"),
                    String::from_str(env, "Reserves"),
                ],
            ),
            state_hash: Bytes::from_array(env, &[2u8; 32]),
        });
        registry.push_back(SnapshotRegistryEntry {
            contract_address: Address::generate(env),
            contract_type: String::from_str(env, "GOVERNANCE"),
            state_keys: Vec::from_array(
                env,
                [
                    String::from_str(env, "ProposalCounter"),
                    String::from_str(env, "TotalStaked"),
                ],
            ),
            state_hash: Bytes::from_array(env, &[3u8; 32]),
        });
        registry.push_back(SnapshotRegistryEntry {
            contract_address: Address::generate(env),
            contract_type: String::from_str(env, "ORACLE_RESOLVER"),
            state_keys: Vec::from_array(
                env,
                [
                    String::from_str(env, "RegisteredOracles"),
                    String::from_str(env, "Resolutions"),
                ],
            ),
            state_hash: Bytes::from_array(env, &[4u8; 32]),
        });
        registry.push_back(SnapshotRegistryEntry {
            contract_address: Address::generate(env),
            contract_type: String::from_str(env, "TREASURY"),
            state_keys: Vec::from_array(
                env,
                [
                    String::from_str(env, "TotalFees"),
                    String::from_str(env, "Distributed"),
                ],
            ),
            state_hash: Bytes::from_array(env, &[5u8; 32]),
        });
        registry
    }

    #[test]
    fn test_initialize_contract() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);
        assert_eq!(client.get_snapshot_count(), 0);
        assert!(!client.is_paused());

        let events = env.events().all();
        assert!(events.iter().any(|e| {
            let topics = e.0;
            topics.len() == 2 && topics[0] == symbol_short!("snapshot")
        }));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);
        client.initialize(&admin);
    }

    #[test]
    fn test_create_snapshot() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let registry = create_test_registry(&env);
        let description = String::from_str(&env, "Protocol state snapshot v1");

        let metadata = client.create_snapshot(&admin, &description, &registry);

        assert_eq!(metadata.version, 1);
        assert_eq!(metadata.contract_count, 5);
        assert_eq!(metadata.status, SnapshotStatus::Created);
        assert_eq!(metadata.created_by, admin);
        assert_eq!(metadata.description, description);

        assert_eq!(client.get_snapshot_count(), 1);

        let events = env.events().all();
        assert!(events.iter().any(|e| {
            let topics = e.0;
            topics.len() == 2 && topics[1] == symbol_short!("created")
        }));
    }

    #[test]
    fn test_get_snapshot() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let registry = create_test_registry(&env);
        let description = String::from_str(&env, "Test snapshot");
        let metadata = client.create_snapshot(&admin, &description, &registry);

        let retrieved = client.get_snapshot(&metadata.snapshot_id);
        assert_eq!(retrieved.snapshot_id, metadata.snapshot_id);
        assert_eq!(retrieved.version, metadata.version);
        assert_eq!(retrieved.status, SnapshotStatus::Created);
    }

    #[test]
    fn test_verify_snapshot() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let registry = create_test_registry(&env);
        let description = String::from_str(&env, "Snapshot for verification");
        let metadata = client.create_snapshot(&admin, &description, &registry);

        let verified =
            client.verify_snapshot(&admin, &metadata.snapshot_id, &metadata.state_hash);
        assert_eq!(verified.status, SnapshotStatus::Verified);

        let events = env.events().all();
        assert!(events.iter().any(|e| {
            let topics = e.0;
            topics.len() == 2 && topics[1] == symbol_short!("verified")
        }));
    }

    #[test]
    fn test_verify_with_wrong_hash_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let registry = create_test_registry(&env);
        let description = String::from_str(&env, "Snapshot for bad verify");
        let metadata = client.create_snapshot(&admin, &description, &registry);

        let wrong_hash = Bytes::from_array(&env, &[0xFFu8; 32]);
        let result =
            client.try_verify_snapshot(&admin, &metadata.snapshot_id, &wrong_hash);
        assert!(result.is_err());
    }

    #[test]
    fn test_initiate_rollback() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let registry = create_test_registry(&env);
        let description = String::from_str(&env, "Snapshot for rollback");
        let metadata = client.create_snapshot(&admin, &description, &registry);
        client.verify_snapshot(&admin, &metadata.snapshot_id, &metadata.state_hash);

        let reason = String::from_str(&env, "Emergency rollback");
        let restored =
            client.initiate_rollback(&admin, &metadata.snapshot_id, &reason);
        assert_eq!(restored.status, SnapshotStatus::Restored);

        let events = env.events().all();
        assert!(events.iter().any(|e| {
            let topics = e.0;
            topics.len() == 2 && topics[1] == symbol_short!("restored")
        }));
    }

    #[test]
    fn test_rollback_unverified_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let registry = create_test_registry(&env);
        let description = String::from_str(&env, "Unverified snapshot");
        let metadata = client.create_snapshot(&admin, &description, &registry);

        let reason = String::from_str(&env, "Should fail");
        let result =
            client.try_initiate_rollback(&admin, &metadata.snapshot_id, &reason);
        assert!(result.is_err());
    }

    #[test]
    fn test_non_admin_cannot_create_snapshot() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let non_admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let registry = create_test_registry(&env);
        let description = String::from_str(&env, "Unauthorized snapshot");
        let result =
            client.try_create_snapshot(&non_admin, &description, &registry);
        assert!(result.is_err());
    }

    #[test]
    fn test_pause_unpause() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        assert!(!client.is_paused());
        client.pause(&admin);
        assert!(client.is_paused());
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_list_snapshots() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let registry = create_test_registry(&env);
        let desc1 = String::from_str(&env, "Snapshot 1");
        let desc2 = String::from_str(&env, "Snapshot 2");

        client.create_snapshot(&admin, &desc1, &registry);
        client.create_snapshot(&admin, &desc2, &registry);

        let list = client.list_snapshots();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_get_latest_snapshot() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, StateSnapshotContract);
        let client = StateSnapshotContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let registry = create_test_registry(&env);
        let desc = String::from_str(&env, "Latest");
        let metadata = client.create_snapshot(&admin, &desc, &registry);

        let latest = client.get_latest_snapshot();
        assert!(latest.is_some());
        assert_eq!(latest.unwrap().snapshot_id, metadata.snapshot_id);
    }
}

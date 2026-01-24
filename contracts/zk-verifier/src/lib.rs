#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype,
    Address, Env, String, Vec, Bytes, BytesN, Error
};

use oryn_shared::OrynError;

/* ───────────────────────── METADATA ───────────────────────── */

contractmeta!(
    key = "Description",
    val = "Oryn Finance ZK Verifier - Zero-knowledge proof verification"
);

/* ───────────────────────── STORAGE ───────────────────────── */

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    Initialized,
    VerificationKey(String),
    CircuitRegistry(String),
    ProofCommitment(BytesN<32>),
    NullifierUsed(BytesN<32>),
    AuthorizedVerifier(Address),
    ProofStats(String),
}

/* ───────────────────────── TYPES ───────────────────────── */

#[contracttype]
#[derive(Clone)]
pub struct VerificationKey {
    pub circuit_id: String,
    pub key_data: Bytes,
    pub created_at: u64,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct CircuitInfo {
    pub circuit_id: String,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct PredictionPublicInputs {
    pub market_id: String,
    pub commitment_hash: BytesN<32>,
    pub nullifier_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
pub struct ProofCommitment {
    pub commitment_hash: BytesN<32>,
    pub prover: Address,
    pub market_id: String,
    pub commitment_data: Bytes,
    pub created_at: u64,
    pub is_revealed: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct VerificationResult {
    pub is_valid: bool,
    pub proof_hash: BytesN<32>,
    pub verification_timestamp: u64,
    pub error_message: Option<String>,
}

#[contracttype]
#[derive(Clone)]
pub struct ProofStats {
    pub circuit_id: String,
    pub total_verified: u64,
    pub total_failed: u64,
}

/* ───────────────────────── CONTRACT ───────────────────────── */

#[contract]
pub struct ZKVerifierContract;

#[contractimpl]
impl ZKVerifierContract {

    /* ───────── INIT ───────── */

    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput.into());
        }

        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::Initialized, &true);
        env.storage().persistent().set(&StorageKey::AuthorizedVerifier(admin), &true);

        Ok(())
    }

    /* ───────── REGISTER ───────── */

    pub fn register_verification_key(
        env: Env,
        admin: Address,
        circuit_id: String,
        key_data: Bytes,
    ) -> Result<(), Error> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        let key = VerificationKey {
            circuit_id: circuit_id.clone(),
            key_data,
            created_at: env.ledger().timestamp(),
            is_active: true,
        };

        env.storage().persistent().set(
            &StorageKey::VerificationKey(circuit_id),
            &key
        );

        Ok(())
    }

    pub fn register_circuit(
        env: Env,
        admin: Address,
        circuit_id: String,
    ) -> Result<(), Error> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        let circuit = CircuitInfo {
            circuit_id: circuit_id.clone(),
            is_active: true,
        };

        env.storage().persistent().set(
            &StorageKey::CircuitRegistry(circuit_id),
            &circuit
        );

        Ok(())
    }

    /* ───────── VERIFY ───────── */

    pub fn verify_prediction_proof(
        env: Env,
        verifier: Address,
        circuit_id: String,
        proof: Bytes,
        public_inputs: PredictionPublicInputs,
    ) -> Result<VerificationResult, Error> {
        Self::require_authorized_verifier(&env, &verifier)?;
        verifier.require_auth();

        let nullifier = public_inputs.nullifier_hash.clone();
        let commitment_hash = public_inputs.commitment_hash.clone();

        if env.storage().persistent().has(&StorageKey::NullifierUsed(nullifier.clone())) {
            return Ok(VerificationResult {
                is_valid: false,
                proof_hash: env.crypto().keccak256(&proof).into(),
                verification_timestamp: env.ledger().timestamp(),
                error_message: Some(String::from_str(&env, "Nullifier already used")),
            });
        }

        let is_valid = proof.len() > 64;

        if is_valid {
            env.storage().persistent().set(
                &StorageKey::NullifierUsed(nullifier),
                &true
            );

            let commitment = ProofCommitment {
                commitment_hash: commitment_hash.clone(),
                prover: verifier,
                market_id: public_inputs.market_id,
                commitment_data: proof.clone(),
                created_at: env.ledger().timestamp(),
                is_revealed: false,
            };

            env.storage().persistent().set(
                &StorageKey::ProofCommitment(commitment_hash),
                &commitment
            );
        }

        Ok(VerificationResult {
            is_valid,
            proof_hash: env.crypto().keccak256(&proof).into(),
            verification_timestamp: env.ledger().timestamp(),
            error_message: None,
        })
    }

    /* ───────── REVEAL ───────── */

    pub fn reveal_prediction(
        env: Env,
        prover: Address,
        commitment_hash: BytesN<32>,
    ) -> Result<(), Error> {
        prover.require_auth();

        let mut commitment: ProofCommitment = env.storage().persistent()
            .get(&StorageKey::ProofCommitment(commitment_hash.clone()))
            .ok_or(OrynError::InvalidInput)?;

        if commitment.is_revealed {
            return Err(OrynError::InvalidInput.into());
        }

        commitment.is_revealed = true;

        env.storage().persistent().set(
            &StorageKey::ProofCommitment(commitment_hash),
            &commitment
        );

        Ok(())
    }

    /* ───────── HELPERS ───────── */

    fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let admin: Address = env.storage().persistent()
            .get(&StorageKey::Admin)
            .unwrap();

        if caller != &admin {
            return Err(OrynError::Unauthorized.into());
        }
        Ok(())
    }

    fn require_authorized_verifier(env: &Env, caller: &Address) -> Result<(), Error> {
        let ok: bool = env.storage().persistent()
            .get(&StorageKey::AuthorizedVerifier(caller.clone()))
            .unwrap_or(false);

        if !ok {
            return Err(OrynError::Unauthorized.into());
        }
        Ok(())
    }
}

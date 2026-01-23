#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Bytes, BytesN, Map
};

use oryn_shared::{OrynError, PRECISION};

// Contract metadata
contractmeta!(
    key = "Description", 
    val = "Oryn Finance ZK Verifier - Zero-knowledge proof verification for private predictions"
);

/// Storage keys for the ZK verifier contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Admin address
    Admin,
    /// Verification keys for different proof systems: String -> VerificationKey
    VerificationKey(String), 
    /// Verified proof commitments: commitment_hash -> ProofCommitment
    ProofCommitment(BytesN<32>),
    /// Nullifier tracking to prevent double-spending: nullifier_hash -> bool
    NullifierUsed(BytesN<32>),
    /// Trusted setup parameters for different circuits
    TrustedSetup(String),
    /// Circuit registry: circuit_id -> CircuitInfo
    CircuitRegistry(String),
    /// Authorized proof verifiers: Address -> bool
    AuthorizedVerifier(Address),
    /// Factory and market contracts
    FactoryContract,
    MarketContracts(String), // market_id -> contract_address
    /// Proof verification statistics
    ProofStats(String),
    /// Initialization flag
    Initialized,
}

/// Verification key for a specific proof system
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationKey {
    pub circuit_id: String,
    pub key_data: Bytes,
    pub curve_type: CurveType,
    pub proof_system: ProofSystem,
    pub created_at: u64,
    pub is_active: bool,
}

/// Proof commitment structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProofCommitment {
    pub commitment_hash: BytesN<32>,
    pub prover: Address,
    pub market_id: String,
    pub commitment_data: Bytes,
    pub created_at: u64,
    pub revealed_at: Option<u64>,
    pub is_revealed: bool,
    pub prediction_outcome: Option<bool>,
    pub amount_wagered: Option<i128>,
}

/// Circuit information
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircuitInfo {
    pub circuit_id: String,
    pub circuit_name: String,
    pub description: String,
    pub verification_key_hash: BytesN<32>,
    pub public_input_count: u32,
    pub is_active: bool,
    pub gas_cost_estimate: u64,
}

/// Supported elliptic curves
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CurveType {
    BN254,
    BLS12_381,
    Secp256k1,
    Ed25519,
}

/// Supported proof systems
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProofSystem {
    Groth16,
    Plonk,
    Bulletproofs,
    Stark,
}

/// Public inputs for prediction proofs
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PredictionPublicInputs {
    pub market_id: String,
    pub commitment_hash: BytesN<32>,
    pub nullifier_hash: BytesN<32>,
    pub amount_commitment: BytesN<32>,
    pub outcome_commitment: BytesN<32>,
    pub timestamp: u64,
}

/// Proof verification result
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationResult {
    pub is_valid: bool,
    pub proof_hash: BytesN<32>,
    pub verification_timestamp: u64,
    pub gas_used: u64,
    pub error_message: Option<String>,
}

/// Proof statistics
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProofStats {
    pub circuit_id: String,
    pub total_proofs_verified: u64,
    pub successful_verifications: u64,
    pub failed_verifications: u64,
    pub average_verification_time: u64,
    pub total_gas_used: u64,
}

#[contract]
pub struct ZKVerifierContract;

#[contractimpl]
impl ZKVerifierContract {
    /// Initialize the ZK verifier contract
    pub fn initialize(
        env: Env,
        admin: Address,
        factory_contract: Address,
    ) -> Result<(), OrynError> {
        // Ensure contract hasn't been initialized
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput);
        }

        admin.require_auth();

        // Store configuration
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::FactoryContract, &factory_contract);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        // Authorize admin as verifier
        env.storage().persistent().set(&StorageKey::AuthorizedVerifier(admin), &true);

        Ok(())
    }

    /// Register a new verification key for a circuit
    pub fn register_verification_key(
        env: Env,
        admin: Address,
        circuit_id: String,
        key_data: Bytes,
        curve_type: CurveType,
        proof_system: ProofSystem,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        let verification_key = VerificationKey {
            circuit_id: circuit_id.clone(),
            key_data,
            curve_type,
            proof_system,
            created_at: env.ledger().timestamp(),
            is_active: true,
        };

        env.storage().persistent().set(
            &StorageKey::VerificationKey(circuit_id),
            &verification_key
        );

        Ok(())
    }

    /// Register circuit information
    pub fn register_circuit(
        env: Env,
        admin: Address,
        circuit_id: String,
        circuit_name: String,
        description: String,
        verification_key_hash: BytesN<32>,
        public_input_count: u32,
        gas_cost_estimate: u64,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        let circuit_info = CircuitInfo {
            circuit_id: circuit_id.clone(),
            circuit_name,
            description,
            verification_key_hash,
            public_input_count,
            is_active: true,
            gas_cost_estimate,
        };

        env.storage().persistent().set(
            &StorageKey::CircuitRegistry(circuit_id),
            &circuit_info
        );

        Ok(())
    }

    /// Verify a zero-knowledge proof for a prediction
    pub fn verify_prediction_proof(
        env: Env,
        verifier: Address,
        circuit_id: String,
        zk_proof: Bytes,
        public_inputs: PredictionPublicInputs,
    ) -> Result<VerificationResult, OrynError> {
        Self::require_authorized_verifier(&env, &verifier)?;
        verifier.require_auth();

        // Get circuit info and verification key
        let circuit_info: CircuitInfo = env.storage().persistent()
            .get(&StorageKey::CircuitRegistry(circuit_id.clone()))
            .ok_or(OrynError::InvalidInput)?;

        if !circuit_info.is_active {
            return Err(OrynError::InvalidInput);
        }

        let verification_key: VerificationKey = env.storage().persistent()
            .get(&StorageKey::VerificationKey(circuit_id.clone()))
            .ok_or(OrynError::InvalidInput)?;

        if !verification_key.is_active {
            return Err(OrynError::InvalidInput);
        }

        // Check if nullifier has been used (prevent double-spending)
        if env.storage().persistent().has(&StorageKey::NullifierUsed(public_inputs.nullifier_hash)) {
            return Ok(VerificationResult {
                is_valid: false,
                proof_hash: env.crypto().keccak256(&zk_proof).into(),
                verification_timestamp: env.ledger().timestamp(),
                gas_used: 0,
                error_message: Some(String::from_str(&env, "Nullifier already used")),
            });
        }

        // Verify the proof (placeholder - actual cryptographic verification would be here)
        let is_valid = Self::verify_proof_internal(
            &env,
            &verification_key,
            &zk_proof,
            &public_inputs
        )?;

        let proof_hash = env.crypto().keccak256(&zk_proof).into();
        let verification_timestamp = env.ledger().timestamp();

        if is_valid {
            // Mark nullifier as used
            env.storage().persistent().set(
                &StorageKey::NullifierUsed(public_inputs.nullifier_hash),
                &true
            );

            // Store proof commitment
            let commitment = ProofCommitment {
                commitment_hash: public_inputs.commitment_hash,
                prover: verifier.clone(), // In real impl, extract from proof
                market_id: public_inputs.market_id.clone(),
                commitment_data: zk_proof.clone(),
                created_at: verification_timestamp,
                revealed_at: None,
                is_revealed: false,
                prediction_outcome: None,
                amount_wagered: None,
            };

            env.storage().persistent().set(
                &StorageKey::ProofCommitment(public_inputs.commitment_hash),
                &commitment
            );
        }

        // Update proof statistics
        Self::update_proof_stats(&env, &circuit_id, is_valid, 0); // 0 gas placeholder

        Ok(VerificationResult {
            is_valid,
            proof_hash,
            verification_timestamp,
            gas_used: 0, // Placeholder
            error_message: if is_valid { None } else { Some(String::from_str(&env, "Invalid proof")) },
        })
    }

    /// Reveal a committed prediction (used when market resolves)
    pub fn reveal_prediction(
        env: Env,
        prover: Address,
        commitment_hash: BytesN<32>,
        prediction_outcome: bool,
        amount_wagered: i128,
        reveal_nonce: BytesN<32>,
    ) -> Result<(), OrynError> {
        prover.require_auth();

        // Get the commitment
        let mut commitment: ProofCommitment = env.storage().persistent()
            .get(&StorageKey::ProofCommitment(commitment_hash))
            .ok_or(OrynError::InvalidInput)?;

        if commitment.is_revealed {
            return Err(OrynError::InvalidInput);
        }

        // Verify that the revealed data matches the commitment
        // In a real implementation, this would verify the commitment hash
        let revealed_data = Self::hash_prediction_data(
            &env,
            prediction_outcome,
            amount_wagered,
            &reveal_nonce
        );

        if revealed_data != commitment_hash {
            return Err(OrynError::InvalidInput);
        }

        // Update commitment with revealed data
        commitment.is_revealed = true;
        commitment.revealed_at = Some(env.ledger().timestamp());
        commitment.prediction_outcome = Some(prediction_outcome);
        commitment.amount_wagered = Some(amount_wagered);

        env.storage().persistent().set(
            &StorageKey::ProofCommitment(commitment_hash),
            &commitment
        );

        Ok(())
    }

    /// Batch verify multiple proofs for efficiency
    pub fn batch_verify_proofs(
        env: Env,
        verifier: Address,
        circuit_id: String,
        proofs: Vec<Bytes>,
        public_inputs_list: Vec<PredictionPublicInputs>,
    ) -> Result<Vec<VerificationResult>, OrynError> {
        Self::require_authorized_verifier(&env, &verifier)?;
        verifier.require_auth();

        if proofs.len() != public_inputs_list.len() {
            return Err(OrynError::InvalidInput);
        }

        let mut results = Vec::new(&env);

        // Verify each proof individually (in a real implementation, this would use batch verification)
        for i in 0..proofs.len() {
            let proof = proofs.get(i).unwrap();
            let public_inputs = public_inputs_list.get(i).unwrap();
            
            let result = Self::verify_prediction_proof(
                env.clone(),
                verifier.clone(),
                circuit_id.clone(),
                proof,
                public_inputs,
            )?;
            
            results.push_back(result);
        }

        Ok(results)
    }

    /// Get proof commitment information
    pub fn get_proof_commitment(
        env: Env,
        commitment_hash: BytesN<32>,
    ) -> Option<ProofCommitment> {
        env.storage().persistent().get(&StorageKey::ProofCommitment(commitment_hash))
    }

    /// Get circuit information
    pub fn get_circuit_info(env: Env, circuit_id: String) -> Option<CircuitInfo> {
        env.storage().persistent().get(&StorageKey::CircuitRegistry(circuit_id))
    }

    /// Get proof verification statistics
    pub fn get_proof_stats(env: Env, circuit_id: String) -> Option<ProofStats> {
        env.storage().persistent().get(&StorageKey::ProofStats(circuit_id))
    }

    /// Check if nullifier has been used
    pub fn is_nullifier_used(env: Env, nullifier_hash: BytesN<32>) -> bool {
        env.storage().persistent().has(&StorageKey::NullifierUsed(nullifier_hash))
    }

    /// Authorize proof verifier (admin only)
    pub fn authorize_verifier(
        env: Env,
        admin: Address,
        verifier: Address,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::AuthorizedVerifier(verifier), &true);
        Ok(())
    }

    /// Remove verifier authorization (admin only)
    pub fn remove_verifier(
        env: Env,
        admin: Address,
        verifier: Address,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().remove(&StorageKey::AuthorizedVerifier(verifier));
        Ok(())
    }

    /// Deactivate a circuit (admin only)
    pub fn deactivate_circuit(
        env: Env,
        admin: Address,
        circuit_id: String,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        let mut circuit_info: CircuitInfo = env.storage().persistent()
            .get(&StorageKey::CircuitRegistry(circuit_id.clone()))
            .ok_or(OrynError::InvalidInput)?;

        circuit_info.is_active = false;
        env.storage().persistent().set(&StorageKey::CircuitRegistry(circuit_id), &circuit_info);

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

    fn require_authorized_verifier(env: &Env, caller: &Address) -> Result<(), OrynError> {
        let is_authorized: bool = env.storage().persistent()
            .get(&StorageKey::AuthorizedVerifier(caller.clone()))
            .unwrap_or(false);
        if !is_authorized {
            return Err(OrynError::Unauthorized);
        }
        Ok(())
    }

    fn verify_proof_internal(
        env: &Env,
        verification_key: &VerificationKey,
        proof: &Bytes,
        public_inputs: &PredictionPublicInputs,
    ) -> Result<bool, OrynError> {
        // Placeholder for actual cryptographic proof verification
        // In a real implementation, this would:
        // 1. Parse the proof based on the proof system (Groth16, PLONK, etc.)
        // 2. Extract public inputs and verify they match the provided inputs
        // 3. Perform the cryptographic verification using the verification key
        // 4. Return true if the proof is valid, false otherwise
        
        // For now, we'll do basic validation
        if proof.len() == 0 {
            return Ok(false);
        }

        // Check if proof size is reasonable (different for different systems)
        let expected_size = match verification_key.proof_system {
            ProofSystem::Groth16 => 128, // 2 G1 points + 1 G2 point for BN254
            ProofSystem::Plonk => 192,   // 3 G1 points + 1 G2 point for opening proofs
            ProofSystem::Bulletproofs => 64, // Variable size, 64 bytes minimum
            ProofSystem::Stark => 256,   // STARK proofs are larger
        };

        if proof.len() < expected_size {
            return Ok(false);
        }

        // Placeholder: Always return true for valid-sized proofs
        // In practice, this would perform actual cryptographic verification
        Ok(true)
    }

    fn hash_prediction_data(
        env: &Env,
        prediction_outcome: bool,
        amount_wagered: i128,
        nonce: &BytesN<32>,
    ) -> BytesN<32> {
        // Create data to hash
        let mut data = Bytes::new(env);
        data.extend_from_array(&[if prediction_outcome { 1u8 } else { 0u8 }]);
        data.extend_from_array(&amount_wagered.to_be_bytes());
        data.extend_from_slice(nonce);
        
        env.crypto().keccak256(&data).into()
    }

    fn update_proof_stats(
        env: &Env,
        circuit_id: &String,
        is_valid: bool,
        gas_used: u64,
    ) {
        let mut stats: ProofStats = env.storage().persistent()
            .get(&StorageKey::ProofStats(circuit_id.clone()))
            .unwrap_or(ProofStats {
                circuit_id: circuit_id.clone(),
                total_proofs_verified: 0,
                successful_verifications: 0,
                failed_verifications: 0,
                average_verification_time: 0,
                total_gas_used: 0,
            });

        stats.total_proofs_verified += 1;
        stats.total_gas_used += gas_used;

        if is_valid {
            stats.successful_verifications += 1;
        } else {
            stats.failed_verifications += 1;
        }

        env.storage().persistent().set(&StorageKey::ProofStats(circuit_id.clone()), &stats);
    }
}
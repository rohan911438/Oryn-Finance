#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype,
    Address, Env, String, Bytes, BytesN
};

use soroban_sdk::xdr::ToXdr;


/* ----------------------------- METADATA ----------------------------- */

contractmeta!(
    key = "Description",
    val = "Oryn Finance X402 Integration - Advanced MEV protection and transaction privacy"
);

/* ----------------------------- STORAGE KEYS ----------------------------- */

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    EncryptedOrder(BytesN<32>),
}

/* ----------------------------- ENUMS ----------------------------- */

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PrivacyLevel {
    Public,
    Confidential,
    Private,
    Dark,
    Anonymous,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OrderStatus {
    Submitted,
    Batched,
    Processing,
    Executed,
    Failed,
    Cancelled,
    Expired,
}

/* ----------------------------- STRUCTS ----------------------------- */

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EncryptedOrder {
    pub order_hash: BytesN<32>,
    pub submitter: Address,
    pub market_id: String,
    pub encrypted_data: Bytes,
    pub commitment_hash: BytesN<32>,
    pub privacy_level: PrivacyLevel,
    pub sequencer: Address,
    pub submission_timestamp: u64,
    pub execution_timestamp: u64, // 0 = not executed
    pub status: OrderStatus,
    pub mev_protection_enabled: bool,
    pub priority_fee: i128,
}

/* ----------------------------- CONTRACT ----------------------------- */

#[contract]
pub struct X402IntegrationContract;

#[contractimpl]
impl X402IntegrationContract {

    pub fn submit_private_order(
        env: Env,
        submitter: Address,
        market_id: String,
        encrypted_order_data: Bytes,
        privacy_level: PrivacyLevel,
        sequencer: Address,
        mev_protection: bool,
        priority_fee: i128,
    ) -> BytesN<32> {

        submitter.require_auth();

        let order_hash =
            Self::generate_order_hash(&env, &submitter, &encrypted_order_data);

        let order = EncryptedOrder {
            order_hash: order_hash.clone(),
            submitter,
            market_id,
            encrypted_data: encrypted_order_data,
            commitment_hash: order_hash.clone(),
            privacy_level,
            sequencer,
            submission_timestamp: env.ledger().timestamp(),
            execution_timestamp: 0, // not executed yet
            status: OrderStatus::Submitted,
            mev_protection_enabled: mev_protection,
            priority_fee,
        };

        env.storage()
            .persistent()
            .set(&StorageKey::EncryptedOrder(order_hash.clone()), &order);

        order_hash
    }

    /* ------------------------ INTERNAL HELPERS ------------------------ */

    fn generate_order_hash(
        env: &Env,
        submitter: &Address,
        encrypted_data: &Bytes,
    ) -> BytesN<32> {

        let mut data = Bytes::new(env);

        // Address → Bytes
        let submitter_bytes = submitter.to_xdr(env);
        data.append(&submitter_bytes);

        // Encrypted payload
        data.append(encrypted_data);

        // Timestamp → Bytes
        let ts_bytes = Bytes::from_slice(env, &env.ledger().timestamp().to_be_bytes());
        data.append(&ts_bytes);

        env.crypto().keccak256(&data).into()
    }
}

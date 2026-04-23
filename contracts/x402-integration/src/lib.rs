#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, Address, Bytes, BytesN, Env, String,
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
pub enum ChainStatus {
    Pending,
    Confirming,
    Executed,
    Failed,
    Reverted,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossChainTransaction {
    pub tx_hash: BytesN<32>,
    pub source_chain: String,
    pub destination_chain: String,
    pub amount: i128,
    pub status: ChainStatus,
    pub confirmations: u32,
    pub required_confirmations: u32,
    pub timestamp: u64,
}

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

    pub fn init_cross_chain_tx(
        env: Env,
        source_chain: String,
        destination_chain: String,
        amount: i128,
        required_confirmations: u32,
    ) -> BytesN<32> {
        let tx_hash = Self::generate_tx_hash(&env, &source_chain, &destination_chain, amount);
        let cross_tx = CrossChainTransaction {
            tx_hash: tx_hash.clone(),
            source_chain,
            destination_chain,
            amount,
            status: ChainStatus::Pending,
            confirmations: 0,
            required_confirmations,
            timestamp: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&StorageKey::EncryptedOrder(tx_hash.clone()), &cross_tx);
        tx_hash
    }

    pub fn update_cross_chain_confirmations(
        env: Env,
        tx_hash: BytesN<32>,
        new_confirmations: u32,
    ) {
        let cross_tx: CrossChainTransaction = env.storage()
            .persistent()
            .get(&StorageKey::EncryptedOrder(tx_hash.clone()))
            .unwrap();
        cross_tx.confirmations = new_confirmations;
        if new_confirmations >= cross_tx.required_confirmations {
            cross_tx.status = ChainStatus::Confirming;
        }
        env.storage()
            .persistent()
            .set(&StorageKey::EncryptedOrder(tx_hash), &cross_tx);
    }

    pub fn get_cross_chain_status(env: Env, tx_hash: BytesN<32>) -> ChainStatus {
        env.storage()
            .persistent()
            .get::<_, CrossChainTransaction>(&StorageKey::EncryptedOrder(tx_hash))
            .map(|tx| tx.status)
            .unwrap_or(ChainStatus::Failed)
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

    fn generate_tx_hash(
        env: &Env,
        source_chain: &String,
        destination_chain: &String,
        amount: i128,
    ) -> BytesN<32> {
        let mut data = Bytes::new(env);
        data.append(&source_chain.to_xdr(env));
        data.append(&destination_chain.to_xdr(env));
        let amount_bytes = Bytes::from_slice(env, &amount.to_be_bytes());
        data.append(&amount_bytes);
        let ts_bytes = Bytes::from_slice(env, &env.ledger().timestamp().to_be_bytes());
        data.append(&ts_bytes);
        env.crypto().keccak256(&data).into()
    }
}

    /* ------------------------ INTERNAL HELPERS ------------------------ */

    fn generate_order_hash(env: &Env, submitter: &Address, encrypted_data: &Bytes) -> BytesN<32> {
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

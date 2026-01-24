#![no_std]
#![allow(unexpected_cfgs)]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype,
    Address, Env, String
};

use oryn_shared::OrynError;

contractmeta!(
    key = "Description",
    val = "Oryn Finance Insurance Contract"
);

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    InsurancePolicy(Address, String),
    InsuranceRate(RiskTier),
    InsuranceClaim(String),
    EmergencyShutdown,
    Initialized,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CoverageType {
    OracleFailure,
    MarketManipulation,
    SmartContractBug,
    LiquidityDrain,
    Comprehensive,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RiskTier {
    Low,
    Medium,
    High,
    Critical,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiskAssessment {
    pub market_id: String,
    pub risk_tier: RiskTier,
    pub insurance_rate: i128,
    pub last_assessment: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsurancePolicy {
    pub policy_id: String,
    pub insured_user: Address,
    pub market_id: String,
    pub coverage_amount: i128,
    pub premium_paid: i128,
    pub coverage_type: CoverageType,
    pub policy_end: u64,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    pub claim_id: String,
    pub claimant: Address,
    pub market_id: String,
    pub claim_amount: i128,
    pub approved: bool,
}

#[contract]
pub struct InsuranceContract;

#[contractimpl]
impl InsuranceContract {

    // --------------------------------
    // INITIALIZE
    // --------------------------------
    pub fn initialize(
        env: Env,
        admin: Address,
    ) -> Result<(), soroban_sdk::Error> {
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput.into());
        }

        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::EmergencyShutdown, &false);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        env.storage().persistent().set(&StorageKey::InsuranceRate(RiskTier::Low), &50i128);
        env.storage().persistent().set(&StorageKey::InsuranceRate(RiskTier::Medium), &100i128);
        env.storage().persistent().set(&StorageKey::InsuranceRate(RiskTier::High), &250i128);
        env.storage().persistent().set(&StorageKey::InsuranceRate(RiskTier::Critical), &500i128);

        Ok(())
    }

    // --------------------------------
    // PURCHASE INSURANCE
    // --------------------------------
    pub fn purchase_insurance(
        env: Env,
        user: Address,
        market_id: String,
        coverage_amount: i128,
        coverage_type: CoverageType,
        duration_days: u32,
    ) -> Result<String, soroban_sdk::Error> {
        user.require_auth();

        let risk = Self::assess_market_risk_internal(&env, &market_id)
            .map_err(|e| soroban_sdk::Error::from(e))?;

        let premium = coverage_amount * risk.insurance_rate / 10_000;

        let policy_id = String::from_str(&env, "policy");

        let policy = InsurancePolicy {
            policy_id: policy_id.clone(),
            insured_user: user.clone(),
            market_id: market_id.clone(),
            coverage_amount,
            premium_paid: premium,
            coverage_type,
            policy_end: env.ledger().timestamp() + (duration_days as u64 * 86_400),
            is_active: true,
        };

        env.storage().persistent().set(
            &StorageKey::InsurancePolicy(user, market_id),
            &policy,
        );

        Ok(policy_id)
    }

    // --------------------------------
    // SUBMIT CLAIM
    // --------------------------------
    pub fn submit_claim(
        env: Env,
        user: Address,
        market_id: String,
        claim_amount: i128,
    ) -> Result<String, soroban_sdk::Error> {
        user.require_auth();

        let claim_id = String::from_str(&env, "claim");

        let claim = Claim {
            claim_id: claim_id.clone(),
            claimant: user,
            market_id,
            claim_amount,
            approved: false,
        };

        env.storage().persistent()
            .set(&StorageKey::InsuranceClaim(claim_id.clone()), &claim);

        Ok(claim_id)
    }

    // --------------------------------
    // VIEW: MARKET RISK
    // --------------------------------
    pub fn assess_market_risk(
        env: Env,
        market_id: String,
    ) -> Result<RiskAssessment, soroban_sdk::Error> {
        Self::assess_market_risk_internal(&env, &market_id)
            .map_err(|e| soroban_sdk::Error::from(e))
    }

    // --------------------------------
    // INTERNAL LOGIC
    // --------------------------------
    fn assess_market_risk_internal(
        env: &Env,
        market_id: &String,
    ) -> Result<RiskAssessment, OrynError> {
        Ok(RiskAssessment {
            market_id: market_id.clone(),
            risk_tier: RiskTier::Medium,
            insurance_rate: 100,
            last_assessment: env.ledger().timestamp(),
        })
    }
}

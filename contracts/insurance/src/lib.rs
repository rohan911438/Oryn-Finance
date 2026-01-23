#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Map
};

use oryn_shared::{OrynError, PRECISION};

// Contract metadata
contractmeta!(
    key = "Description",
    val = "Oryn Finance Insurance - Optional protection against oracle failures and market manipulation"
);

/// Storage keys for the insurance contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Admin address
    Admin,
    /// Insurance pool reserves: currency -> amount
    PoolReserves(String),
    /// Active insurance policies: (user, market_id) -> InsurancePolicy
    InsurancePolicy(Address, String),
    /// Insurance rates for different risk tiers: risk_tier -> rate (basis points)
    InsuranceRate(RiskTier),
    /// Oracle failure tracking: oracle_address -> FailureRecord
    OracleFailureRecord(Address),
    /// Market risk assessments: market_id -> RiskAssessment
    MarketRiskAssessment(String),
    /// Insurance claims: claim_id -> Claim
    InsuranceClaim(String),
    /// Premium collection statistics
    PremiumStats,
    /// Claims payout statistics
    ClaimsStats,
    /// Authorized insurance assessors: Address -> bool
    AuthorizedAssessor(Address),
    /// Reputation contract address
    ReputationContract,
    /// Oracle resolver contract address
    OracleContract,
    /// Treasury contract for reserve management
    TreasuryContract,
    /// Insurance pool parameters
    PoolParameters,
    /// Emergency shutdown flag
    EmergencyShutdown,
    /// Initialization flag
    Initialized,
}

/// Insurance policy structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsurancePolicy {
    pub policy_id: String,
    pub insured_user: Address,
    pub market_id: String,
    pub coverage_amount: i128,
    pub premium_paid: i128,
    pub coverage_type: CoverageType,
    pub policy_start: u64,
    pub policy_end: u64,
    pub is_active: bool,
    pub claims_made: Vec<String>,
    pub total_claims_paid: i128,
}

/// Types of insurance coverage
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CoverageType {
    OracleFailure,      // Protection against oracle manipulation/failure
    MarketManipulation, // Protection against market manipulation
    SmartContractBug,   // Protection against contract vulnerabilities
    LiquidityDrain,     // Protection against liquidity pool attacks
    Comprehensive,      // All-in-one coverage
}

/// Risk tier for pricing insurance
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RiskTier {
    Low,     // Established oracles, high liquidity markets
    Medium,  // Moderate risk profile
    High,    // New oracles, low liquidity
    Critical, // Experimental markets, untested oracles
}

/// Risk assessment for a market
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiskAssessment {
    pub market_id: String,
    pub oracle_reputation_score: i128,
    pub liquidity_score: i128,
    pub volatility_score: i128,
    pub market_age_days: u32,
    pub participant_count: u32,
    pub risk_tier: RiskTier,
    pub insurance_rate: i128, // Basis points
    pub last_assessment: u64,
}

/// Insurance claim structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    pub claim_id: String,
    pub policy_id: String,
    pub claimant: Address,
    pub market_id: String,
    pub claim_type: ClaimType,
    pub claim_amount: i128,
    pub evidence: String,
    pub submission_timestamp: u64,
    pub investigation_start: Option<u64>,
    pub resolution_timestamp: Option<u64>,
    pub status: ClaimStatus,
    pub payout_amount: i128,
    pub assessor: Option<Address>,
    pub investigation_notes: String,
}

/// Types of insurance claims
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimType {
    OracleManipulation,
    OracleDowntime,
    MarketManipulation,
    ContractBug,
    LiquidityAttack,
    UnexpectedResolution,
}

/// Claim processing status
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimStatus {
    Submitted,
    UnderInvestigation,
    AwaitingEvidence,
    Approved,
    Denied,
    Paid,
    Disputed,
}

/// Oracle failure tracking
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FailureRecord {
    pub oracle_address: Address,
    pub total_failures: u32,
    pub last_failure_timestamp: u64,
    pub failure_types: Map<String, u32>, // failure_type -> count
    pub average_downtime: u64,
    pub reputation_impact: i128,
}

/// Pool parameters for insurance fund management
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolParameters {
    pub minimum_reserve_ratio: i128, // Basis points
    pub maximum_coverage_ratio: i128, // Maximum coverage per market
    pub premium_collection_fee: i128, // Fee taken by protocol
    pub claims_investigation_period: u64, // Time for claim investigation
    pub emergency_reserve_threshold: i128,
}

#[contract]
pub struct InsuranceContract;

#[contractimpl]
impl InsuranceContract {
    /// Initialize the insurance contract
    pub fn initialize(
        env: Env,
        admin: Address,
        reputation_contract: Address,
        oracle_contract: Address,
        treasury_contract: Address,
        pool_parameters: PoolParameters,
    ) -> Result<(), OrynError> {
        // Ensure contract hasn't been initialized
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput);
        }

        admin.require_auth();

        // Store configuration
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::ReputationContract, &reputation_contract);
        env.storage().persistent().set(&StorageKey::OracleContract, &oracle_contract);
        env.storage().persistent().set(&StorageKey::TreasuryContract, &treasury_contract);
        env.storage().persistent().set(&StorageKey::PoolParameters, &pool_parameters);
        
        // Set default insurance rates (basis points)
        env.storage().persistent().set(&StorageKey::InsuranceRate(RiskTier::Low), &50_i128); // 0.5%
        env.storage().persistent().set(&StorageKey::InsuranceRate(RiskTier::Medium), &100_i128); // 1.0%
        env.storage().persistent().set(&StorageKey::InsuranceRate(RiskTier::High), &250_i128); // 2.5%
        env.storage().persistent().set(&StorageKey::InsuranceRate(RiskTier::Critical), &500_i128); // 5.0%
        
        env.storage().persistent().set(&StorageKey::EmergencyShutdown, &false);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        // Authorize admin as assessor
        env.storage().persistent().set(&StorageKey::AuthorizedAssessor(admin), &true);

        Ok(())
    }

    /// Purchase insurance for a prediction market position
    pub fn purchase_insurance(
        env: Env,
        user: Address,
        market_id: String,
        coverage_amount: i128,
        coverage_type: CoverageType,
        coverage_duration_days: u32,
    ) -> Result<String, OrynError> {
        user.require_auth();
        Self::require_not_emergency_shutdown(&env)?;

        // Get market risk assessment
        let risk_assessment = Self::assess_market_risk(&env, &market_id)?;
        
        // Calculate premium based on risk and coverage
        let premium = Self::calculate_premium(
            &env,
            coverage_amount,
            &coverage_type,
            &risk_assessment,
            coverage_duration_days,
        )?;

        // Check user has sufficient balance (would integrate with token contract)
        // For now, assume payment is handled externally

        let policy_id = Self::generate_policy_id(&env, &user, &market_id);
        let current_time = env.ledger().timestamp();
        
        let policy = InsurancePolicy {
            policy_id: policy_id.clone(),
            insured_user: user.clone(),
            market_id: market_id.clone(),
            coverage_amount,
            premium_paid: premium,
            coverage_type,
            policy_start: current_time,
            policy_end: current_time + (coverage_duration_days as u64 * 86400),
            is_active: true,
            claims_made: Vec::new(&env),
            total_claims_paid: 0,
        };

        // Store the policy
        env.storage().persistent().set(
            &StorageKey::InsurancePolicy(user, market_id),
            &policy
        );

        // Update premium collection stats
        Self::update_premium_stats(&env, premium);

        Ok(policy_id)
    }

    /// Submit an insurance claim
    pub fn submit_claim(
        env: Env,
        claimant: Address,
        market_id: String,
        claim_type: ClaimType,
        claim_amount: i128,
        evidence: String,
    ) -> Result<String, OrynError> {
        claimant.require_auth();
        Self::require_not_emergency_shutdown(&env)?;

        // Verify claimant has active insurance policy for this market
        let policy: InsurancePolicy = env.storage().persistent()
            .get(&StorageKey::InsurancePolicy(claimant.clone(), market_id.clone()))
            .ok_or(OrynError::InvalidInput)?;

        if !policy.is_active || env.ledger().timestamp() > policy.policy_end {
            return Err(OrynError::InvalidInput);
        }

        // Verify claim amount doesn't exceed coverage
        if claim_amount > policy.coverage_amount {
            return Err(OrynError::InvalidInput);
        }

        let claim_id = Self::generate_claim_id(&env, &claimant, &market_id);
        
        let claim = Claim {
            claim_id: claim_id.clone(),
            policy_id: policy.policy_id.clone(),
            claimant: claimant.clone(),
            market_id: market_id.clone(),
            claim_type,
            claim_amount,
            evidence,
            submission_timestamp: env.ledger().timestamp(),
            investigation_start: None,
            resolution_timestamp: None,
            status: ClaimStatus::Submitted,
            payout_amount: 0,
            assessor: None,
            investigation_notes: String::from_str(&env, ""),
        };

        env.storage().persistent().set(&StorageKey::InsuranceClaim(claim_id.clone()), &claim);

        Ok(claim_id)
    }

    /// Process insurance claim (assessor only)
    pub fn process_claim(
        env: Env,
        assessor: Address,
        claim_id: String,
        approved: bool,
        payout_amount: i128,
        investigation_notes: String,
    ) -> Result<(), OrynError> {
        Self::require_authorized_assessor(&env, &assessor)?;
        assessor.require_auth();

        let mut claim: Claim = env.storage().persistent()
            .get(&StorageKey::InsuranceClaim(claim_id.clone()))
            .ok_or(OrynError::InvalidInput)?;

        if claim.status != ClaimStatus::Submitted && claim.status != ClaimStatus::UnderInvestigation {
            return Err(OrynError::InvalidInput);
        }

        let current_time = env.ledger().timestamp();
        claim.assessor = Some(assessor);
        claim.investigation_start = Some(current_time);
        claim.resolution_timestamp = Some(current_time);
        claim.investigation_notes = investigation_notes;

        if approved {
            // Verify sufficient pool reserves
            Self::require_sufficient_reserves(&env, payout_amount)?;
            
            claim.status = ClaimStatus::Approved;
            claim.payout_amount = payout_amount;

            // Update the insurance policy
            let mut policy: InsurancePolicy = env.storage().persistent()
                .get(&StorageKey::InsurancePolicy(claim.claimant.clone(), claim.market_id.clone()))
                .unwrap();
            
            policy.claims_made.push_back(claim_id.clone());
            policy.total_claims_paid += payout_amount;

            env.storage().persistent().set(
                &StorageKey::InsurancePolicy(claim.claimant.clone(), claim.market_id.clone()),
                &policy
            );

            // Update claims statistics
            Self::update_claims_stats(&env, payout_amount);

            // Deduct from pool reserves
            Self::deduct_from_reserves(&env, payout_amount)?;
        } else {
            claim.status = ClaimStatus::Denied;
        }

        env.storage().persistent().set(&StorageKey::InsuranceClaim(claim_id), &claim);

        Ok(())
    }

    /// Record oracle failure for risk assessment
    pub fn record_oracle_failure(
        env: Env,
        reporter: Address,
        oracle_address: Address,
        failure_type: String,
        downtime_duration: u64,
    ) -> Result<(), OrynError> {
        // In practice, this would be called by the oracle resolver contract
        reporter.require_auth();

        let mut failure_record: FailureRecord = env.storage().persistent()
            .get(&StorageKey::OracleFailureRecord(oracle_address.clone()))
            .unwrap_or(FailureRecord {
                oracle_address: oracle_address.clone(),
                total_failures: 0,
                last_failure_timestamp: 0,
                failure_types: Map::new(&env),
                average_downtime: 0,
                reputation_impact: 0,
            });

        failure_record.total_failures += 1;
        failure_record.last_failure_timestamp = env.ledger().timestamp();
        
        let current_count = failure_record.failure_types.get(failure_type.clone()).unwrap_or(0);
        failure_record.failure_types.set(failure_type, current_count + 1);
        
        // Update average downtime
        failure_record.average_downtime = (failure_record.average_downtime + downtime_duration) / 2;

        env.storage().persistent().set(
            &StorageKey::OracleFailureRecord(oracle_address),
            &failure_record
        );

        Ok(())
    }

    /// Assess market risk for insurance pricing
    pub fn assess_market_risk(
        env: Env,
        market_id: String,
    ) -> Result<RiskAssessment, OrynError> {
        Self::assess_market_risk(&env, &market_id)
    }

    /// Get insurance policy information
    pub fn get_insurance_policy(
        env: Env,
        user: Address,
        market_id: String,
    ) -> Option<InsurancePolicy> {
        env.storage().persistent().get(&StorageKey::InsurancePolicy(user, market_id))
    }

    /// Get insurance claim information
    pub fn get_claim(env: Env, claim_id: String) -> Option<Claim> {
        env.storage().persistent().get(&StorageKey::InsuranceClaim(claim_id))
    }

    /// Get oracle failure record
    pub fn get_oracle_failure_record(env: Env, oracle: Address) -> Option<FailureRecord> {
        env.storage().persistent().get(&StorageKey::OracleFailureRecord(oracle))
    }

    /// Emergency shutdown (admin only)
    pub fn emergency_shutdown(
        env: Env,
        admin: Address,
        shutdown: bool,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::EmergencyShutdown, &shutdown);
        Ok(())
    }

    /// Authorize insurance assessor (admin only)
    pub fn authorize_assessor(
        env: Env,
        admin: Address,
        assessor: Address,
    ) -> Result<(), OrynError> {
        Self::require_admin(&env, &admin)?;
        admin.require_auth();

        env.storage().persistent().set(&StorageKey::AuthorizedAssessor(assessor), &true);
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

    fn require_authorized_assessor(env: &Env, caller: &Address) -> Result<(), OrynError> {
        let is_authorized: bool = env.storage().persistent()
            .get(&StorageKey::AuthorizedAssessor(caller.clone()))
            .unwrap_or(false);
        if !is_authorized {
            return Err(OrynError::Unauthorized);
        }
        Ok(())
    }

    fn require_not_emergency_shutdown(env: &Env) -> Result<(), OrynError> {
        let is_shutdown: bool = env.storage().persistent()
            .get(&StorageKey::EmergencyShutdown)
            .unwrap_or(false);
        if is_shutdown {
            return Err(OrynError::InvalidInput);
        }
        Ok(())
    }

    fn assess_market_risk(env: &Env, market_id: &String) -> Result<RiskAssessment, OrynError> {
        // In practice, this would integrate with other contracts to assess:
        // - Oracle reputation scores from reputation contract
        // - Market liquidity from AMM pool
        // - Market volatility from historical data
        // - Market age and participant count from factory contract

        // For now, return a placeholder assessment
        let risk_assessment = RiskAssessment {
            market_id: market_id.clone(),
            oracle_reputation_score: 8000, // 80% - placeholder
            liquidity_score: 7500, // 75% - placeholder
            volatility_score: 5000, // 50% - placeholder
            market_age_days: 7, // Placeholder
            participant_count: 50, // Placeholder
            risk_tier: RiskTier::Medium,
            insurance_rate: 100, // 1% - placeholder
            last_assessment: env.ledger().timestamp(),
        };

        Ok(risk_assessment)
    }

    fn calculate_premium(
        env: &Env,
        coverage_amount: i128,
        coverage_type: &CoverageType,
        risk_assessment: &RiskAssessment,
        duration_days: u32,
    ) -> Result<i128, OrynError> {
        let base_rate = env.storage().persistent()
            .get(&StorageKey::InsuranceRate(risk_assessment.risk_tier.clone()))
            .unwrap_or(100_i128);

        // Apply coverage type multiplier
        let type_multiplier = match coverage_type {
            CoverageType::OracleFailure => 100, // 1.0x
            CoverageType::MarketManipulation => 150, // 1.5x
            CoverageType::SmartContractBug => 200, // 2.0x
            CoverageType::LiquidityDrain => 175, // 1.75x
            CoverageType::Comprehensive => 300, // 3.0x (all coverage)
        };

        // Calculate premium: coverage_amount * rate * type_multiplier * duration_factor
        let duration_factor = (duration_days as i128).min(365); // Cap at 1 year
        let premium = (coverage_amount * base_rate * type_multiplier * duration_factor) 
            / (10000 * 100 * 365); // Normalize

        Ok(premium)
    }

    fn require_sufficient_reserves(env: &Env, amount: i128) -> Result<(), OrynError> {
        // Check if insurance pool has sufficient reserves
        // In practice, this would check actual token balances
        Ok(())
    }

    fn update_premium_stats(env: &Env, premium: i128) {
        // Update premium collection statistics
        // Implementation would track total premiums collected, etc.
    }

    fn update_claims_stats(env: &Env, payout: i128) {
        // Update claims payout statistics
        // Implementation would track total payouts, claim ratios, etc.
    }

    fn deduct_from_reserves(env: &Env, amount: i128) -> Result<(), OrynError> {
        // Deduct payout amount from insurance pool reserves
        // In practice, this would interact with token contracts
        Ok(())
    }

    fn generate_policy_id(env: &Env, user: &Address, market_id: &String) -> String {
        // Generate unique policy ID
        String::from_str(env, "policy_placeholder")
    }

    fn generate_claim_id(env: &Env, user: &Address, market_id: &String) -> String {
        // Generate unique claim ID
        String::from_str(env, "claim_placeholder")
    }
}
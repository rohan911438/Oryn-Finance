#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Map, Symbol, Bytes
};

use oryn_shared::{
    Proposal, ProposalType, VoteChoice, OrynError, ProposalCreatedEvent, 
    VoteCastEvent, ProposalExecutedEvent, ContractUpgradedEvent, PRECISION
};

// Contract metadata
contractmeta!(
    key = "Description",
    val = "Oryn Finance Governance - Decentralized platform governance system"
);

/// Storage keys for the governance contract
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// Admin address (initial governance controller)
    Admin,
    /// Governance token contract address
    GovernanceToken,
    /// Proposal counter
    ProposalCounter,
    /// Proposal data: proposal_id -> Proposal
    Proposal(u64),
    /// Vote records: (proposal_id, voter) -> Vote
    Vote(u64, Address),
    /// User staking data: Address -> StakeInfo
    UserStake(Address),
    /// Delegated votes: delegator -> delegatee
    VoteDelegation(Address),
    /// Total staked tokens
    TotalStaked,
    /// Voting parameters
    VotingDelay,
    VotingPeriod,
    QuorumThreshold,
    ApprovalThreshold,
    /// Proposal queue for timelock
    ProposalQueue,
    /// Timelock delay
    TimelockDelay,
    /// Executed proposals tracking
    ExecutedProposals,
    /// Emergency multisig addresses
    EmergencyMultisig,
    /// Paused state
    Paused,
    /// Initialization flag
    Initialized,
    /// Platform parameters that can be governed
    PlatformParams,
}

/// Individual vote record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vote {
    pub voter: Address,
    pub proposal_id: u64,
    pub choice: VoteChoice,
    pub voting_power: i128,
    pub timestamp: u64,
}

/// User staking information
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakeInfo {
    pub staked_amount: i128,
    pub staked_at: u64,
    pub lock_end: u64,
    pub voting_power: i128,
    pub delegated_to: Option<Address>,
    pub rewards_earned: i128,
}

/// Proposal state tracking
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalState {
    Pending,    // Created but voting hasn't started
    Active,     // Voting in progress
    Succeeded,  // Passed and ready for queue
    Queued,     // In timelock queue
    Executed,   // Successfully executed
    Failed,     // Failed to meet quorum or approval threshold
    Cancelled,  // Cancelled by proposer
    Expired,    // Voting period expired without meeting threshold
}

/// Governance parameters
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceConfig {
    pub voting_delay: u64,        // Delay before voting starts (in seconds)
    pub voting_period: u64,       // Voting duration (in seconds)
    pub quorum_threshold: i128,   // Minimum participation (in basis points)
    pub approval_threshold: i128, // Required approval percentage (in basis points)
    pub timelock_delay: u64,     // Execution delay (in seconds)
    pub min_proposal_stake: i128, // Minimum stake to create proposal
}

/// Platform parameters that can be governed
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformParameters {
    pub platform_fee_rate: u32,
    pub min_market_duration: u64,
    pub max_market_duration: u64,
    pub min_liquidity_requirement: i128,
    pub oracle_consensus_threshold: u32,
    pub dispute_period: u64,
    pub emergency_pause_duration: u64,
}

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    /// Initialize the governance contract
    pub fn initialize(
        env: Env,
        admin: Address,
        governance_token: Address,
        config: GovernanceConfig,
        emergency_multisig: Vec<Address>,
        platform_params: PlatformParameters,
    ) -> Result<(), OrynError> {
        // Ensure contract hasn't been initialized
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput);
        }

        admin.require_auth();

        // Store configuration
        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::GovernanceToken, &governance_token);
        env.storage().persistent().set(&StorageKey::ProposalCounter, &0u64);
        env.storage().persistent().set(&StorageKey::VotingDelay, &config.voting_delay);
        env.storage().persistent().set(&StorageKey::VotingPeriod, &config.voting_period);
        env.storage().persistent().set(&StorageKey::QuorumThreshold, &config.quorum_threshold);
        env.storage().persistent().set(&StorageKey::ApprovalThreshold, &config.approval_threshold);
        env.storage().persistent().set(&StorageKey::TimelockDelay, &config.timelock_delay);
        env.storage().persistent().set(&StorageKey::EmergencyMultisig, &emergency_multisig);
        env.storage().persistent().set(&StorageKey::PlatformParams, &platform_params);
        env.storage().persistent().set(&StorageKey::TotalStaked, &0i128);
        env.storage().persistent().set(&StorageKey::ProposalQueue, &Vec::<u64>::new(&env));
        env.storage().persistent().set(&StorageKey::ExecutedProposals, &Vec::<u64>::new(&env));
        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        Ok(())
    }

    /// Stake governance tokens for voting power
    pub fn stake_tokens(env: Env, user: Address, amount: i128, lock_period: u64) -> Result<(), OrynError> {
        user.require_auth();

        if amount <= 0 {
            return Err(OrynError::InvalidInput);
        }

        // Transfer tokens from user to contract
        Self::transfer_governance_tokens_from_user(&env, &user, amount)?;

        let current_time = env.ledger().timestamp();
        let lock_end = current_time + lock_period;

        // Calculate voting power (longer lock = more power)
        let voting_power = Self::calculate_voting_power(amount, lock_period);

        let mut user_stake = env.storage().persistent()
            .get::<StorageKey, StakeInfo>(&StorageKey::UserStake(user.clone()))
            .unwrap_or(StakeInfo {
                staked_amount: 0,
                staked_at: current_time,
                lock_end: current_time,
                voting_power: 0,
                delegated_to: None,
                rewards_earned: 0,
            });

        // Update stake info
        user_stake.staked_amount += amount;
        user_stake.voting_power += voting_power;
        user_stake.lock_end = lock_end.max(user_stake.lock_end);

        env.storage().persistent().set(&StorageKey::UserStake(user), &user_stake);

        // Update total staked
        let mut total_staked: i128 = env.storage().persistent().get(&StorageKey::TotalStaked).unwrap_or(0);
        total_staked += amount;
        env.storage().persistent().set(&StorageKey::TotalStaked, &total_staked);

        Ok(())
    }

    /// Unstake governance tokens
    pub fn unstake_tokens(env: Env, user: Address, amount: i128) -> Result<(), OrynError> {
        user.require_auth();

        let mut user_stake = env.storage().persistent()
            .get::<StorageKey, StakeInfo>(&StorageKey::UserStake(user.clone()))
            .ok_or(OrynError::InsufficientBalance)?;

        let current_time = env.ledger().timestamp();

        // Check if lock period has expired
        if current_time < user_stake.lock_end {
            return Err(OrynError::InvalidInput); // Tokens still locked
        }

        if user_stake.staked_amount < amount {
            return Err(OrynError::InsufficientBalance);
        }

        // Update stake info
        user_stake.staked_amount -= amount;
        user_stake.voting_power = Self::calculate_voting_power(
            user_stake.staked_amount, 
            user_stake.lock_end.saturating_sub(current_time)
        );

        env.storage().persistent().set(&StorageKey::UserStake(user.clone()), &user_stake);

        // Update total staked
        let mut total_staked: i128 = env.storage().persistent().get(&StorageKey::TotalStaked).unwrap_or(0);
        total_staked -= amount;
        env.storage().persistent().set(&StorageKey::TotalStaked, &total_staked);

        // Transfer tokens back to user
        Self::transfer_governance_tokens_to_user(&env, &user, amount)?;

        Ok(())
    }

    /// Create a new proposal
    pub fn propose(
        env: Env,
        proposer: Address,
        proposal_type: ProposalType,
        description: String,
        execution_calldata: Bytes,
        voting_period: Option<u64>,
    ) -> Result<u64, OrynError> {
        proposer.require_auth();

        // Verify proposer has sufficient voting power
        let user_stake = Self::get_user_voting_power(&env, &proposer);
        let min_stake = Self::get_min_proposal_stake(&env);
        if user_stake < min_stake {
            return Err(OrynError::InsufficientVotingPower);
        }

        let current_time = env.ledger().timestamp();
        let proposal_id = Self::get_next_proposal_id(&env);
        
        let voting_delay = Self::get_voting_delay(&env);
        let voting_period = voting_period.unwrap_or_else(|| Self::get_voting_period(&env));
        
        let proposal = Proposal {
            proposal_id,
            proposer: proposer.clone(),
            proposal_type: proposal_type.clone(),
            description: description.clone(),
            execution_calldata,
            voting_period_end: current_time + voting_delay + voting_period,
            for_votes: 0,
            against_votes: 0,
            abstain_votes: 0,
            executed: false,
            cancelled: false,
            created_at: current_time,
        };

        // Store proposal
        env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);

        // Increment proposal counter
        env.storage().persistent().set(&StorageKey::ProposalCounter, &(proposal_id + 1));

        // Emit proposal created event
        env.events().publish((
            symbol_short!("proposal"),
            symbol_short!("created"),
        ), ProposalCreatedEvent {
            proposal_id,
            proposer,
            proposal_type,
            description,
            voting_period_end: proposal.voting_period_end,
        });

        Ok(proposal_id)
    }

    /// Cast a vote on a proposal
    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u64,
        choice: VoteChoice,
        reason: Option<String>,
    ) -> Result<(), OrynError> {
        voter.require_auth();

        // Check if user has already voted
        let vote_key = StorageKey::Vote(proposal_id, voter.clone());
        if env.storage().persistent().has(&vote_key) {
            return Err(OrynError::AlreadyVoted);
        }

        let mut proposal: Proposal = env.storage().persistent()
            .get(&StorageKey::Proposal(proposal_id))
            .ok_or(OrynError::ProposalNotFound)?;

        let current_time = env.ledger().timestamp();

        // Check voting period
        if current_time > proposal.voting_period_end {
            return Err(OrynError::VotingPeriodEnded);
        }

        // Get voting power (including delegated votes)
        let voting_power = Self::get_effective_voting_power(&env, &voter);
        if voting_power <= 0 {
            return Err(OrynError::InsufficientVotingPower);
        }

        // Record vote
        let vote = Vote {
            voter: voter.clone(),
            proposal_id,
            choice: choice.clone(),
            voting_power,
            timestamp: current_time,
        };
        env.storage().persistent().set(&vote_key, &vote);

        // Update proposal vote counts
        match choice {
            VoteChoice::For => proposal.for_votes += voting_power,
            VoteChoice::Against => proposal.against_votes += voting_power,
            VoteChoice::Abstain => proposal.abstain_votes += voting_power,
        }

        env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);

        // Emit vote event
        env.events().publish((
            symbol_short!("vote"),
            symbol_short!("cast"),
        ), VoteCastEvent {
            proposal_id,
            voter,
            choice,
            voting_power,
            timestamp: current_time,
        });

        Ok(())
    }

    /// Queue proposal for execution (after successful vote)
    pub fn queue_proposal(env: Env, proposal_id: u64) -> Result<(), OrynError> {
        let proposal: Proposal = env.storage().persistent()
            .get(&StorageKey::Proposal(proposal_id))
            .ok_or(OrynError::ProposalNotFound)?;

        let current_time = env.ledger().timestamp();

        // Check voting has ended
        if current_time <= proposal.voting_period_end {
            return Err(OrynError::VotingPeriodActive);
        }

        // Check if proposal succeeded
        if !Self::proposal_succeeded(&env, &proposal)? {
            return Err(OrynError::ProposalFailed);
        }

        // Add to queue
        let mut queue: Vec<u64> = env.storage().persistent()
            .get(&StorageKey::ProposalQueue)
            .unwrap_or(Vec::new(&env));
        queue.push_back(proposal_id);
        env.storage().persistent().set(&StorageKey::ProposalQueue, &queue);

        Ok(())
    }

    /// Execute a queued proposal
    pub fn execute_proposal(env: Env, proposal_id: u64) -> Result<(), OrynError> {
        let mut proposal: Proposal = env.storage().persistent()
            .get(&StorageKey::Proposal(proposal_id))
            .ok_or(OrynError::ProposalNotFound)?;

        let current_time = env.ledger().timestamp();

        // Check timelock delay has passed
        let timelock_delay = Self::get_timelock_delay(&env);
        if current_time < proposal.voting_period_end + timelock_delay {
            return Err(OrynError::TimelockActive);
        }

        // Check if already executed
        if proposal.executed {
            return Err(OrynError::ProposalAlreadyExecuted);
        }

        // Execute proposal based on type
        Self::execute_proposal_calldata(&env, &proposal)?;

        // Mark as executed
        proposal.executed = true;
        env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);

        // Add to executed list
        let mut executed: Vec<u64> = env.storage().persistent()
            .get(&StorageKey::ExecutedProposals)
            .unwrap_or(Vec::new(&env));
        executed.push_back(proposal_id);
        env.storage().persistent().set(&StorageKey::ExecutedProposals, &executed);

        // Remove from queue
        let mut queue: Vec<u64> = env.storage().persistent()
            .get(&StorageKey::ProposalQueue)
            .unwrap_or(Vec::new(&env));
        queue.retain(|&id| id != proposal_id);
        env.storage().persistent().set(&StorageKey::ProposalQueue, &queue);

        // Emit execution event
        env.events().publish((
            symbol_short!("proposal"),
            symbol_short!("executed"),
        ), ProposalExecutedEvent {
            proposal_id,
            executor: env.current_contract_address(), // Could track actual executor
            timestamp: current_time,
        });

        Ok(())
    }

    /// Cancel proposal (only proposer)
    pub fn cancel_proposal(env: Env, proposer: Address, proposal_id: u64) -> Result<(), OrynError> {
        proposer.require_auth();

        let mut proposal: Proposal = env.storage().persistent()
            .get(&StorageKey::Proposal(proposal_id))
            .ok_or(OrynError::ProposalNotFound)?;

        // Verify proposer
        if proposal.proposer != proposer {
            return Err(OrynError::Unauthorized);
        }

        // Check not already executed
        if proposal.executed {
            return Err(OrynError::ProposalAlreadyExecuted);
        }

        proposal.cancelled = true;
        env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);

        Ok(())
    }

    /// Delegate voting power to another address
    pub fn delegate_votes(env: Env, delegator: Address, delegatee: Address) -> Result<(), OrynError> {
        delegator.require_auth();

        env.storage().persistent().set(&StorageKey::VoteDelegation(delegator), &delegatee);
        Ok(())
    }

    /// Remove vote delegation
    pub fn undelegate_votes(env: Env, delegator: Address) -> Result<(), OrynError> {
        delegator.require_auth();

        env.storage().persistent().remove(&StorageKey::VoteDelegation(delegator));
        Ok(())
    }

    /// Get proposal state
    pub fn get_proposal_state(env: Env, proposal_id: u64) -> Result<ProposalState, OrynError> {
        let proposal: Proposal = env.storage().persistent()
            .get(&StorageKey::Proposal(proposal_id))
            .ok_or(OrynError::ProposalNotFound)?;

        let current_time = env.ledger().timestamp();

        if proposal.cancelled {
            return Ok(ProposalState::Cancelled);
        }

        if proposal.executed {
            return Ok(ProposalState::Executed);
        }

        if current_time <= proposal.voting_period_end {
            return Ok(ProposalState::Active);
        }

        let succeeded = Self::proposal_succeeded(&env, &proposal)?;
        if !succeeded {
            return Ok(ProposalState::Failed);
        }

        // Check if in timelock queue
        let queue: Vec<u64> = env.storage().persistent()
            .get(&StorageKey::ProposalQueue)
            .unwrap_or(Vec::new(&env));
        
        if queue.contains(&proposal_id) {
            return Ok(ProposalState::Queued);
        }

        Ok(ProposalState::Succeeded)
    }

    /// Get proposal details
    pub fn get_proposal(env: Env, proposal_id: u64) -> Result<Proposal, OrynError> {
        env.storage().persistent()
            .get(&StorageKey::Proposal(proposal_id))
            .ok_or(OrynError::ProposalNotFound)
    }

    /// Get user's voting power
    pub fn get_user_voting_power(env: Env, user: Address) -> i128 {
        let stake_info = env.storage().persistent()
            .get::<StorageKey, StakeInfo>(&StorageKey::UserStake(user))
            .unwrap_or(StakeInfo {
                staked_amount: 0,
                staked_at: 0,
                lock_end: 0,
                voting_power: 0,
                delegated_to: None,
                rewards_earned: 0,
            });

        stake_info.voting_power
    }

    /// Get effective voting power (including delegated votes)
    pub fn get_effective_voting_power(env: Env, user: Address) -> i128 {
        let mut total_power = Self::get_user_voting_power(env.clone(), user.clone());

        // Add delegated votes (this would require tracking delegators)
        // For simplicity, just return user's own voting power
        total_power
    }

    /// Emergency pause (multisig only)
    pub fn emergency_pause(env: Env, multisig_members: Vec<Address>) -> Result<(), OrynError> {
        Self::require_multisig_consensus(&env, &multisig_members)?;

        env.storage().persistent().set(&StorageKey::Paused, &true);
        Ok(())
    }

    /// Update governance configuration (only through governance)
    pub fn update_governance_config(
        env: Env,
        new_config: GovernanceConfig,
    ) -> Result<(), OrynError> {
        // This function can only be called via successful governance proposal
        // Implementation would verify the caller is the governance contract itself

        env.storage().persistent().set(&StorageKey::VotingDelay, &new_config.voting_delay);
        env.storage().persistent().set(&StorageKey::VotingPeriod, &new_config.voting_period);
        env.storage().persistent().set(&StorageKey::QuorumThreshold, &new_config.quorum_threshold);
        env.storage().persistent().set(&StorageKey::ApprovalThreshold, &new_config.approval_threshold);
        env.storage().persistent().set(&StorageKey::TimelockDelay, &new_config.timelock_delay);

        Ok(())
    }

    /// Update platform parameters (only through governance)
    pub fn update_platform_parameters(
        env: Env,
        new_params: PlatformParameters,
    ) -> Result<(), OrynError> {
        // This function can only be called via successful governance proposal
        env.storage().persistent().set(&StorageKey::PlatformParams, &new_params);
        Ok(())
    }

    // Internal helper functions

    fn get_next_proposal_id(env: &Env) -> u64 {
        let counter: u64 = env.storage().persistent().get(&StorageKey::ProposalCounter).unwrap_or(0);
        counter + 1
    }

    fn get_voting_delay(env: &Env) -> u64 {
        env.storage().persistent().get(&StorageKey::VotingDelay).unwrap_or(86400) // 1 day default
    }

    fn get_voting_period(env: &Env) -> u64 {
        env.storage().persistent().get(&StorageKey::VotingPeriod).unwrap_or(259200) // 3 days default
    }

    fn get_timelock_delay(env: &Env) -> u64 {
        env.storage().persistent().get(&StorageKey::TimelockDelay).unwrap_or(172800) // 2 days default
    }

    fn get_min_proposal_stake(env: &Env) -> i128 {
        1000 * PRECISION // 1000 tokens minimum
    }

    fn calculate_voting_power(amount: i128, lock_period: u64) -> i128 {
        // Base voting power is 1:1 with staked amount
        // Longer lock periods provide bonus multiplier
        let base_power = amount;
        let bonus_multiplier = match lock_period {
            0..=86400 => 100,          // 1 day: 1x
            86401..=604800 => 125,     // 1 week: 1.25x
            604801..=2592000 => 150,   // 1 month: 1.5x
            2592001..=31536000 => 200, // 1 year: 2x
            _ => 250,                  // >1 year: 2.5x
        };
        
        base_power * bonus_multiplier / 100
    }

    fn proposal_succeeded(env: &Env, proposal: &Proposal) -> Result<bool, OrynError> {
        let total_votes = proposal.for_votes + proposal.against_votes + proposal.abstain_votes;
        let total_staked = env.storage().persistent().get::<StorageKey, i128>(&StorageKey::TotalStaked).unwrap_or(0);
        
        if total_staked == 0 {
            return Ok(false);
        }

        // Check quorum
        let quorum_threshold = env.storage().persistent().get::<StorageKey, i128>(&StorageKey::QuorumThreshold).unwrap_or(1000); // 10% default
        let quorum_required = total_staked * quorum_threshold / 10000;
        
        if total_votes < quorum_required {
            return Ok(false);
        }

        // Check approval threshold
        let approval_threshold = env.storage().persistent().get::<StorageKey, i128>(&StorageKey::ApprovalThreshold).unwrap_or(5000); // 50% default
        let approval_required = total_votes * approval_threshold / 10000;
        
        Ok(proposal.for_votes >= approval_required)
    }

    fn execute_proposal_calldata(env: &Env, proposal: &Proposal) -> Result<(), OrynError> {
        match proposal.proposal_type {
            ProposalType::ParameterChange => {
                // Execute parameter changes
                Self::execute_parameter_change(env, &proposal.execution_calldata)?;
            },
            ProposalType::OracleAddition => {
                // Add new oracle
                Self::execute_oracle_addition(env, &proposal.execution_calldata)?;
            },
            ProposalType::EmergencyAction => {
                // Execute emergency action
                Self::execute_emergency_action(env, &proposal.execution_calldata)?;
            },
            ProposalType::UpgradeContract => {
                // Upgrade contract
                Self::execute_contract_upgrade(env, &proposal.execution_calldata)?;
            }
        }
        Ok(())
    }

    fn require_multisig_consensus(env: &Env, signers: &Vec<Address>) -> Result<(), OrynError> {
        let emergency_multisig: Vec<Address> = env.storage().persistent()
            .get(&StorageKey::EmergencyMultisig)
            .unwrap_or(Vec::new(env));

        let required_signatures = (emergency_multisig.len() * 2) / 3 + 1; // 2/3 + 1 threshold
        
        if signers.len() < required_signatures {
            return Err(OrynError::InsufficientSignatures);
        }

        // Verify all signers are in multisig
        for signer in signers.iter() {
            if !emergency_multisig.contains(&signer.unwrap()) {
                return Err(OrynError::Unauthorized);
            }
        }

        Ok(())
    }

    // Placeholder implementation for proposal execution functions
    fn execute_parameter_change(env: &Env, calldata: &Bytes) -> Result<(), OrynError> {
        // Decode and execute parameter changes
        Ok(())
    }

    fn execute_oracle_addition(env: &Env, calldata: &Bytes) -> Result<(), OrynError> {
        // Decode and execute oracle addition
        Ok(())
    }

    fn execute_emergency_action(env: &Env, calldata: &Bytes) -> Result<(), OrynError> {
        // Decode and execute emergency action
        Ok(())
    }

    fn execute_contract_upgrade(env: &Env, calldata: &Bytes) -> Result<(), OrynError> {
        // Decode and execute contract upgrade
        Ok(())
    }

    // Placeholder functions for token operations
    fn transfer_governance_tokens_from_user(env: &Env, user: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer governance tokens from user to contract
        Ok(())
    }

    fn transfer_governance_tokens_to_user(env: &Env, user: &Address, amount: i128) -> Result<(), OrynError> {
        // Transfer governance tokens from contract to user
        Ok(())
    }
}
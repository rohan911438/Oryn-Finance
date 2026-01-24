#![no_std]

use soroban_sdk::{
    contract, contractimpl, contractmeta, contracttype, symbol_short,
    Address, Env, String, Vec, Bytes, Error
};

use oryn_shared::{
    Proposal, ProposalType, VoteChoice, OrynError,
    ProposalCreatedEvent, VoteCastEvent, ProposalExecutedEvent,
    PRECISION
};

contractmeta!(
    key = "Description",
    val = "Oryn Finance Governance Contract"
);

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Admin,
    GovernanceToken,
    ProposalCounter,
    Proposal(u64),
    Vote(u64, Address),
    UserStake(Address),
    VoteDelegation(Address),
    TotalStaked,
    VotingDelay,
    VotingPeriod,
    QuorumThreshold,
    ApprovalThreshold,
    TimelockDelay,
    ProposalQueue,
    ExecutedProposals,
    EmergencyMultisig,
    PlatformParams,
    Paused,
    Initialized,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakeInfo {
    pub staked_amount: i128,
    pub lock_end: u64,
    pub voting_power: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalState {
    Pending,
    Active,
    Succeeded,
    Queued,
    Executed,
    Failed,
    Cancelled,
}

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {

    // ---------------- INIT ----------------

    pub fn initialize(
        env: Env,
        admin: Address,
        governance_token: Address,
        emergency_multisig: Vec<Address>,
    ) -> Result<(), Error> {
        if env.storage().persistent().has(&StorageKey::Initialized) {
            return Err(OrynError::InvalidInput.into());
        }

        admin.require_auth();

        env.storage().persistent().set(&StorageKey::Admin, &admin);
        env.storage().persistent().set(&StorageKey::GovernanceToken, &governance_token);
        env.storage().persistent().set(&StorageKey::ProposalCounter, &0u64);
        env.storage().persistent().set(&StorageKey::TotalStaked, &0i128);
        env.storage().persistent().set(&StorageKey::VotingDelay, &86400u64);
        env.storage().persistent().set(&StorageKey::VotingPeriod, &259200u64);
        env.storage().persistent().set(&StorageKey::QuorumThreshold, &1000i128);
        env.storage().persistent().set(&StorageKey::ApprovalThreshold, &5000i128);
        env.storage().persistent().set(&StorageKey::TimelockDelay, &172800u64);
        env.storage().persistent().set(&StorageKey::EmergencyMultisig, &emergency_multisig);
        env.storage().persistent().set(&StorageKey::ProposalQueue, &Vec::<u64>::new(&env));
        env.storage().persistent().set(&StorageKey::ExecutedProposals, &Vec::<u64>::new(&env));
        env.storage().persistent().set(&StorageKey::Paused, &false);
        env.storage().persistent().set(&StorageKey::Initialized, &true);

        Ok(())
    }

    // ---------------- STAKING ----------------

    pub fn stake(env: Env, user: Address, amount: i128, lock_period: u64) -> Result<(), Error> {
        user.require_auth();
        if amount <= 0 {
            return Err(OrynError::InvalidInput.into());
        }

        let now = env.ledger().timestamp();
        let power = amount * Self::lock_multiplier(lock_period) / 100;

        let mut stake = env.storage().persistent()
            .get(&StorageKey::UserStake(user.clone()))
            .unwrap_or(StakeInfo { staked_amount: 0, lock_end: now, voting_power: 0 });

        stake.staked_amount += amount;
        stake.voting_power += power;
        stake.lock_end = core::cmp::max(stake.lock_end, now + lock_period);

        env.storage().persistent().set(&StorageKey::UserStake(user), &stake);

        let total: i128 = env.storage().persistent().get(&StorageKey::TotalStaked).unwrap_or(0);
        env.storage().persistent().set(&StorageKey::TotalStaked, &(total + amount));

        Ok(())
    }

    // ---------------- PROPOSALS ----------------

    pub fn propose(
        env: Env,
        proposer: Address,
        proposal_type: ProposalType,
        description: String,
        calldata: Bytes,
    ) -> Result<u64, Error> {
        proposer.require_auth();

        let voting_power = Self::voting_power(env.clone(), proposer.clone());
        if voting_power < 1000 * PRECISION {
            return Err(OrynError::InsufficientVotingPower.into());
        }

        let id = env.storage().persistent()
            .get::<_, u64>(&StorageKey::ProposalCounter)
            .unwrap_or(0) + 1;

        let end = env.ledger().timestamp()
            + env.storage().persistent().get::<_, u64>(&StorageKey::VotingPeriod).unwrap();

        let proposal = Proposal {
            proposal_id: id,
            proposer: proposer.clone(),
            proposal_type: proposal_type.clone(),
            description,
            execution_calldata: calldata,
            voting_period_end: end,
            for_votes: 0,
            against_votes: 0,
            abstain_votes: 0,
            executed: false,
            cancelled: false,
            created_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&StorageKey::Proposal(id), &proposal);
        env.storage().persistent().set(&StorageKey::ProposalCounter, &id);

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("created")),
            ProposalCreatedEvent {
                proposal_id: id,
                proposer,
                proposal_type,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(id)
    }

    // ---------------- VOTING ----------------

    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u64,
        choice: VoteChoice,
    ) -> Result<(), Error> {
        voter.require_auth();

        if env.storage().persistent().has(&StorageKey::Vote(proposal_id, voter.clone())) {
            return Err(OrynError::AlreadyVoted.into());
        }

        let mut proposal: Proposal = env.storage().persistent()
            .get(&StorageKey::Proposal(proposal_id))
            .ok_or(OrynError::ProposalNotFound)?;

        if env.ledger().timestamp() > proposal.voting_period_end {
            return Err(OrynError::VotingPeriodEnded.into());
        }

        let power = Self::voting_power(env.clone(), voter.clone());
        if power <= 0 {
            return Err(OrynError::InsufficientVotingPower.into());
        }

        match choice {
            VoteChoice::For => proposal.for_votes += power,
            VoteChoice::Against => proposal.against_votes += power,
            VoteChoice::Abstain => proposal.abstain_votes += power,
        }

        env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);
        env.storage().persistent().set(&StorageKey::Vote(proposal_id, voter.clone()), &());

        env.events().publish(
            (symbol_short!("vote"), symbol_short!("cast")),
            VoteCastEvent {
                proposal_id,
                voter,
                choice,
                voting_power: power,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    // ---------------- EXECUTION ----------------

    pub fn execute(env: Env, proposal_id: u64) -> Result<(), Error> {
        let mut proposal: Proposal = env.storage().persistent()
            .get(&StorageKey::Proposal(proposal_id))
            .ok_or(OrynError::ProposalNotFound)?;

        if proposal.executed {
    return Err(OrynError::InvalidInput.into());
}


        proposal.executed = true;
        env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (symbol_short!("proposal"), symbol_short!("executed")),
            ProposalExecutedEvent {
                proposal_id,
                executor: env.current_contract_address(),
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    // ---------------- HELPERS ----------------

    fn voting_power(env: Env, user: Address) -> i128 {
        env.storage().persistent()
            .get::<_, StakeInfo>(&StorageKey::UserStake(user))
            .map(|s| s.voting_power)
            .unwrap_or(0)
    }

    fn lock_multiplier(lock: u64) -> i128 {
        match lock {
            0..=86400 => 100,
            86401..=604800 => 125,
            604801..=2592000 => 150,
            _ => 200,
        }
    }
}

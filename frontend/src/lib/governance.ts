export type GovernanceVoteChoice = 'YES' | 'NO' | 'ABSTAIN';
export type GovernanceProposalStatus = 'active' | 'ended' | 'executed';

export interface IndexedGovernanceEvent {
  topic?: string;
  txHash?: string;
  ledger?: number;
  createdAt?: string;
  payload?: Record<string, any>;
}

export interface GovernanceVote {
  voter: string;
  choice: GovernanceVoteChoice;
  weight: number;
  txHash?: string;
  createdAt?: string | null;
}

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposer: string | null;
  createdAt: string | null;
  deadline: string | null;
  executedAt: string | null;
  status: GovernanceProposalStatus;
  yesVotes: number;
  noVotes: number;
  abstainVotes: number;
  totalVotes: number;
  yesShare: number;
  noShare: number;
  abstainShare: number;
  votes: GovernanceVote[];
}

const PROPOSAL_ID_KEYS = ['proposalId', 'proposalID', 'proposal_id', 'id'];
const TITLE_KEYS = ['title', 'name', 'question', 'summary'];
const DESCRIPTION_KEYS = ['description', 'details', 'reason', 'content'];
const PROPOSER_KEYS = ['proposer', 'creator', 'author', 'owner', 'user'];
const DEADLINE_KEYS = ['deadline', 'endTime', 'endAt', 'expiresAt', 'expiryTimestamp'];
const CREATED_AT_KEYS = ['createdAt', 'startTime', 'created_at', 'timestamp'];
const EXECUTED_AT_KEYS = ['executedAt', 'executed_at', 'completedAt'];
const CHOICE_KEYS = ['choice', 'vote', 'side', 'selection'];
const VOTER_KEYS = ['voter', 'user', 'walletAddress', 'address'];
const WEIGHT_KEYS = ['weight', 'votingPower', 'stake', 'amount', 'votes'];

function getValue(payload: Record<string, any> | undefined, keys: string[]) {
  if (!payload) {
    return undefined;
  }

  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      return payload[key];
    }
  }

  return undefined;
}

function toDateString(value: unknown): string | null {
  if (!value && value !== 0) {
    return null;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === 'number') {
    const normalized = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeChoice(value: unknown): GovernanceVoteChoice | null {
  const normalized = String(value || '').toUpperCase();

  if (normalized === 'YES' || normalized === 'NO' || normalized === 'ABSTAIN') {
    return normalized;
  }

  return null;
}

function defaultProposal(id: string): GovernanceProposal {
  return {
    id,
    title: `Proposal #${id}`,
    description: 'Governance proposal details are not available from the indexed event payload yet.',
    proposer: null,
    createdAt: null,
    deadline: null,
    executedAt: null,
    status: 'active',
    yesVotes: 0,
    noVotes: 0,
    abstainVotes: 0,
    totalVotes: 0,
    yesShare: 0,
    noShare: 0,
    abstainShare: 0,
    votes: [],
  };
}

function sortByRecency(a: GovernanceProposal, b: GovernanceProposal) {
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bTime - aTime;
}

export function buildGovernanceProposals(events: IndexedGovernanceEvent[] = []): GovernanceProposal[] {
  const proposals = new Map<string, GovernanceProposal>();

  for (const event of events) {
    const payload = event.payload || {};
    const rawProposalId = getValue(payload, PROPOSAL_ID_KEYS) ?? event.txHash;

    if (!rawProposalId) {
      continue;
    }

    const proposalId = String(rawProposalId);
    const current = proposals.get(proposalId) || defaultProposal(proposalId);

    if (event.topic === 'proposal_created') {
      current.title = String(getValue(payload, TITLE_KEYS) || current.title);
      current.description = String(getValue(payload, DESCRIPTION_KEYS) || current.description);
      current.proposer = String(getValue(payload, PROPOSER_KEYS) || current.proposer || '') || null;
      current.createdAt =
        toDateString(getValue(payload, CREATED_AT_KEYS)) ||
        event.createdAt ||
        current.createdAt;
      current.deadline = toDateString(getValue(payload, DEADLINE_KEYS)) || current.deadline;
    }

    if (event.topic === 'vote_cast') {
      const choice = normalizeChoice(getValue(payload, CHOICE_KEYS));
      if (!choice) {
        proposals.set(proposalId, current);
        continue;
      }

      const voter = String(getValue(payload, VOTER_KEYS) || 'unknown');
      const weight = toNumber(getValue(payload, WEIGHT_KEYS), 1);
      const existingVoteIndex = current.votes.findIndex(
        (vote) => vote.voter.toLowerCase() === voter.toLowerCase()
      );
      const nextVote: GovernanceVote = {
        voter,
        choice,
        weight,
        txHash: event.txHash,
        createdAt: event.createdAt || null,
      };

      if (existingVoteIndex >= 0) {
        current.votes[existingVoteIndex] = nextVote;
      } else {
        current.votes.push(nextVote);
      }
    }

    if (event.topic === 'proposal_executed') {
      current.status = 'executed';
      current.executedAt =
        toDateString(getValue(payload, EXECUTED_AT_KEYS)) ||
        event.createdAt ||
        current.executedAt;
    }

    proposals.set(proposalId, current);
  }

  const now = Date.now();

  return Array.from(proposals.values())
    .map((proposal) => {
      const yesVotes = proposal.votes
        .filter((vote) => vote.choice === 'YES')
        .reduce((sum, vote) => sum + vote.weight, 0);
      const noVotes = proposal.votes
        .filter((vote) => vote.choice === 'NO')
        .reduce((sum, vote) => sum + vote.weight, 0);
      const abstainVotes = proposal.votes
        .filter((vote) => vote.choice === 'ABSTAIN')
        .reduce((sum, vote) => sum + vote.weight, 0);
      const totalVotes = yesVotes + noVotes + abstainVotes;
      const deadlineMs = proposal.deadline ? new Date(proposal.deadline).getTime() : null;

      return {
        ...proposal,
        status:
          proposal.status === 'executed'
            ? 'executed'
            : deadlineMs && deadlineMs < now
              ? 'ended'
              : 'active',
        yesVotes,
        noVotes,
        abstainVotes,
        totalVotes,
        yesShare: totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0,
        noShare: totalVotes > 0 ? (noVotes / totalVotes) * 100 : 0,
        abstainShare: totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : 0,
      };
    })
    .sort(sortByRecency);
}

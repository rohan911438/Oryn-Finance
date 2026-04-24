import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCcw, ShieldCheck, Vote, Wallet } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { MagicCard } from '@/components/magicui/magic-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWallet } from '@/contexts/WalletContext';
import { type GovernanceProposal, type GovernanceVoteChoice } from '@/lib/governance';
import { contractService } from '@/services/contractService';
import { toast } from 'sonner';

const voteOptions: GovernanceVoteChoice[] = ['YES', 'NO', 'ABSTAIN'];

const statusStyles: Record<GovernanceProposal['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  ended: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  executed: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};

const voteStyles: Record<GovernanceVoteChoice, string> = {
  YES: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  NO: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  ABSTAIN: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
};

const barStyles: Record<GovernanceVoteChoice, string> = {
  YES: 'bg-emerald-400',
  NO: 'bg-rose-400',
  ABSTAIN: 'bg-slate-300',
};

function formatDate(value: string | null) {
  if (!value) {
    return 'Not specified';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function truncateAddress(value: string | null) {
  if (!value) {
    return 'Unknown';
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function applyOptimisticVote(
  proposals: GovernanceProposal[],
  proposalId: string,
  walletAddress: string,
  choice: GovernanceVoteChoice
) {
  return proposals.map((proposal) => {
    if (proposal.id !== proposalId) {
      return proposal;
    }

    const filteredVotes = proposal.votes.filter(
      (vote) => vote.voter.toLowerCase() !== walletAddress.toLowerCase()
    );
    const nextVotes = [
      ...filteredVotes,
      {
        voter: walletAddress,
        choice,
        weight: 1,
        createdAt: new Date().toISOString(),
      },
    ];

    const yesVotes = nextVotes.filter((vote) => vote.choice === 'YES').reduce((sum, vote) => sum + vote.weight, 0);
    const noVotes = nextVotes.filter((vote) => vote.choice === 'NO').reduce((sum, vote) => sum + vote.weight, 0);
    const abstainVotes = nextVotes.filter((vote) => vote.choice === 'ABSTAIN').reduce((sum, vote) => sum + vote.weight, 0);
    const totalVotes = yesVotes + noVotes + abstainVotes;

    return {
      ...proposal,
      votes: nextVotes,
      yesVotes,
      noVotes,
      abstainVotes,
      totalVotes,
      yesShare: totalVotes ? (yesVotes / totalVotes) * 100 : 0,
      noShare: totalVotes ? (noVotes / totalVotes) * 100 : 0,
      abstainShare: totalVotes ? (abstainVotes / totalVotes) * 100 : 0,
    };
  });
}

export default function Governance() {
  const { isConnected, connect, publicKey, signTransaction } = useWallet();
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeVoteKey, setActiveVoteKey] = useState<string | null>(null);

  const loadProposals = useCallback(async (background = false) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const nextProposals = await contractService.getGovernanceProposals();
      setProposals(nextProposals);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load governance proposals');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const stats = useMemo(() => {
    const active = proposals.filter((proposal) => proposal.status === 'active').length;
    const executed = proposals.filter((proposal) => proposal.status === 'executed').length;
    const votes = proposals.reduce((sum, proposal) => sum + proposal.totalVotes, 0);

    return { total: proposals.length, active, executed, votes };
  }, [proposals]);

  const userVotes = useMemo(() => {
    if (!publicKey) {
      return new Map<string, GovernanceVoteChoice>();
    }

    const voteMap = new Map<string, GovernanceVoteChoice>();

    for (const proposal of proposals) {
      const matchingVote = proposal.votes.find(
        (vote) => vote.voter.toLowerCase() === publicKey.toLowerCase()
      );
      if (matchingVote) {
        voteMap.set(proposal.id, matchingVote.choice);
      }
    }

    return voteMap;
  }, [proposals, publicKey]);

  const handleVote = async (proposalId: string, choice: GovernanceVoteChoice) => {
    if (!isConnected || !publicKey) {
      try {
        await connect();
        toast.info('Wallet connected. Submit the vote again to sign the transaction.');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Wallet connection failed');
      }
      return;
    }

    const voteKey = `${proposalId}:${choice}`;
    setActiveVoteKey(voteKey);

    try {
      const result = await contractService.voteOnProposal(proposalId, choice, signTransaction, publicKey);
      setProposals((current) => applyOptimisticVote(current, proposalId, publicKey, choice));
      toast.success('Vote submitted', {
        description: result?.transactionHash
          ? `Transaction ${result.transactionHash.slice(0, 12)}... is pending confirmation.`
          : `Your ${choice} vote was submitted.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit vote');
    } finally {
      setActiveVoteKey(null);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge className="mb-4 border-primary/30 bg-primary/10 text-primary">Governance</Badge>
            <h1 className="text-3xl font-bold md:text-5xl">Vote on protocol proposals</h1>
            <p className="mt-4 text-base text-muted-foreground md:text-lg">
              Review indexed governance proposals, cast wallet-signed votes, and monitor YES / NO / ABSTAIN results in one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => void loadProposals(true)}>
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Button className="btn-primary-gradient" onClick={() => (!isConnected ? connect() : Promise.resolve())}>
              <Wallet className="mr-2 h-4 w-4" />
              {isConnected ? 'Wallet Connected' : 'Connect Wallet'}
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total proposals', value: stats.total, icon: ShieldCheck },
            { label: 'Active proposals', value: stats.active, icon: Vote },
            { label: 'Executed proposals', value: stats.executed, icon: CheckCircle2 },
            { label: 'Votes indexed', value: stats.votes, icon: Wallet },
          ].map((item) => (
            <MagicCard key={item.label} className="rounded-3xl border border-white/10 bg-black/30 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-3xl font-semibold">{item.value}</p>
                </div>
                <item.icon className="h-5 w-5 text-primary" />
              </div>
            </MagicCard>
          ))}
        </div>

        <div className="mt-8 space-y-6">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
                <div className="mt-4 h-4 w-full animate-pulse rounded bg-white/10" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-white/10" />
                <div className="mt-6 grid gap-2 md:grid-cols-3">
                  {Array.from({ length: 3 }).map((__, barIndex) => (
                    <div key={barIndex} className="h-16 animate-pulse rounded-2xl bg-white/10" />
                  ))}
                </div>
              </div>
            ))
          ) : proposals.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
              <h2 className="text-xl font-semibold">No governance proposals indexed yet</h2>
              <p className="mt-3 text-muted-foreground">
                The governance contract is deployed, but proposal events have not been indexed into the analytics store yet.
              </p>
            </div>
          ) : (
            proposals.map((proposal) => {
              const userVote = userVotes.get(proposal.id);

              return (
                <MagicCard key={proposal.id} className="rounded-3xl border border-white/10 bg-black/30 p-6">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-semibold">{proposal.title}</h2>
                        <Badge className={cn('border', statusStyles[proposal.status])}>
                          {proposal.status.toUpperCase()}
                        </Badge>
                        {userVote && (
                          <Badge className={cn('border', voteStyles[userVote])}>
                            Your vote: {userVote}
                          </Badge>
                        )}
                      </div>

                      <p className="mt-4 text-muted-foreground">{proposal.description}</p>

                      <div className="mt-5 grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground/70">Proposal ID</p>
                          <p className="mt-1 text-foreground">{proposal.id}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground/70">Proposer</p>
                          <p className="mt-1 text-foreground">{truncateAddress(proposal.proposer)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground/70">Created</p>
                          <p className="mt-1 text-foreground">{formatDate(proposal.createdAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground/70">
                            {proposal.status === 'executed' ? 'Executed' : 'Deadline'}
                          </p>
                          <p className="mt-1 text-foreground">
                            {formatDate(proposal.status === 'executed' ? proposal.executedAt : proposal.deadline)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="w-full xl:max-w-sm">
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Results</p>
                            <p className="text-2xl font-semibold">{proposal.totalVotes} votes</p>
                          </div>
                          <Vote className="h-5 w-5 text-primary" />
                        </div>

                        <div className="space-y-3">
                          {voteOptions.map((choice) => {
                            const count =
                              choice === 'YES'
                                ? proposal.yesVotes
                                : choice === 'NO'
                                  ? proposal.noVotes
                                  : proposal.abstainVotes;
                            const share =
                              choice === 'YES'
                                ? proposal.yesShare
                                : choice === 'NO'
                                  ? proposal.noShare
                                  : proposal.abstainShare;

                            return (
                              <div key={choice}>
                                <div className="mb-1 flex items-center justify-between text-sm">
                                  <span>{choice}</span>
                                  <span className="text-muted-foreground">
                                    {count} • {share.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-white/10">
                                  <div
                                    className={cn('h-2 rounded-full transition-all', barStyles[choice])}
                                    style={{ width: `${Math.max(share, proposal.totalVotes > 0 ? 4 : 0)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-2">
                          {voteOptions.map((choice) => {
                            const voteKey = `${proposal.id}:${choice}`;
                            const isPending = activeVoteKey === voteKey;
                            const disabled = proposal.status !== 'active' || !!activeVoteKey;

                            return (
                              <Button
                                key={choice}
                                variant="outline"
                                disabled={disabled}
                                className={cn(
                                  'border-white/10 bg-transparent',
                                  userVote === choice && voteStyles[choice]
                                )}
                                onClick={() => void handleVote(proposal.id, choice)}
                              >
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {choice}
                              </Button>
                            );
                          })}
                        </div>

                        {proposal.status !== 'active' && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Voting is closed for this proposal.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </MagicCard>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}

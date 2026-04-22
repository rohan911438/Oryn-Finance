import { useEffect, useState } from 'react';
import { useContracts } from '@/hooks/use-contracts';
import { useWallet } from '@/contexts/WalletContext';
import { apiService } from '@/services/apiService';

type GovernanceProposal = {
  proposalId: number;
  title: string;
  description: string;
  status: string;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
};

const Governance = () => {
  const { voteOnProposal, isConnected } = useContracts();
  const { connect } = useWallet();
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [loadingProposal, setLoadingProposal] = useState<number | null>(null);
  const [isLoadingProposals, setIsLoadingProposals] = useState(true);
  const [proposalsError, setProposalsError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadProposals = async () => {
      try {
        setIsLoadingProposals(true);
        setProposalsError(null);
        const data = await apiService.governance.getProposals();
        if (isMounted) {
          setProposals(data as GovernanceProposal[]);
        }
      } catch (error) {
        if (isMounted) {
          setProposalsError(error instanceof Error ? error.message : 'Failed to load proposals');
        }
      } finally {
        if (isMounted) {
          setIsLoadingProposals(false);
        }
      }
    };

    loadProposals();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleVote = async (proposalId: number, choice: 'YES' | 'NO' | 'ABSTAIN') => {
    setLoadingProposal(proposalId);
    try {
      await voteOnProposal(proposalId, choice);
    } finally {
      setLoadingProposal(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 rounded-3xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-primary mb-3">Governance</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Cast your vote on governance proposals using the on-chain governance contract.
        </p>
      </div>

      {isLoadingProposals ? (
        <p className="text-sm text-muted-foreground">Loading proposals...</p>
      ) : proposalsError ? (
        <p className="text-sm text-destructive">{proposalsError}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {proposals.map((proposal) => (
            <div
              key={proposal.proposalId}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">
                    Proposal {proposal.proposalId}
                  </p>
                  <h2 className="text-xl font-semibold text-foreground">{proposal.title}</h2>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                  {proposal.status}
                </span>
              </div>

              <p className="mb-6 text-sm leading-6 text-muted-foreground">{proposal.description}</p>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-background p-4 text-center">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">For</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{proposal.forVotes}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 text-center">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Against</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{proposal.againstVotes}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 text-center">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Abstain</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{proposal.abstainVotes}</p>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                {!isConnected ? (
                  <button
                    onClick={() => connect()}
                    className="w-full py-2 bg-primary text-primary-foreground rounded-md font-bold hover:opacity-90 transition-all"
                  >
                    Connect Wallet to Vote
                  </button>
                ) : (
                  <>
                    {[
                      { label: 'For', choice: 'YES' as const, variant: 'bg-primary text-primary-foreground' },
                      { label: 'Against', choice: 'NO' as const, variant: 'bg-destructive text-destructive-foreground' },
                      { label: 'Abstain', choice: 'ABSTAIN' as const, variant: 'bg-secondary text-secondary-foreground' },
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        disabled={loadingProposal === proposal.proposalId}
                        onClick={() => handleVote(proposal.proposalId, btn.choice)}
                        className={`px-4 py-2 rounded-md font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${btn.variant}`}
                      >
                        {loadingProposal === proposal.proposalId ? 'Voting...' : btn.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Governance;

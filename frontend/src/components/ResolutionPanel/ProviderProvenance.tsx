// Oracle Data Provenance & Verification Layer (#241)
//
// Renders the off-chain oracle-provider decision path for a market: every
// provider response that entered the resolution pipeline, its validation
// verdict (valid / stale / rejected) and reason, and which observations
// actually contributed to the final resolution.
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';

type ValidationStatus = 'valid' | 'stale' | 'rejected';

interface Observation {
  provider: string;
  providerRequestId: string | null;
  batchId: string;
  receivedAt: string;
  normalizedOutcome: 'yes' | 'no' | null;
  confidence: number | null;
  numericValue: number | null;
  validationStatus: ValidationStatus;
  rejectionReason: string | null;
  rejectionDetail: string | null;
  stale: boolean;
  freshness: { ageMs: number | null; maxAgeMs: number | null } | null;
  participatedInConsensus: boolean;
  contributedToResolution: boolean;
}

interface Attempt {
  batchId: string;
  recordedAt: string;
  observationCount: number;
  acceptedCount: number;
  rejectedCount: number;
  staleCount: number;
  contributingProviders: string[];
  consensusContext: {
    finalOutcome: string | null;
    consensusReached: boolean;
    agreementRatio: number | null;
    consensusThreshold: number | null;
  } | null;
}

interface ProvenanceData {
  marketId: string;
  resolution: {
    status: string;
    resolvedOutcome: string | null;
    resolutionTransactionHash: string | null;
  };
  observations: Observation[];
  attempts: Attempt[];
  decision_context: {
    batchId: string;
    contributingProviders: string[];
    consensusContext: Attempt['consensusContext'];
  } | null;
  legacy_resolution: boolean;
}

interface ProviderProvenanceProps {
  marketId: string;
}

async function fetchProvenance(marketId: string): Promise<ProvenanceData> {
  const res = await fetch(`${API_BASE}/api/markets/${marketId}/resolution/provenance`);
  if (!res.ok) {
    throw new Error(`Provenance fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data as ProvenanceData;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

const STATUS_META: Record<
  ValidationStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  valid: {
    label: 'Valid',
    className: 'bg-success/10 text-success border-success/30',
    Icon: CheckCircle2,
  },
  stale: {
    label: 'Stale',
    className: 'bg-warning/10 text-warning border-warning/30',
    Icon: Clock,
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-destructive/10 text-destructive border-destructive/30',
    Icon: XCircle,
  },
};

function ObservationRow({ observation }: { observation: Observation }) {
  const meta = STATUS_META[observation.validationStatus];
  const { Icon } = meta;

  return (
    <div className="px-4 py-3 rounded-lg bg-muted/20 border border-border/40 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium capitalize truncate">{observation.provider}</span>
          {observation.providerRequestId && (
            <span className="text-xs text-muted-foreground font-mono truncate">
              {observation.providerRequestId}
            </span>
          )}
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0',
            meta.className,
          )}
        >
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {observation.normalizedOutcome && (
          <span>
            value:{' '}
            <span className="uppercase font-medium text-foreground">
              {observation.normalizedOutcome}
            </span>
          </span>
        )}
        {observation.numericValue !== null && <span>{observation.numericValue}</span>}
        {observation.confidence !== null && (
          <span>confidence {(observation.confidence * 100).toFixed(0)}%</span>
        )}
        <span>received {formatTimestamp(observation.receivedAt)}</span>
      </div>

      {observation.rejectionDetail && (
        <p className="text-xs text-muted-foreground">
          {observation.rejectionReason && (
            <span className="font-mono">{observation.rejectionReason}</span>
          )}
          {observation.rejectionReason ? ' — ' : ''}
          {observation.rejectionDetail}
        </p>
      )}

      <p
        className={cn(
          'text-xs font-medium',
          observation.contributedToResolution ? 'text-success' : 'text-muted-foreground',
        )}
      >
        {observation.contributedToResolution
          ? '→ contributed to final resolution'
          : '→ excluded from final resolution'}
      </p>
    </div>
  );
}

export function ProviderProvenance({ marketId }: ProviderProvenanceProps) {
  const { data, isLoading, isError } = useQuery<ProvenanceData, Error>({
    queryKey: ['resolution-provenance', marketId],
    queryFn: () => fetchProvenance(marketId),
    retry: 1,
  });

  if (isLoading) {
    return null;
  }

  if (isError || !data) {
    return (
      <div className="glass-card p-5 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Oracle Data Provenance
        </h3>
        <p className="text-sm text-muted-foreground py-4 text-center">
          Provenance data unavailable.
        </p>
      </div>
    );
  }

  if (data.legacy_resolution) {
    return (
      <div className="glass-card p-5 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Oracle Data Provenance
        </h3>
        <p className="text-sm text-muted-foreground py-4 text-center">
          This market was resolved before provenance tracking was enabled. No oracle observation
          trail is available.
        </p>
      </div>
    );
  }

  if (data.observations.length === 0) {
    return (
      <div className="glass-card p-5 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Oracle Data Provenance
        </h3>
        <p className="text-sm text-muted-foreground py-4 text-center">
          No oracle observations have been recorded for this market yet.
        </p>
      </div>
    );
  }

  // Observations already arrive oldest-first; group them by resolution attempt.
  const attemptsById = new Map<string, Observation[]>();
  for (const obs of data.observations) {
    const list = attemptsById.get(obs.batchId) ?? [];
    list.push(obs);
    attemptsById.set(obs.batchId, list);
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Oracle Data Provenance
      </h3>

      {data.attempts.map((attempt) => {
        const observations = attemptsById.get(attempt.batchId) ?? [];
        const ctx = attempt.consensusContext;

        return (
          <div key={attempt.batchId} className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Resolution attempt · {formatTimestamp(attempt.recordedAt)}
              </span>
              <span className="text-success">{attempt.acceptedCount} valid</span>
              <span className="text-warning">{attempt.staleCount} stale</span>
              <span className="text-destructive">{attempt.rejectedCount} rejected</span>
            </div>

            <div className="space-y-2">
              {observations.map((obs) => (
                <ObservationRow key={`${obs.batchId}-${obs.provider}`} observation={obs} />
              ))}
            </div>

            {ctx && (
              <div className="px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1">
                <p className="font-medium text-foreground">
                  Final decision:{' '}
                  <span className="uppercase">{ctx.finalOutcome ?? 'not reached'}</span>
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                  <span>
                    consensus {ctx.consensusReached ? 'reached' : 'not reached'}
                  </span>
                  {ctx.agreementRatio !== null && (
                    <span>agreement {(ctx.agreementRatio * 100).toFixed(1)}%</span>
                  )}
                  {ctx.consensusThreshold !== null && (
                    <span>threshold {(ctx.consensusThreshold * 100).toFixed(0)}%</span>
                  )}
                  {attempt.contributingProviders.length > 0 && (
                    <span>
                      contributing: {attempt.contributingProviders.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {data.resolution.resolvedOutcome && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground pt-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Rejected and stale observations are retained for audit and never influence the outcome.
          </span>
        </div>
      )}
    </div>
  );
}

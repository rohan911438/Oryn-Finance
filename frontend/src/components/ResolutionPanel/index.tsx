import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { OracleSourceConfig } from './OracleSourceConfig';
import { SubmissionList } from './SubmissionList';
import { AggregatedResult } from './AggregatedResult';
import { ResolutionStatus } from './ResolutionStatus';
import { AuditTrail } from './AuditTrail';
import { HealthSummary } from './HealthSummary';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';

interface ResolutionData {
  marketId: string;
  oracle_source: string;
  oracle_config: Record<string, unknown>;
  resolution_status: string;
  submissions: Array<{
    oracleAddress: string;
    outcome: 'yes' | 'no';
    confidenceScore: number;
    submittedAt: string;
    txHash: string;
    explorerUrl: string;
  }>;
  vote_tally: { yes: number; no: number; threshold: number };
  source_disagreement: boolean;
  aggregated_result: {
    outcome: string;
    method: string;
    yes_weight: number;
    no_weight: number;
    confidence: number;
    low_confidence: boolean;
    breakdown: Array<{ source: string; outcome: string; confidence: number; weight: number }>;
  } | null;
  dispute_info: {
    deadline: string | null;
    seconds_remaining: number | null;
    finalization_tx_hash: string | null;
    finalization_timestamp: string | null;
  };
  audit_trail: Array<{
    eventType: string;
    actorAddress: string | null;
    payload: unknown;
    ledger: number;
    txHash: string;
    timestamp: string;
    explorerUrl: string;
  }>;
  contract_data_unavailable: boolean;
}

interface HealthData {
  sources: Array<{
    name: string;
    successCount: number;
    failureCount: number;
    failureRate: number;
    isHealthy: boolean;
    lastFailure: string | null;
  }> | null;
}

interface ResolutionPanelProps {
  marketId: string;
}

async function fetchResolution(marketId: string): Promise<ResolutionData> {
  const res = await fetch(`${API_BASE}/api/markets/${marketId}/resolution`);
  if (!res.ok) {
    throw new Error(`Resolution fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data as ResolutionData;
}

async function fetchOracleHealth(): Promise<HealthData> {
  const res = await fetch(`${API_BASE}/api/oracle/health`);
  if (!res.ok) {
    throw new Error(`Health fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data as HealthData;
}

function ResolutionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

export function ResolutionPanel({ marketId }: ResolutionPanelProps) {
  const {
    data: resolution,
    isLoading: resolutionLoading,
    isError: resolutionError,
    refetch: refetchResolution,
  } = useQuery<ResolutionData, Error>({
    queryKey: ['resolution', marketId],
    queryFn: () => fetchResolution(marketId),
    retry: 1,
  });

  const {
    data: health,
    isError: healthError,
  } = useQuery<HealthData, Error>({
    queryKey: ['oracle-health'],
    queryFn: fetchOracleHealth,
    retry: 1,
  });

  if (resolutionLoading) {
    return <ResolutionSkeleton />;
  }

  if (resolutionError || !resolution) {
    return (
      <div className="glass-card p-6 flex flex-col items-center gap-4 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <div>
          <p className="font-semibold text-foreground">Failed to load resolution data</p>
          <p className="text-sm text-muted-foreground mt-1">
            The resolution endpoint returned an error. Please try again.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchResolution()}
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Contract data unavailable banner */}
      {resolution.contract_data_unavailable && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Live contract data is temporarily unavailable. Showing last known resolution state.
          </span>
        </div>
      )}

      <ResolutionStatus
        resolutionStatus={resolution.resolution_status}
        disputeInfo={resolution.dispute_info}
      />

      <OracleSourceConfig
        oracleSource={resolution.oracle_source}
        oracleConfig={resolution.oracle_config}
      />

      <SubmissionList
        submissions={resolution.submissions}
        sourceDisagreement={resolution.source_disagreement}
        voteTally={resolution.vote_tally}
      />

      <AggregatedResult aggregatedResult={resolution.aggregated_result} />

      <AuditTrail auditTrail={resolution.audit_trail} />

      <HealthSummary
        sources={health?.sources ?? null}
        isError={healthError}
      />
    </div>
  );
}

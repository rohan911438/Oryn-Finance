// Requirements: 4.4, 4.5, 4.6
import { ExternalLink, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ResolutionStatusProps {
  resolutionStatus: string;
  disputeInfo: {
    deadline: string | null;
    seconds_remaining: number | null;
    finalization_tx_hash: string | null;
    finalization_timestamp: string | null;
  };
}

interface StatusConfig {
  label: string;
  className: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: {
    label: 'Pending',
    className: 'bg-muted/40 text-muted-foreground border-muted/50',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  consensus_reached: {
    label: 'Consensus Reached',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  dispute_period: {
    label: 'Dispute Period',
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  finalized: {
    label: 'Finalized',
    className: 'bg-success/20 text-success border-success/30',
  },
  manual_required: {
    label: 'Manual Required',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
};

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export function ResolutionStatus({ resolutionStatus, disputeInfo }: ResolutionStatusProps) {
  const config = STATUS_CONFIG[resolutionStatus] ?? {
    label: resolutionStatus,
    className: 'bg-muted/40 text-muted-foreground border-muted/50',
  };

  const isDisputePeriod = resolutionStatus === 'dispute_period';
  const isFinalized = resolutionStatus === 'finalized';

  return (
    <div className="glass-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Resolution Status
      </h3>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className={cn('text-sm font-semibold px-3 py-1', config.className)}>
          {config.label}
        </Badge>
      </div>

      {/* Dispute period countdown */}
      {isDisputePeriod && disputeInfo.deadline && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-sm">
          <Clock className="w-4 h-4 mt-0.5 text-orange-400 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-medium text-orange-400">Dispute window open</p>
            <p className="text-muted-foreground text-xs">
              Closes{' '}
              <span className="text-foreground font-medium">
                {formatDistanceToNow(new Date(disputeInfo.deadline), { addSuffix: true })}
              </span>{' '}
              ({formatTimestamp(disputeInfo.deadline)})
            </p>
          </div>
        </div>
      )}

      {/* Finalization info */}
      {isFinalized && disputeInfo.finalization_tx_hash && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Finalized at:</span>
            <span className="text-foreground">
              {disputeInfo.finalization_timestamp
                ? formatTimestamp(disputeInfo.finalization_timestamp)
                : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tx:</span>
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${disputeInfo.finalization_tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline font-mono text-xs"
            >
              {disputeInfo.finalization_tx_hash.slice(0, 12)}…
              {disputeInfo.finalization_tx_hash.slice(-6)}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

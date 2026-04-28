// Requirements: 5.5, 5.6
import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface AuditEntry {
  eventType: string;
  actorAddress: string | null;
  payload: unknown;
  ledger: number;
  txHash: string;
  timestamp: string;
  explorerUrl: string;
}

interface AuditTrailProps {
  auditTrail: AuditEntry[];
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  oracle_submission: 'Oracle Submission',
  consensus_reached: 'Consensus Reached',
  dispute_period_started: 'Dispute Period Started',
  resolution_disputed: 'Resolution Disputed',
  resolution_finalized: 'Resolution Finalized',
  manual_resolution: 'Manual Resolution',
};

function truncateAddress(address: string | null): string {
  if (!address) return 'System';
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function AuditEntry({ entry, isLast }: { entry: AuditEntry; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const label = EVENT_TYPE_LABELS[entry.eventType] ?? entry.eventType;

  return (
    <div className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1 shrink-0" />
        {!isLast && <div className="w-px flex-1 bg-border/50 mt-1" />}
      </div>

      {/* Entry content */}
      <div className={cn('pb-5 flex-1', isLast && 'pb-0')}>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-start gap-2 w-full text-left group">
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                {label}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {entry.actorAddress && (
                  <span
                    title={entry.actorAddress}
                    className="font-mono cursor-default"
                  >
                    {truncateAddress(entry.actorAddress)}
                  </span>
                )}
                <span>{formatTimestamp(entry.timestamp)}</span>
                <span>Ledger #{entry.ledger}</span>
                <a
                  href={entry.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  {entry.txHash.slice(0, 8)}…
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            <span className="text-muted-foreground mt-0.5 shrink-0">
              {open ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <pre className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/40 text-xs font-mono overflow-x-auto text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

export function AuditTrail({ auditTrail }: AuditTrailProps) {
  return (
    <div className="glass-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Audit Trail
      </h3>

      {auditTrail.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No resolution events yet.
        </p>
      ) : (
        <div className="space-y-0">
          {auditTrail.map((entry, idx) => (
            <AuditEntry
              key={`${entry.txHash}-${entry.eventType}`}
              entry={entry}
              isLast={idx === auditTrail.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

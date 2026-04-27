// Requirements: 7.4, 7.5
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HealthSource {
  name: string;
  successCount: number;
  failureCount: number;
  failureRate: number;
  isHealthy: boolean;
  lastFailure: string | null;
}

interface HealthSummaryProps {
  sources: HealthSource[] | null;
  isError: boolean;
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

export function HealthSummary({ sources, isError }: HealthSummaryProps) {
  if (isError || sources === null) {
    return (
      <div className="glass-card p-5 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Oracle Health
        </h3>
        <p className="text-sm text-muted-foreground py-4 text-center">
          Health data unavailable.
        </p>
      </div>
    );
  }

  const allUnhealthy = sources.length > 0 && sources.every((s) => !s.isHealthy);

  return (
    <div className="glass-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Oracle Health
      </h3>

      {allUnhealthy && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            All oracle sources are currently unhealthy. Automated resolution may be unreliable.
          </span>
        </div>
      )}

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">No sources configured.</p>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div
              key={source.name}
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-muted/20 border border-border/40"
            >
              <div className="flex items-center gap-3">
                {/* Health indicator dot */}
                <span
                  className={cn(
                    'w-2.5 h-2.5 rounded-full shrink-0',
                    source.isHealthy
                      ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.6)]'
                      : 'bg-destructive shadow-[0_0_6px_rgba(239,68,68,0.6)]',
                  )}
                />
                <div>
                  <p className="text-sm font-medium capitalize">{source.name}</p>
                  {source.lastFailure && !source.isHealthy && (
                    <p className="text-xs text-muted-foreground">
                      Last failure: {formatTimestamp(source.lastFailure)}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground space-y-0.5">
                <p>
                  <span className="text-success">{source.successCount}</span> /{' '}
                  <span className="text-destructive">{source.failureCount}</span>
                </p>
                <p>{(source.failureRate * 100).toFixed(1)}% failure rate</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

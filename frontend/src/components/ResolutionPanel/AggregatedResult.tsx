// Requirements: 3.4, 3.5, 3.6
import { AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface BreakdownEntry {
  source: string;
  outcome: string;
  confidence: number;
  weight: number;
}

interface AggregatedResultProps {
  aggregatedResult: {
    outcome: string;
    method: string;
    yes_weight: number;
    no_weight: number;
    confidence: number;
    low_confidence: boolean;
    breakdown: BreakdownEntry[];
  } | null;
}

export function AggregatedResult({ aggregatedResult }: AggregatedResultProps) {
  if (!aggregatedResult) {
    return (
      <div className="glass-card p-5 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Aggregated Result
        </h3>
        <p className="text-sm text-muted-foreground py-4 text-center">
          No aggregated result yet.
        </p>
      </div>
    );
  }

  const { outcome, method, yes_weight, no_weight, confidence, low_confidence, breakdown } =
    aggregatedResult;
  const confidencePct = Math.round(confidence * 100);
  const isYes = outcome.toLowerCase() === 'yes';

  return (
    <div className="glass-card p-5 space-y-5">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Aggregated Result
      </h3>

      {/* Prominent outcome */}
      <div className="flex items-center gap-4">
        <span
          className={cn(
            'text-3xl font-black uppercase',
            isYes ? 'text-success' : 'text-destructive',
          )}
        >
          {outcome.toUpperCase()}
        </span>
        <span className="text-xs text-muted-foreground">
          Method: <span className="text-foreground font-medium capitalize">{method}</span>
        </span>
      </div>

      {/* Confidence bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Confidence</span>
          <span className="font-semibold">{confidencePct}%</span>
        </div>
        <Progress
          value={confidencePct}
          className={cn(
            'h-2',
            low_confidence ? '[&>div]:bg-warning' : '[&>div]:bg-success',
          )}
        />
      </div>

      {/* Low confidence caution */}
      {low_confidence && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Resolution confidence is below the recommended threshold (60%). The outcome may be
            unreliable.
          </span>
        </div>
      )}

      {/* Weight summary */}
      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">YES weight</span>
          <span className="ml-2 font-semibold text-success">{yes_weight.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">NO weight</span>
          <span className="ml-2 font-semibold text-destructive">{no_weight.toFixed(2)}</span>
        </div>
      </div>

      {/* Per-source breakdown */}
      {breakdown.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Source Breakdown
          </p>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="px-4 py-2 text-left font-medium">Source</th>
                  <th className="px-4 py-2 text-left font-medium">Outcome</th>
                  <th className="px-4 py-2 text-left font-medium">Confidence</th>
                  <th className="px-4 py-2 text-left font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((entry, idx) => (
                  <tr
                    key={`${entry.source}-${idx}`}
                    className={cn(
                      'border-t border-border/30',
                      idx % 2 === 0 ? 'bg-muted/10' : 'bg-transparent',
                    )}
                  >
                    <td className="px-4 py-2 font-medium capitalize">{entry.source}</td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          entry.outcome.toLowerCase() === 'yes'
                            ? 'text-success'
                            : 'text-destructive',
                        )}
                      >
                        {entry.outcome.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {(entry.confidence * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-xs font-mono">{entry.weight.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

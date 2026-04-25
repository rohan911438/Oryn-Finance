// Requirements: 2.4, 2.5
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Submission {
  oracleAddress: string;
  outcome: 'yes' | 'no';
  confidenceScore: number;
  submittedAt: string;
  txHash: string;
  explorerUrl: string;
}

interface SubmissionListProps {
  submissions: Submission[];
  sourceDisagreement: boolean;
  voteTally: { yes: number; no: number; threshold: number };
}

function truncateAddress(address: string): string {
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

export function SubmissionList({ submissions, sourceDisagreement, voteTally }: SubmissionListProps) {
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Oracle Submissions
        </h3>
        <span className="text-xs text-muted-foreground">
          {voteTally.yes} yes / {voteTally.no} no &nbsp;·&nbsp; threshold: {voteTally.threshold}
        </span>
      </div>

      {sourceDisagreement && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Oracle sources disagree on the outcome. Review individual submissions carefully.</span>
        </div>
      )}

      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No submissions yet.</p>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-4 py-2 text-left font-medium">Oracle</th>
                <th className="px-4 py-2 text-left font-medium">Outcome</th>
                <th className="px-4 py-2 text-left font-medium">Confidence</th>
                <th className="px-4 py-2 text-left font-medium">Submitted</th>
                <th className="px-4 py-2 text-left font-medium">Tx</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub, idx) => (
                <tr
                  key={sub.txHash}
                  className={cn(
                    'border-t border-border/30',
                    idx % 2 === 0 ? 'bg-muted/10' : 'bg-transparent',
                  )}
                >
                  <td className="px-4 py-3">
                    <span
                      title={sub.oracleAddress}
                      className="font-mono text-xs cursor-default"
                    >
                      {truncateAddress(sub.oracleAddress)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={cn(
                        'text-xs font-semibold',
                        sub.outcome === 'yes'
                          ? 'bg-success/20 text-success border-success/30'
                          : 'bg-destructive/20 text-destructive border-destructive/30',
                      )}
                      variant="outline"
                    >
                      {sub.outcome.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {(sub.confidenceScore * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatTimestamp(sub.submittedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={sub.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {sub.txHash.slice(0, 8)}…
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

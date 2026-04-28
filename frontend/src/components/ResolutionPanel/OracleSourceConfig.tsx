// Requirements: 1.4, 1.5
import { cn } from '@/lib/utils';

interface OracleSourceConfigProps {
  oracleSource: string;
  oracleConfig: Record<string, unknown>;
}

const ORACLE_SOURCE_LABELS: Record<string, string> = {
  coingecko: 'CoinGecko',
  chainlink: 'Chainlink',
  'sports-api': 'Sports API',
  'news-api': 'News API',
  manual: 'Manual',
};

function formatConfigKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function OracleSourceConfig({ oracleSource, oracleConfig }: OracleSourceConfigProps) {
  const label = ORACLE_SOURCE_LABELS[oracleSource] ?? oracleSource;
  const configEntries = Object.entries(oracleConfig);

  return (
    <div className="glass-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Oracle Source
      </h3>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          {label}
        </span>
      </div>

      {configEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Configuration
          </p>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {configEntries.map(([key, value], idx) => (
                  <tr
                    key={key}
                    className={cn(
                      'flex justify-between px-4 py-2',
                      idx % 2 === 0 ? 'bg-muted/20' : 'bg-transparent',
                    )}
                  >
                    <td className="text-muted-foreground font-medium">{formatConfigKey(key)}</td>
                    <td className="text-foreground font-mono text-xs">{formatConfigValue(value)}</td>
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

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, CheckCircle2, XCircle,
  Clock, TrendingUp, Layers, Percent, Receipt, Hash
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiService } from '@/services/apiService';

const STELLAR_EXPERT_BASE = 'https://stellar.expert/explorer/testnet/tx';

function fmt(n: number, decimals = 4) {
  return Number(n ?? 0).toFixed(decimals);
}
function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    confirmed:        { label: 'Confirmed',        cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    partially_filled: { label: 'Partially Filled', cls: 'bg-warning/10 text-warning border-warning/30' },
    pending:          { label: 'Pending',           cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    failed:           { label: 'Failed',            cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
    cancelled:        { label: 'Cancelled',         cls: 'border-white/10 text-white/50' },
  };
  const cfg = map[status] ?? { label: status, cls: 'border-white/10 text-white/60' };
  return (
    <Badge variant="outline" className={`text-xs font-semibold ${cfg.cls}`}>
      {status === 'confirmed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
      {status === 'failed'    && <XCircle      className="w-3 h-3 mr-1" />}
      {status === 'pending'   && <Clock        className="w-3 h-3 mr-1" />}
      {cfg.label}
    </Badge>
  );
}

function Row({ label, value, mono = false, highlight }: {
  label: string; value: React.ReactNode; mono?: boolean;
  highlight?: 'success' | 'danger' | 'warn';
}) {
  const color = highlight === 'success' ? 'text-emerald-400'
    : highlight === 'danger' ? 'text-red-400'
    : highlight === 'warn' ? 'text-warning' : '';
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/50">{label}</span>
      <span className={`text-sm font-medium ${mono ? 'font-mono text-xs' : ''} ${color}`}>{value}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="glass-card p-6">
      <h2 className="text-base font-semibold flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-primary" />
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function TradeDetail() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tradeId) return;
    setLoading(true);
    apiService.trades.getTradeById(tradeId)
      .then(setTrade)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tradeId]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link
          to="/portfolio"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portfolio
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Trade Breakdown</h1>
          {trade && <StatusBadge status={trade.status} />}
        </div>

        {loading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
          </div>
        )}

        {error && (
          <div className="glass-card p-8 text-center text-red-400">
            <XCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="font-medium">Failed to load trade</p>
            <p className="text-sm text-white/40 mt-1">{error}</p>
          </div>
        )}

        {trade && !loading && (
          <div className="space-y-4">
            {/* Execution Summary */}
            <Section title="Execution Summary" icon={TrendingUp}>
              <Row label="Trade ID"   value={trade.tradeId} mono />
              <Row label="Market"     value={trade.marketId} />
              <Row label="Type" value={
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className={trade.tradeType === 'buy'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'}>
                    {trade.tradeType?.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className={trade.tokenType === 'yes'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'}>
                    {trade.tokenType?.toUpperCase()}
                  </Badge>
                </span>
              } />
              <Row label="Timestamp" value={fmtDate(trade.timestamp || trade.createdAt)} />
              <Row label="Status"    value={<StatusBadge status={trade.status} />} />
            </Section>

            {/* Price & Amount */}
            <Section title="Price & Amount" icon={Layers}>
              <Row label="Requested Amount" value={`${fmt(trade.amount)} tokens`} />
              {trade.partialFill?.isPartial && <>
                <Row label="Filled Amount"   value={`${fmt(trade.partialFill.filledAmount)} tokens`}   highlight="success" />
                <Row label="Remaining"       value={`${fmt(trade.partialFill.remainingAmount)} tokens`} highlight="warn" />
                <Row label="Fill Ratio"      value={`${(trade.partialFill.fillRatio * 100).toFixed(1)}%`} highlight="warn" />
              </>}
              <Row label="Executed Price" value={`${Math.round((trade.price ?? 0) * 100)}¢ per token`} />
              <Row label="Total Cost"     value={fmtUSD(trade.totalCost)} />
            </Section>

            {/* Slippage */}
            <Section title="Slippage" icon={Percent}>
              <Row label="Max Slippage Tolerance" value={`${fmt((trade.slippage?.expected ?? 0) * 100, 2)}%`} />
              <Row
                label="Actual Price Impact"
                value={`${fmt((trade.slippage?.actual ?? 0) * 100, 2)}%`}
                highlight={(trade.slippage?.actual ?? 0) > 0.02 ? 'warn' : 'success'}
              />
              {trade.marketPrices && <>
                <Row label="YES Price Before" value={`${Math.round((trade.marketPrices.yesPriceBefore ?? 0) * 100)}¢`} />
                <Row label="YES Price After"  value={`${Math.round((trade.marketPrices.yesPriceAfter  ?? 0) * 100)}¢`} />
              </>}
            </Section>

            {/* Fees */}
            <Section title="Fees" icon={Receipt}>
              <Row label="Platform Fee" value={fmtUSD(trade.fees?.platformFee ?? 0)} />
              <Row label="Network Fee"  value={`${trade.fees?.stellarFee ?? 0.00001} XLM`} />
              <Row label="Total Fees"   value={fmtUSD(trade.fees?.total ?? 0)} highlight="warn" />
            </Section>

            {/* Blockchain */}
            <Section title="Blockchain" icon={Hash}>
              <Row
                label="Transaction Hash"
                value={trade.stellarTransactionHash ? (
                  <a
                    href={`${STELLAR_EXPERT_BASE}/${trade.stellarTransactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline font-mono text-xs"
                  >
                    {trade.stellarTransactionHash.slice(0, 16)}…{trade.stellarTransactionHash.slice(-8)}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : <span className="text-white/30">Not available</span>}
              />
              {trade.blockHeight && (
                <Row label="Block Height" value={trade.blockHeight.toLocaleString()} mono />
              )}
              <Row
                label="View on Explorer"
                value={trade.stellarTransactionHash ? (
                  <a
                    href={`${STELLAR_EXPERT_BASE}/${trade.stellarTransactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline text-xs"
                  >
                    Stellar Expert <ExternalLink className="w-3 h-3" />
                  </a>
                ) : '—'}
              />
            </Section>
          </div>
        )}
      </div>
    </Layout>
  );
}

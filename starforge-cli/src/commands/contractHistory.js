const logger = require('node:console');
const { getContractTransactions } = require('../lib/horizonClient');
const { getSorobanTransaction } = require('../lib/sorobanClient');
const { extractBeforeAfterFromTxMeta, buildTimelineFromLedgerEntryChanges } = require('../lib/stateDiff');
const { writeOutput } = require('../lib/exporter');

function chunked(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function runPerTx({ rpcUrl, horizonUrl, txHash, idx }) {
  const tx = await getSorobanTransaction({ rpcUrl, txHash });

  const metaV3 = tx?.meta || tx?.transactionMeta || tx?.metaV3 || {};
  const decodedChanges = extractBeforeAfterFromTxMeta(metaV3);

  const diffs = buildTimelineFromLedgerEntryChanges({
    txHash,
    changesByKey: decodedChanges
  });

  return {
    txHash,
    ledger: tx?.ledger,
    createdAt: tx?.created_at || tx?.timestamp || null,
    diffs,
    raw: {
      // Keep minimal raw to reduce output size
      sorobanMetaReturnValue: metaV3?.sorobanMeta?.returnValue ?? metaV3?.returnValue ?? null,
      events: metaV3?.sorobanMeta?.events ?? metaV3?.events ?? null
    }
  };
}

async function contractHistory({
  contractId,
  limit,
  order,
  output,
  export: exportFormat,
  network,
  horizonUrl,
  rpcUrl
}) {
  const effectiveHorizonUrl = horizonUrl || (network === 'public'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org');

  if (!rpcUrl) {
    throw new Error('Missing Soroban RPC URL. Set --rpc-url or STARFORGE_RPC_URL.');
  }

  const records = await getContractTransactions({
    horizonUrl: effectiveHorizonUrl,
    contractId,
    limit,
    order
  });

  // tx hash location varies; try common shapes
  const txHashes = records
    .map((r) => r?.hash || r?.transaction_hash || r?.tx_hash || r?.transaction?.hash)
    .filter(Boolean);

  const timeline = [];

  const maxConcurrency = 5;
  const batches = chunked(txHashes, maxConcurrency);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const results = await Promise.all(
      batch.map((txHash, i) => runPerTx({ rpcUrl, horizonUrl: effectiveHorizonUrl, txHash, idx: i }))
    );
    timeline.push(...results);
  }

  // Compute per-key summary diff examples
  return writeOutput({
    exportFormat,
    output,
    payload: {
      network,
      contractId,
      horizonUrl: effectiveHorizonUrl,
      rpcUrl,
      scanned: {
        horizonLimit: limit,
        order,
        txCount: txHashes.length
      },
      timeline
    }
  });
}

module.exports = contractHistory;


const path = require('path');
const fs = require('fs');
const { createAxios } = require('../lib/http');
const { getDefaultCacheDir, getCachePath, isFresh, readJson, writeJson, ensureDir } = require('../lib/cache');
const { writeOutput } = require('../lib/exporter');

// state-at goal: use getLedgerEntries for a given ledger sequence.
// Exact Soroban/RPC method for ledger entries may vary by RPC provider.
// We'll implement via JSON-RPC method 'getLedgerEntries' with params [ledger, keys?]
// where keys are optional.

function buildCacheKey({ contractId, ledger }) {
  return `state-at__contract=${contractId}__ledger=${ledger}`;
}

async function fetchLedgerEntries({ rpcUrl, ledger }) {
  // If rpc supports key-less getLedgerEntries, it will return relevant entries.
  // Otherwise, user may need keys; for now we call getLedgerEntries with [ledger].
  const client = createAxios({ baseURL: rpcUrl });
  const resp = await client.post('/', {
    jsonrpc: '2.0',
    id: 1,
    method: 'getLedgerEntries',
    params: [ledger]
  });

  return resp.data?.result;
}

function extractContractStateSnapshot(ledgerEntriesResult, contractId) {
  // Best-effort extraction:
  // ledger entries returned often include entries keyed by contractDataKey.
  // We'll search for any entry whose key contains the contractId.

  const entries = ledgerEntriesResult?.entries || ledgerEntriesResult?.ledgerEntries || ledgerEntriesResult || [];
  const out = { contractId, ledger: ledgerEntriesResult?.ledger || null, entries: [] };

  if (!Array.isArray(entries)) return out;

  for (const e of entries) {
    const keyStr = JSON.stringify(e?.key || e?.entry || e, null, 0);
    if (keyStr && keyStr.includes(contractId)) {
      out.entries.push(e);
    }
  }

  return out;
}

async function contractStateAt({
  contractId,
  ledger,
  output,
  export: exportFormat,
  network,
  horizonUrl,
  rpcUrl,
  cacheTtlSeconds
}) {
  if (!rpcUrl) {
    throw new Error('Missing Soroban RPC URL. Set --rpc-url or STARFORGE_RPC_URL.');
  }

  const cacheDir = getDefaultCacheDir();
  const cacheKey = buildCacheKey({ contractId, ledger });
  const cachePath = getCachePath({ cacheDir, key: cacheKey });

  const ttl = Number.isFinite(cacheTtlSeconds) ? cacheTtlSeconds : 86400;

  let ledgerEntriesResult;
  if (isFresh(cachePath, ttl)) {
    ledgerEntriesResult = readJson(cachePath);
  } else {
    ledgerEntriesResult = await fetchLedgerEntries({ rpcUrl, ledger });
    writeJson(cachePath, ledgerEntriesResult);
  }

  const snapshot = extractContractStateSnapshot(ledgerEntriesResult, contractId);

  return writeOutput({
    exportFormat,
    output,
    payload: {
      network,
      contractId,
      ledger,
      cached: isFresh(cachePath, ttl),
      snapshot
    }
  });
}

module.exports = contractStateAt;


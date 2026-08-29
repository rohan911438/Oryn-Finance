function safeToString(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // ScVal / XDR-ish objects: keep a stable JSON representation
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function buildTimelineFromLedgerEntryChanges({ txHash, changesByKey }) {
  // changesByKey: { [key]: { before, after } }
  const diffs = [];
  for (const [key, change] of Object.entries(changesByKey || {})) {
    const beforeStr = safeToString(change.before);
    const afterStr = safeToString(change.after);

    // Normalize "no change" detection: still include deletions/creations
    const hasAny = beforeStr !== afterStr;
    if (!hasAny) continue;

    diffs.push({
      key,
      before: beforeStr,
      after: afterStr,
      txHash
    });
  }

  // Sort diffs by key for stable output
  diffs.sort((a, b) => a.key.localeCompare(b.key));
  return diffs;
}

/**
 * Heuristic decoder for Horizon+RPC transaction meta.
 *
 * We may not have a fully typed Soroban XDR parser in this repo.
 * The goal is to extract storage-related before/after snapshots.
 *
 * Approach:
 * - Inspect tx.transactionMeta / meta for ledgerEntryChanges
 * - ledgerEntryChanges entries often include:
 *   - type (created/updated/removed)
 *   - entry key (maybe in "entry" or "key")
 *   - before/after values
 * - For contract storage, key usually contains a contract id + storage key.
 */
function extractBeforeAfterFromTxMeta(txMeta) {
  const out = {};

  const changes = txMeta?.ledgerEntryChanges || txMeta?.ledgerEntryChangesV3 || [];
  if (!Array.isArray(changes)) return out;

  for (const ch of changes) {
    // Try to identify contract storage key
    // Common shapes:
    // - { type: 'updated', key: { ... }, before: { val: ... }, after: { val: ... } }
    // - { type: 'updated', entry: { key: ..., val: ... }, before, after }

    const storageKeyCandidate =
      ch?.key?.contractDataKey ||
      ch?.key?.key ||
      ch?.key ||
      ch?.entry?.key ||
      ch?.entry?.key?.contractDataKey ||
      ch?.entry;

    const keyStr = safeToString(storageKeyCandidate);
    if (!keyStr) continue;

    // Prefer explicit before/after
    const beforeVal = ch?.before?.val ?? ch?.before ?? ch?.entryBefore?.val ?? ch?.entry?.before;
    const afterVal = ch?.after?.val ?? ch?.after ?? ch?.entryAfter?.val ?? ch?.entry?.after;

    // If not explicit, attempt to infer from { entry: { before/after } } shape
    const before = beforeVal;
    const after = afterVal;

    // Only keep if we have something meaningful
    if (before === undefined && after === undefined) continue;

    out[keyStr] = { before, after };
  }

  return out;
}

module.exports = { safeToString, buildTimelineFromLedgerEntryChanges, extractBeforeAfterFromTxMeta };


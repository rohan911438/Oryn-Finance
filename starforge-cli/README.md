# starforge-cli (local)

Implements contract inspection for Soroban contracts:

- `starforge contract history <contractId> [--limit 200] [--order desc]`
- `starforge contract state-at <contractId> --ledger <N>`

## Required environment

Both commands require a Soroban RPC endpoint for JSON-RPC calls.

- `STARFORGE_RPC_URL` (recommended) or `--rpc-url`

For Horizon calls (contract transaction listing):

- `STARFORGE_HORIZON_URL` or `--horizon-url`

Defaults:
- Horizon: testnet (`https://horizon-testnet.stellar.org`)
- RPC URL: **must** be provided

## Output

- `--export json|csv` (default `json`)
- `--output <path>` writes to a file; otherwise prints JSON to stdout.

## Caching

`state-at` caches `getLedgerEntries` responses under:

- `~/.starforge/cache/`

TTL:
- `--cache-ttl-seconds` (default 86400)


#!/usr/bin/env node

const { Command } = require('commander');
const program = new Command();

program
  .name('starforge')
  .description('Contract history / state-at for Soroban contracts (Horizon + Soroban RPC)')
  .option('-n, --network <network>', 'stellar network: testnet|public', 'testnet')
  .option('--horizon-url <url>', 'Horizon base URL', (process.env.STARFORGE_HORIZON_URL || null))
  .option('--rpc-url <url>', 'Soroban RPC URL', (process.env.STARFORGE_RPC_URL || null))
  .option('--cache-ttl-seconds <seconds>', 'state-at cache TTL in seconds', (process.env.STARFORGE_CACHE_TTL_SECONDS || '86400'))
  .version('0.1.0');

const contractCmd = program
  .command('contract')
  .description('Contract inspection commands');

contractCmd
  .command('history <contractId>')

  .option('--limit <n>', 'max transactions to scan', (v) => parseInt(v, 10), 200)
  .option('--order <order>', 'desc|asc (Horizon order)', 'desc')
  .option('--output <path>', 'write result JSON to a file')
  .option('--export <fmt>', 'export format: json|csv', 'json')
  .action(async (contractId, options, cmd) => {
    // Commander nested command nesting can vary; keep direct dispatch via require
    // eslint-disable-next-line global-require
    const run = require('../src/commands/contractHistory');
    const res = await run({
      contractId,
      limit: options.limit,
      order: options.order,
      output: options.output,
      export: options.export,
      network: program.opts().network,
      horizonUrl: program.opts().horizonUrl,
      rpcUrl: program.opts().rpcUrl
    });

    if (!options.output) {
      process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    }
  });

contractCmd
  .command('state-at <contractId>')
  .requiredOption('--ledger <N>', 'ledger sequence number to inspect', (v) => parseInt(v, 10))
  .option('--output <path>', 'write result JSON to a file')
  .option('--export <fmt>', 'export format: json|csv', 'json')
  .action(async (contractId, options) => {
    // eslint-disable-next-line global-require
    const run = require('../src/commands/contractStateAt');
    const res = await run({
      contractId,
      ledger: options.ledger,
      output: options.output,
      export: options.export,
      network: program.opts().network,
      horizonUrl: program.opts().horizonUrl,
      rpcUrl: program.opts().rpcUrl,
      cacheTtlSeconds: parseInt(program.opts().cacheTtlSeconds, 10)
    });

    if (!options.output) {
      process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    }
  });

// Make nested commands work across Commander versions: parse args
program.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.stack || err);
  process.exit(1);
});


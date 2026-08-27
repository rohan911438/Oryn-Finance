#!/usr/bin/env node
'use strict';

const ProtocolBenchmarkSuite = require('./ProtocolBenchmarkSuite');

function readCliOptions(argv) {
  const options = {};
  const positional = [];
  const npmConfig = process.env;
  const npmIterations = Number(npmConfig.npm_config_iterations);
  const npmConcurrency = Number(npmConfig.npm_config_concurrency);

  if (Number.isFinite(npmIterations)) options.iterations = npmIterations;
  if (Number.isFinite(npmConcurrency)) options.concurrency = npmConcurrency;
  if (npmConfig.npm_config_profile && npmConfig.npm_config_profile !== 'true') {
    options.profile = npmConfig.npm_config_profile;
  }
  if (npmConfig.npm_config_output_dir) options.outputDir = npmConfig.npm_config_output_dir;
  if (npmConfig.npm_config_skip_contracts === 'true') options.skipContracts = true;
  if (npmConfig.npm_config_skip_frontend === 'true') options.skipFrontend = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--iterations' && next) {
      options.iterations = Number(next);
      index += 1;
    } else if (arg === '--concurrency' && next) {
      options.concurrency = Number(next);
      index += 1;
    } else if (arg === '--profile' && next) {
      options.profile = next;
      index += 1;
    } else if (arg === '--output-dir' && next) {
      options.outputDir = next;
      index += 1;
    } else if (arg === '--skip-contracts') {
      options.skipContracts = true;
    } else if (arg === '--skip-frontend') {
      options.skipFrontend = true;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  if (!Number.isFinite(options.iterations) && positional[0]) options.iterations = Number(positional[0]);
  if (!Number.isFinite(options.concurrency) && positional[1]) options.concurrency = Number(positional[1]);
  if (options.profile == null && positional[2]) options.profile = positional[2];

  return options;
}

async function main() {
  const suite = new ProtocolBenchmarkSuite(readCliOptions(process.argv.slice(2)));
  const { report, artifacts } = await suite.run();

  console.log(`Benchmark profile: ${report.profile}`);
  for (const suiteReport of report.suites) {
    console.log(
      `${suiteReport.name}: ${suiteReport.totalOperations} ops, p95 ${suiteReport.latencyMs.p95} ms, ${suiteReport.throughputOpsPerSec} ops/s, errors ${suiteReport.errorCount}`
    );
  }
  console.log(`JSON report: ${artifacts.jsonPath}`);
  console.log(`Markdown report: ${artifacts.mdPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Protocol benchmarks failed:', error);
  process.exit(1);
});

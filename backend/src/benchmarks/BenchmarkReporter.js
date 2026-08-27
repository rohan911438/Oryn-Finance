'use strict';

const fs = require('fs/promises');
const path = require('path');

class BenchmarkReporter {
  constructor({ outputDir = path.resolve(__dirname, '../../benchmark-reports') } = {}) {
    this.outputDir = outputDir;
  }

  async write(report) {
    await fs.mkdir(this.outputDir, { recursive: true });
    const stamp = report.generatedAt.replace(/[:.]/g, '-');
    const jsonPath = path.join(this.outputDir, `protocol-benchmark-${stamp}.json`);
    const mdPath = path.join(this.outputDir, `protocol-benchmark-${stamp}.md`);

    await Promise.all([
      fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
      fs.writeFile(mdPath, this.toMarkdown(report)),
    ]);

    return { jsonPath, mdPath };
  }

  toMarkdown(report) {
    const lines = [
      '# Oryn Protocol Benchmark Report',
      '',
      `Generated: ${report.generatedAt}`,
      `Profile: ${report.profile}`,
      `Node: ${report.environment.node}`,
      `Platform: ${report.environment.platform}`,
      '',
      '| Suite | Ops | Success | Error Rate | Throughput ops/s | p50 ms | p95 ms | p99 ms |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ];

    for (const suite of report.suites) {
      lines.push(
        `| ${suite.name} | ${suite.totalOperations} | ${suite.successCount} | ${BenchmarkReporter.percent(
          suite.errorRate
        )} | ${suite.throughputOpsPerSec} | ${suite.latencyMs.p50} | ${suite.latencyMs.p95} | ${suite.latencyMs.p99} |`
      );
    }

    lines.push('', '## Suite Details', '');
    for (const suite of report.suites) {
      lines.push(`### ${suite.name}`, '');
      lines.push(`- Duration: ${suite.durationMs} ms`);
      lines.push(`- Metadata: \`${JSON.stringify(suite.metadata)}\``);
      if (suite.errors.length > 0) {
        lines.push(`- Sample errors: \`${JSON.stringify(suite.errors)}\``);
      }
      lines.push('');
    }

    return `${lines.join('\n')}\n`;
  }

  static percent(value) {
    return `${(value * 100).toFixed(2)}%`;
  }
}

module.exports = BenchmarkReporter;

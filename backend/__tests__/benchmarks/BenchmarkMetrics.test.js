'use strict';

const BenchmarkMetrics = require('../../src/benchmarks/BenchmarkMetrics');

describe('BenchmarkMetrics', () => {
  test('summarizes latency, throughput, and error rate', () => {
    const metrics = new BenchmarkMetrics('unit');
    metrics.start();
    metrics.record('fast', 5, true);
    metrics.record('medium', 15, true);
    metrics.record('slow', 25, false);
    metrics.end();

    const report = metrics.summary();

    expect(report.name).toBe('unit');
    expect(report.totalOperations).toBe(3);
    expect(report.successCount).toBe(2);
    expect(report.errorCount).toBe(1);
    expect(report.errorRate).toBe(0.3333);
    expect(report.latencyMs.p50).toBe(15);
    expect(report.latencyMs.p95).toBe(25);
  });
});

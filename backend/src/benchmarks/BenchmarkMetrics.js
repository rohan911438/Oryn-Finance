'use strict';

class BenchmarkMetrics {
  constructor(name, metadata = {}) {
    this.name = name;
    this.metadata = metadata;
    this.samples = [];
    this.errors = [];
    this.startedAt = null;
    this.endedAt = null;
  }

  start() {
    this.startedAt = process.hrtime.bigint();
  }

  end() {
    this.endedAt = process.hrtime.bigint();
  }

  async measure(operation, fn) {
    const start = process.hrtime.bigint();
    try {
      const result = await fn();
      this.record(operation, BenchmarkMetrics.elapsedMs(start), true);
      return result;
    } catch (error) {
      this.record(operation, BenchmarkMetrics.elapsedMs(start), false);
      this.errors.push({
        operation,
        message: BenchmarkMetrics.truncate(error?.message || String(error)),
      });
      throw error;
    }
  }

  async measureAllowFailure(operation, fn) {
    const start = process.hrtime.bigint();
    try {
      await fn();
      this.record(operation, BenchmarkMetrics.elapsedMs(start), true);
    } catch (error) {
      this.record(operation, BenchmarkMetrics.elapsedMs(start), false);
      this.errors.push({
        operation,
        message: BenchmarkMetrics.truncate(error?.message || String(error)),
      });
    }
  }

  recordError(operation, error) {
    this.record(operation, 0, false);
    this.errors.push({
      operation,
      message: BenchmarkMetrics.truncate(error?.message || String(error)),
    });
  }

  record(operation, durationMs, success = true) {
    this.samples.push({
      operation,
      durationMs: Number(durationMs.toFixed(3)),
      success,
      timestamp: new Date().toISOString(),
    });
  }

  get durationMs() {
    if (!this.startedAt || !this.endedAt) return 0;
    return Number(this.endedAt - this.startedAt) / 1_000_000;
  }

  get successCount() {
    return this.samples.filter((sample) => sample.success).length;
  }

  get errorCount() {
    return this.samples.length - this.successCount;
  }

  get errorRate() {
    if (this.samples.length === 0) return 0;
    return this.errorCount / this.samples.length;
  }

  get throughputOpsPerSec() {
    const seconds = this.durationMs / 1000;
    if (seconds <= 0) return this.successCount;
    return this.successCount / seconds;
  }

  percentile(percentile) {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a.durationMs - b.durationMs);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)].durationMs;
  }

  summary() {
    const durations = this.samples.map((sample) => sample.durationMs);

    return {
      name: this.name,
      metadata: this.metadata,
      durationMs: Number(this.durationMs.toFixed(3)),
      totalOperations: this.samples.length,
      successCount: this.successCount,
      errorCount: this.errorCount,
      errorRate: Number(this.errorRate.toFixed(4)),
      throughputOpsPerSec: Number(this.throughputOpsPerSec.toFixed(2)),
      latencyMs: {
        min: durations.length > 0 ? Number(Math.min(...durations).toFixed(3)) : 0,
        p50: this.percentile(50),
        p95: this.percentile(95),
        p99: this.percentile(99),
        max: durations.length > 0 ? Number(Math.max(...durations).toFixed(3)) : 0,
      },
      errors: this.errors.slice(0, 10),
    };
  }

  static elapsedMs(start) {
    return Number(process.hrtime.bigint() - start) / 1_000_000;
  }

  static truncate(value, maxLength = 1200) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}... [truncated]`;
  }
}

module.exports = BenchmarkMetrics;

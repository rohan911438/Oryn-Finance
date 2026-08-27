# Protocol Benchmarks

Oryn ships an automated benchmark suite for measuring protocol performance across API latency, Socket.IO throughput, database operations, Soroban contract execution, and frontend production build time.

## Quick Start

Run the local benchmark profile:

```bash
npm run benchmark
```

Reports are written to `backend/benchmark-reports` as JSON and Markdown.

## Useful Options

```bash
npm run benchmark -- --iterations 100 --concurrency 16 --profile ci
```

Environment variables:

- `BENCHMARK_API_BASE_URL`: benchmark a running API instead of the in-process Express app.
- `BENCHMARK_WS_URL`: benchmark a running Socket.IO server instead of an ephemeral local server.
- `BENCHMARK_REAL_DB=true`: use MongoDB instead of the in-memory database reference benchmark.
- `BENCHMARK_MONGODB_URI`: MongoDB connection string for real database tests.
- `BENCHMARK_CONTRACT_PACKAGES`: comma-separated Soroban packages to run with `cargo test`.
- `BENCHMARK_SKIP_CONTRACTS=true`: skip Soroban contract execution benchmarks.
- `BENCHMARK_SKIP_FRONTEND=true`: skip the Vite production-build benchmark.

## CI Notes

The default local profile is intentionally self-contained. Live infrastructure benchmarks should be run from a controlled environment with explicit API, WebSocket, and MongoDB targets so the generated reports are comparable across runs.

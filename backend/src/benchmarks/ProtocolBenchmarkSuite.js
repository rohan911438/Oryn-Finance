'use strict';

const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const mongoose = require('mongoose');
const supertest = require('supertest');
const { io: createSocketClient } = require('socket.io-client');

const BenchmarkMetrics = require('./BenchmarkMetrics');
const BenchmarkReporter = require('./BenchmarkReporter');

const execFileAsync = promisify(execFile);

class ProtocolBenchmarkSuite {
  constructor(options = {}) {
    this.rootDir = options.rootDir || path.resolve(__dirname, '../../..');
    this.profile = options.profile || process.env.BENCHMARK_PROFILE || 'local';
    this.iterations = Number(options.iterations || process.env.BENCHMARK_ITERATIONS || 50);
    this.concurrency = Number(options.concurrency || process.env.BENCHMARK_CONCURRENCY || 8);
    this.outputDir = options.outputDir;
    this.apiBaseUrl = options.apiBaseUrl || process.env.BENCHMARK_API_BASE_URL;
    this.websocketUrl = options.websocketUrl || process.env.BENCHMARK_WS_URL;
    this.mongoUri = options.mongoUri || process.env.BENCHMARK_MONGODB_URI || process.env.MONGODB_URI;
    this.useRealDatabase = options.useRealDatabase ?? process.env.BENCHMARK_REAL_DB === 'true';
    this.skipContracts = options.skipContracts ?? process.env.BENCHMARK_SKIP_CONTRACTS === 'true';
    this.skipFrontend = options.skipFrontend ?? process.env.BENCHMARK_SKIP_FRONTEND === 'true';
    this.contractPackages = (options.contractPackages || process.env.BENCHMARK_CONTRACT_PACKAGES || 'market-factory,prediction-market,amm-pool,oracle-resolver')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async run() {
    const suites = [];

    suites.push(await this.benchmarkApiLatency());
    suites.push(await this.benchmarkWebSocketThroughput());
    suites.push(await this.benchmarkDatabasePerformance());
    if (!this.skipContracts) {
      suites.push(await this.benchmarkContractExecution());
    }
    if (!this.skipFrontend) {
      suites.push(await this.benchmarkFrontendBuild());
    }

    const report = {
      generatedAt: new Date().toISOString(),
      profile: this.profile,
      environment: {
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        iterations: this.iterations,
        concurrency: this.concurrency,
      },
      suites,
    };

    const reporter = new BenchmarkReporter({ outputDir: this.outputDir });
    const artifacts = await reporter.write(report);
    return { report, artifacts };
  }

  async benchmarkApiLatency() {
    const metrics = new BenchmarkMetrics('api_latency', {
      target: this.apiBaseUrl || 'in_process_express_app',
      endpoints: ['/', '/api/health/live'],
    });
    metrics.start();

    const client = await this.createHttpClient();
    try {
      await this.runConcurrent(async (index) => {
        const endpoint = index % 2 === 0 ? '/' : '/api/health/live';
        await metrics.measure(`GET ${endpoint}`, async () => {
          const response = await client.get(endpoint);
          if (response.status < 200 || response.status >= 500) {
            throw new Error(`Unexpected status ${response.status}`);
          }
        });
      });
    } finally {
      metrics.end();
    }

    return metrics.summary();
  }

  async benchmarkWebSocketThroughput() {
    const localServer = this.websocketUrl ? null : await this.startLocalSocketServer();
    const url = this.websocketUrl || localServer.url;
    const metrics = new BenchmarkMetrics('websocket_throughput', {
      target: this.websocketUrl ? 'external_socket_io' : 'local_socket_io',
      url,
    });
    metrics.start();

    const sockets = [];
    try {
      const clientCount = Math.max(1, Math.min(this.concurrency, 25));
      await Promise.all(
        Array.from({ length: clientCount }, (_, index) => this.connectSocket(url, index).then((socket) => sockets.push(socket)))
      );

      await this.runConcurrent(async (index) => {
        const socket = sockets[index % sockets.length];
        await metrics.measure('socket.io ping_roundtrip', () => this.roundTrip(socket, 'ping', 'pong'));
      });
    } finally {
      metrics.end();
      sockets.forEach((socket) => socket.disconnect());
      if (localServer) {
        await localServer.close();
      }
    }

    return metrics.summary();
  }

  async benchmarkDatabasePerformance() {
    if (this.useRealDatabase && this.mongoUri) {
      return this.benchmarkMongoDatabase();
    }
    return this.benchmarkInMemoryDatabase();
  }

  async benchmarkMongoDatabase() {
    const metrics = new BenchmarkMetrics('database_performance', {
      mode: 'mongodb',
      collection: 'benchmarks_markets',
    });
    metrics.start();

    const benchmarkSchema = new mongoose.Schema(
      {
        benchmarkRunId: String,
        marketId: String,
        category: String,
        status: String,
        totalVolume: Number,
        totalTrades: Number,
      },
      { timestamps: true, collection: 'benchmark_markets' }
    );
    const BenchmarkMarket =
      mongoose.models.BenchmarkMarket || mongoose.model('BenchmarkMarket', benchmarkSchema);
    const benchmarkRunId = `bench-${Date.now()}`;

    await mongoose.connect(this.mongoUri);
    try {
      await metrics.measure('insertMany benchmark markets', () =>
        BenchmarkMarket.insertMany(this.marketFixtures(500, benchmarkRunId), { ordered: false })
      );
      await this.runConcurrent((index) =>
        metrics.measure('indexed find active markets', () =>
          BenchmarkMarket.find({
            benchmarkRunId,
            status: 'active',
            category: ['crypto', 'sports', 'economics'][index % 3],
          })
            .limit(20)
            .lean()
        )
      );
      await metrics.measure('aggregate market liquidity', () =>
        BenchmarkMarket.aggregate([
          { $match: { benchmarkRunId } },
          { $group: { _id: '$category', totalVolume: { $sum: '$totalVolume' }, trades: { $sum: '$totalTrades' } } },
        ])
      );
    } finally {
      await BenchmarkMarket.deleteMany({ benchmarkRunId });
      await mongoose.disconnect();
      metrics.end();
    }

    return metrics.summary();
  }

  async benchmarkInMemoryDatabase() {
    const metrics = new BenchmarkMetrics('database_performance', {
      mode: 'in_memory_reference',
      note: 'Set BENCHMARK_REAL_DB=true and BENCHMARK_MONGODB_URI to benchmark MongoDB.',
    });
    metrics.start();

    const rows = [];
    const benchmarkRunId = `bench-${Date.now()}`;
    await metrics.measure('insert benchmark markets', async () => {
      rows.push(...this.marketFixtures(500, benchmarkRunId));
    });

    await this.runConcurrent((index) =>
      metrics.measure('filter active markets', async () => {
        const category = ['crypto', 'sports', 'economics'][index % 3];
        return rows
          .filter((row) => row.status === 'active' && row.category === category)
          .sort((a, b) => b.totalVolume - a.totalVolume)
          .slice(0, 20);
      })
    );

    await metrics.measure('aggregate market liquidity', async () => {
      return rows.reduce((groups, row) => {
        groups[row.category] = groups[row.category] || { totalVolume: 0, totalTrades: 0 };
        groups[row.category].totalVolume += row.totalVolume;
        groups[row.category].totalTrades += row.totalTrades;
        return groups;
      }, {});
    });

    metrics.end();
    return metrics.summary();
  }

  async benchmarkContractExecution() {
    const metrics = new BenchmarkMetrics('contract_execution', {
      command: 'cargo test',
      packages: this.contractPackages,
    });
    metrics.start();

    for (const contractPackage of this.contractPackages) {
      await metrics.measureAllowFailure(`cargo test -p ${contractPackage}`, async () => {
        await execFileAsync('cargo', ['test', '-p', contractPackage, '--quiet'], {
          cwd: path.join(this.rootDir, 'contracts'),
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 10,
        });
      });
    }

    metrics.end();
    return metrics.summary();
  }

  async benchmarkFrontendBuild() {
    const metrics = new BenchmarkMetrics('frontend_build', {
      command: 'npm run build --prefix frontend',
    });
    metrics.start();

    await metrics.measureAllowFailure('vite production build', async () => {
      await execFileAsync('npm', ['run', 'build'], {
        cwd: path.join(this.rootDir, 'frontend'),
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 10,
        shell: process.platform === 'win32',
      });
    });

    metrics.end();
    return metrics.summary();
  }

  async createHttpClient() {
    if (this.apiBaseUrl) {
      return {
        get: (endpoint) => this.requestUrl(new URL(endpoint, this.apiBaseUrl)),
      };
    }

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    delete require.cache[require.resolve('../../server')];
    const app = require('../../server');
    process.env.NODE_ENV = originalNodeEnv;
    return supertest(app);
  }

  async requestUrl(url) {
    return new Promise((resolve, reject) => {
      const request = http.get(url, (response) => {
        response.resume();
        response.on('end', () => resolve({ status: response.statusCode }));
      });
      request.setTimeout(10000, () => {
        request.destroy(new Error(`Timed out requesting ${url}`));
      });
      request.on('error', reject);
    });
  }

  async startLocalSocketServer() {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'benchmark';
    delete require.cache[require.resolve('../../server')];
    const OrynBackendServer = require('../../server');
    const server = new OrynBackendServer();
    server.setupMiddleware();
    server.setupRoutes();
    server.setupWebSocket();
    server.setupErrorHandling();
    process.env.NODE_ENV = originalNodeEnv;

    await new Promise((resolve) => server.server.listen(0, resolve));
    const address = server.server.address();
    return {
      url: `http://127.0.0.1:${address.port}`,
      close: async () => {
        try {
          require('../services/websocketHandler').stopHeartbeat();
        } catch (error) {
          // Best-effort cleanup for local benchmark handles.
        }
        try {
          await require('../services/redisAdapter').disconnect();
        } catch (error) {
          // Redis is optional for local benchmark runs.
        }
        await new Promise((resolve) => server.server.close(resolve));
      },
    };
  }

  async connectSocket(url, index) {
    const socket = createSocketClient(url, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
      auth: { benchmarkClient: index },
    });

    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async roundTrip(socket, emitEvent, receiveEvent) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off(receiveEvent, onResponse);
        reject(new Error(`Timed out waiting for ${receiveEvent}`));
      }, 5000);

      const onResponse = () => {
        clearTimeout(timeout);
        resolve();
      };

      socket.once(receiveEvent, onResponse);
      socket.emit(emitEvent, { ts: Date.now() });
    });
  }

  async runConcurrent(operation) {
    let cursor = 0;
    const worker = async () => {
      while (cursor < this.iterations) {
        const index = cursor;
        cursor += 1;
        await operation(index);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, this.iterations) }, () => worker())
    );
  }

  marketFixtures(count, benchmarkRunId) {
    return Array.from({ length: count }, (_, index) => ({
      benchmarkRunId,
      marketId: `${benchmarkRunId}-${index}`,
      category: ['crypto', 'sports', 'economics'][index % 3],
      status: index % 7 === 0 ? 'resolved' : 'active',
      totalVolume: 1000 + index * 17,
      totalTrades: 10 + (index % 200),
    }));
  }
}

module.exports = ProtocolBenchmarkSuite;

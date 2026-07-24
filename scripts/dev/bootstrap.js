const { execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const WALLET_FILE = path.join(__dirname, '..', 'seed', 'wallets.json');

// Helper to sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to poll endpoint health
function checkBackendHealth() {
  return new Promise((resolve) => {
    http.get('http://localhost:5001/api/health/live', (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
}

async function run() {
  console.log('========================================================');
  console.log('🚀 Starting Oryn Finance Developer Sandbox Stack...');
  console.log('========================================================\n');

  // 1. Run docker compose up
  try {
    console.log('📦 Launching Docker containers...');
    execSync('docker compose up -d', { stdio: 'inherit' });
    console.log('✅ Docker containers started.');
  } catch (error) {
    console.error('❌ Failed to start docker-compose. Make sure Docker is running.');
    console.error(error.message);
    process.exit(1);
  }

  // 2. Poll for backend health
  console.log('\n⏳ Waiting for Oryn backend API to become healthy (polling http://localhost:5001/api/health/live)...');
  let healthy = false;
  let attempts = 0;
  const maxAttempts = 30;

  while (!healthy && attempts < maxAttempts) {
    attempts++;
    healthy = await checkBackendHealth();
    if (!healthy) {
      process.stdout.write('.');
      await sleep(2000);
    }
  }

  if (!healthy) {
    console.error('\n❌ Backend failed to start or become healthy within 60 seconds.');
    console.error('Try running: docker compose logs backend');
    process.exit(1);
  }

  console.log('\n✅ Backend API is healthy!');

  // 3. Generate wallets
  console.log('\n👤 Generating and funding developer wallets...');
  try {
    execSync('node scripts/seed/generate-wallets.js', { stdio: 'inherit' });
  } catch (error) {
    console.error('⚠️ Wallet generation/funding experienced issues:', error.message);
  }

  // 4. Seed database
  console.log('\n📊 Seeding database with deterministic sandbox data...');
  try {
    execSync('node scripts/seed/seed.js', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Database seeding failed:', error.message);
    process.exit(1);
  }

  // 5. Read wallets for dashboard presentation
  let wallets = {};
  if (fs.existsSync(WALLET_FILE)) {
    try {
      wallets = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
    } catch (e) {
      // Ignore
    }
  }

  // Print dashboard
  console.log('\n\n========================================================');
  console.log('🎉  ORYN FINANCE LOCAL DEV SANDBOX IS ONLINE  🎉');
  console.log('========================================================\n');
  console.log('📊 Active Services:');
  console.log('   🖥️  Frontend:     \x1b[36mhttp://localhost:8080\x1b[0m');
  console.log('   ⚙️  Backend API:   \x1b[36mhttp://localhost:5001\x1b[0m');
  console.log('   🔮 Mock Oracles:   \x1b[36mhttp://localhost:5005\x1b[0m');
  console.log('   🍃 MongoDB:        \x1b[36mmongodb://localhost:27017/oryn-finance\x1b[0m');
  console.log('   🔴 Redis:          \x1b[36mredis://localhost:6379\x1b[0m');

  console.log('\n🔑 Funded Testnet Identities:');
  if (wallets.creator) {
    console.log(`   🎨 Creator:  ${wallets.creator.publicKey}`);
    console.log(`      Secret:   \x1b[33m${wallets.creator.secretKey}\x1b[0m (Import into Freighter)`);
  }
  if (wallets.trader1) {
    console.log(`   📈 Trader 1: ${wallets.trader1.publicKey}`);
    console.log(`      Secret:   \x1b[33m${wallets.trader1.secretKey}\x1b[0m`);
  }
  if (wallets.trader2) {
    console.log(`   🐻 Trader 2: ${wallets.trader2.publicKey}`);
    console.log(`      Secret:   \x1b[33m${wallets.trader2.secretKey}\x1b[0m`);
  }
  if (wallets.admin) {
    console.log(`   👑 Admin:    ${wallets.admin.publicKey}`);
  }

  console.log('\n💡 Getting Started / Development workflow:');
  console.log('   1. Install Freighter extension in your browser.');
  console.log('   2. Add testnet custom network in Freighter (if not configured).');
  console.log('   3. Import the [Creator] or [Trader 1] secret key into Freighter.');
  console.log('   4. Connect Freighter to http://localhost:8080.');
  console.log('   5. Start creating markets, depositing liquidity, or executing trades!');

  console.log('\n🔮 Mock Oracle Endpoints:');
  console.log('   - CoinGecko price feed: GET http://localhost:5005/coingecko/simple/price?ids=bitcoin&vs_currencies=usd');
  console.log('   - News API sentiment:   GET http://localhost:5005/news-api/everything?q=bitcoin');
  console.log('   - Sports game details:  GET http://localhost:5005/sports-api/games/lakers_nba_2026');

  console.log('\n🛡️  Oracle Controls:');
  console.log('   - To change BTC price:  POST http://localhost:5005/control/price { "symbol": "bitcoin", "price": 130000 }');
  console.log('   - To resolve NBA game:  POST http://localhost:5005/control/game  { "gameId": "lakers_nba_2026", "winner": "Lakers", "finished": true }');

  console.log('\n🧹 Commands:');
  console.log('   - Stop Sandbox:        \x1b[32mnpm run sandbox:down\x1b[0m');
  console.log('   - Re-seed data:        \x1b[32mnpm run sandbox:seed\x1b[0m');
  console.log('   - Re-generate wallets: \x1b[32mnpm run sandbox:wallets\x1b[0m');
  console.log('   - View Backend Logs:   \x1b[32mdocker compose logs -f backend\x1b[0m');
  
  console.log('\n========================================================');
  console.log('Sandbox is running. Press Ctrl+C to disconnect bootstrap watcher.');
  console.log('========================================================');

  // Keep process alive to let developers run it, or they can exit
  // By attaching to docker-compose logs or simply waiting
  try {
    execSync('docker compose logs -f backend', { stdio: 'inherit' });
  } catch (e) {
    // Graceful exit on Ctrl+C
    console.log('\n👋 Watcher detached. Containers are still running in background.');
    console.log('Use "npm run sandbox:down" to stop the stack.');
  }
}

run().catch(console.error);

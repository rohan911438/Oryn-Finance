# Oryn Finance Developer Sandbox

This guide documents the local developer sandbox environment for Oryn Finance, allowing you to run the complete protocol—including backend services, databases, Redis, Mock Oracles, and funded demo wallets with seeded data—using a single command.

---

## 📋 Prerequisites

To run the Oryn Finance developer sandbox, you must have the following tools installed on your host machine:

1. **Docker & Docker Compose**:
   - [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or Docker Engine (Linux).
   - Ensure the Docker daemon is running before starting the sandbox.
2. **Node.js (v18 or higher)** & **npm**:
   - [Download Node.js](https://nodejs.org/).
3. **Freighter Wallet Extension** (for frontend interaction):
   - Install the extension in your browser via [freighter.app](https://www.freighter.app/).

---

## 🚀 One-Command Startup

To initialize and start the entire local environment, run the following command from the project root:

```bash
npm run sandbox
```

*Or, you can use the platform-specific wrapper scripts:*

- **macOS / Linux**:
  ```bash
  ./scripts/dev/start.sh
  ```
- **Windows (PowerShell)**:
  ```powershell
  ./scripts/dev/start.ps1
  ```

### What Happens Behind the Scenes:
1. Orchestrates and starts MongoDB, Redis, Mock Oracles, Backend, and Frontend containers via Docker Compose.
2. Polls the backend API until it is fully healthy and accepting connections.
3. Automatically generates development wallets (Admin, Creator, Trader 1, Trader 2) and saves them in `scripts/seed/wallets.json`.
4. Automatically requests testnet funds from Stellar's Friendbot to fund the generated identities.
5. Auto-populates the MongoDB database with deterministic, reproducible seed data (prediction markets, user profiles, initial liquidity pools, historical trades).
6. Displays a visual CLI dashboard showing active ports, local URLs, and wallet secret keys.
7. Attaches to the backend container logs for real-time log monitoring.

---

## 🛠️ Port Allocations & Services

Once the sandbox is running, the following services will be available:

| Service | Local URL | Description |
| :--- | :--- | :--- |
| **Frontend Web App** | `http://localhost:8080` | The primary UI. |
| **Backend REST API** | `http://localhost:5001` | Express API server. Health status at `/api/health/live`. |
| **Mock Oracles** | `http://localhost:5005` | Local mock oracle server simulating Chainlink, News API, and CoinGecko. |
| **MongoDB** | `mongodb://localhost:27017/oryn-finance` | Database storage. |
| **Redis** | `redis://localhost:6379` | WebSocket scaling & cache storage. |

---

## 🔑 Funded Testnet Identities

During startup, the sandbox creates four persistent wallets saved in `scripts/seed/wallets.json`:

1. **Admin**: Deploys, upgrades, and manually resolves disputes if needed.
2. **Creator**: Primary market maker. Automatically seeds the initial markets and deposits liquidity.
3. **Trader 1** (`bullish_trader`): Generated wallet funded on testnet, with initial YES tokens purchased on Bitcoin and Ethereum prediction markets.
4. **Trader 2** (`bear_patrol`): Generated wallet funded on testnet, with initial NO tokens purchased on Bitcoin prediction markets.

### How to use these wallets in the browser:
1. Open your browser's **Freighter** extension.
2. Go to **Settings** → **Import Account** → **Private Key**.
3. Copy the `Secret Key` displayed in your terminal (or read from `scripts/seed/wallets.json`) and paste it into Freighter.
4. Switch Freighter's active network to **Testnet** (Freighter Settings → Preferences → Network → Test Net).
5. Open `http://localhost:8080` in your browser and click "Connect Wallet". You can now trade using these identities!

---

## 🔮 Mock Oracle Services

Production APIs (CoinGecko, News API, etc.) require API keys and have strict rate limits. The developer sandbox contains a dedicated local oracle mock service running on port `5005` inside the docker network.

The following endpoints are mocked to respond to the backend API:

### 1. CoinGecko price feed:
- **Endpoint**: `GET http://localhost:5005/coingecko/simple/price?ids=bitcoin&vs_currencies=usd`
- **Default Prices**: Bitcoin = `$125,000`, Ethereum = `$4,200`, Solana = `$185`.

### 2. News API sentiment:
- **Endpoint**: `GET http://localhost:5005/news-api/everything?q=bitcoin`
- **Behavior**: Returns simulated news articles containing positive keywords (e.g. `great`, `growth`, `success`, `bullish`) by default to resolve news-related markets YES.

### 3. Sports API:
- **Endpoint**: `GET http://localhost:5005/sports-api/games/lakers_nba_2026`
- **Behavior**: Returns game results showing game completion and outcome parameters.

### 🎛️ Controlling Oracle Responses for Testing
You can dynamically alter oracle values while the sandbox is running using simple HTTP POST requests:

- **Change Token Price**:
  ```bash
  curl -X POST http://localhost:5005/control/price \
    -H "Content-Type: application/json" \
    -d '{"symbol": "bitcoin", "price": 115000}'
  ```
- **Change NBA Game Winner**:
  ```bash
  curl -X POST http://localhost:5005/control/game \
    -H "Content-Type: application/json" \
    -d '{"gameId": "lakers_nba_2026", "winner": "Boston Celtics", "finished": true}'
  ```
- **Register Custom News Articles**:
  ```bash
  curl -X POST http://localhost:5005/control/news \
    -H "Content-Type: application/json" \
    -d '{"query": "taylor swift", "articles": [{"title": "Taylor Swift cancels her album tour, massive failure", "description": "Crisis and bad losses hit the sentiment"}]}'
  ```

---

## ⚙️ Environment Variables Checklist

If you are running the backend or frontend outside of Docker (for example, debugging directly on the host machine), make sure your `.env` contains the following settings:

```env
# Point to local services instead of production
MONGODB_URI=mongodb://localhost:27017/oryn-finance
REDIS_URL=redis://localhost:6379

# Redirect Oracle requests to the local mock server
COINGECKO_API_URL=http://localhost:5005/coingecko
NEWS_API_URL=http://localhost:5005/news-api
SPORTS_API_URL=http://localhost:5005/sports-api

# Local Stellar network settings (Testnet Friendbot)
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# Generated wallet secrets (automatic config)
ADMIN_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

## 🧹 Sandbox Management & Reset

- **Shutdown the Sandbox**:
  Closes and terminates all Docker containers without deleting databases.
  ```bash
  npm run sandbox:down
  ```
- **Hard Reset (Clear Data & Restart)**:
  Tears down containers, deletes MongoDB volumes, and starts everything fresh.
  ```bash
  docker compose down -v
  npm run sandbox
  ```
- **Regenerate Wallets**:
  Funds fresh Stellar keypairs via Friendbot.
  ```bash
  npm run sandbox:wallets
  ```
- **Re-seed Data Only**:
  Resets the database tables to their default, deterministic starting state.
  ```bash
  npm run sandbox:seed
  ```

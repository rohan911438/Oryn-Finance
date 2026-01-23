# Oryn Finance Backend Server

A comprehensive Node.js backend server for the Oryn Finance prediction market platform, built with Express.js and integrated with Stellar blockchain and Soroban smart contracts.

## 🚀 Features

- **Stellar Blockchain Integration**: Full integration with Stellar network for account management, asset operations, and DEX trading
- **Soroban Smart Contracts**: Complete support for smart contract deployment, invocation, and market logic execution
- **RESTful API**: Comprehensive REST API with authentication, validation, and rate limiting
- **Real-time Updates**: WebSocket support for live market data and trade notifications
- **Oracle Services**: Automated market resolution with multiple oracle sources (CoinGecko, Sports API, News API)
- **Background Jobs**: Scheduled tasks for transaction indexing, market resolution, and statistics
- **MongoDB Integration**: Robust data models with proper indexing and relationships
- **Security**: JWT authentication, rate limiting, CORS, and helmet security headers
- **Documentation**: Complete API documentation with Swagger/OpenAPI 3.0
- **Oracle Services**: Automated market resolution using external data sources
- **Background Jobs**: Scheduled tasks for market monitoring, statistics updates, and data cleanup
- **Security**: JWT authentication, rate limiting, input validation, and comprehensive error handling
- **Monitoring**: Health checks, metrics, logging, and performance monitoring

## 📁 Project Structure

```
oryn-backend/
├── server.js                 # Main server entry point
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variables template
├── src/
│   ├── config/               # Configuration files
│   │   ├── database.js       # MongoDB connection
│   │   ├── logger.js         # Winston logging setup
│   │   └── swagger.js        # API documentation
│   ├── controllers/          # Request handlers
│   │   ├── marketController.js
│   │   ├── tradeController.js
│   │   ├── userController.js
│   │   ├── leaderboardController.js
│   │   ├── analyticsController.js
│   │   └── adminController.js
│   ├── middleware/           # Express middleware
│   │   ├── auth.js           # Authentication & authorization
│   │   ├── errorHandler.js   # Error handling
│   │   └── validation.js     # Input validation
│   ├── models/               # Database schemas
│   │   ├── Market.js         # Market model
│   │   ├── User.js           # User model
│   │   ├── Trade.js          # Trade model
│   │   ├── Position.js       # Position model
│   │   └── index.js          # Model exports
│   ├── routes/               # API routes
│   │   ├── health.js         # Health check endpoints
│   │   ├── markets.js        # Market endpoints
│   │   ├── trades.js         # Trading endpoints
│   │   ├── users.js          # User endpoints
│   │   ├── leaderboard.js    # Leaderboard endpoints
│   │   ├── analytics.js      # Analytics endpoints
│   │   └── admin.js          # Admin endpoints
│   ├── services/             # Business logic services
│   │   ├── stellarService.js # Stellar blockchain integration
│   │   ├── sorobanService.js # Soroban contract integration
│   │   ├── oracleService.js  # Market resolution oracle
│   │   ├── websocketHandler.js # Real-time communication
│   │   └── backgroundJobs.js # Scheduled tasks
│   └── utils/                # Utility functions
│       ├── stellarUtils.js   # Stellar helper functions
│       ├── marketUtils.js    # Market calculations
│       └── priceCalculator.js # AMM pricing logic
├── tests/                    # Test files
├── logs/                     # Log files
└── README.md                 # This file
```

## 🛠️ Setup Instructions

### Prerequisites

- **Node.js** >= 18.0.0
- **MongoDB** >= 5.0
- **Redis** >= 6.0 (optional, for caching)
- **Stellar Account** with funded testnet account

### Installation

1. **Clone the repository** (if not already in project)
```bash
cd oryn-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Setup**
```bash
cp .env.example .env
```

Edit `.env` file with your configuration:

```env
# Environment
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/oryn-finance

# JWT Secret (generate a secure random key)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
ADMIN_SECRET_KEY=your-stellar-admin-secret-key

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000

# Redis (optional)
REDIS_URL=redis://localhost:6379

# API Keys for Oracle Services
COINGECKO_API_KEY=your-coingecko-api-key
SPORTS_API_KEY=your-sports-api-key
NEWS_API_KEY=your-news-api-key

# Admin wallet addresses (comma-separated)
ADMIN_ADDRESSES=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

4. **Generate Stellar Admin Account**
```bash
# Generate a new Stellar keypair for admin operations
node -e "
const StellarSdk = require('stellar-sdk');
const pair = StellarSdk.Keypair.random();
console.log('Public Key:', pair.publicKey());
console.log('Secret Key:', pair.secret());
"
```

Add the secret key to your `.env` file as `ADMIN_SECRET_KEY`.

5. **Fund Admin Account (Testnet)**
```bash
# Fund the admin account on testnet
curl "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"
```

### Running the Server

#### Development Mode
```bash
npm run dev
```
Server will start on `http://localhost:5000` with auto-restart on file changes.

#### Production Mode
```bash
npm start
```

#### Available Scripts
```bash
npm run dev      # Development with nodemon
npm start        # Production server
npm test         # Run tests
npm run lint     # ESLint checking
npm run seed     # Seed database with sample data
```

### Database Setup

The application will automatically connect to MongoDB and create necessary collections. For local development:

1. **Install MongoDB**
```bash
# macOS with Homebrew
brew install mongodb-community

# Ubuntu
sudo apt-get install -y mongodb

# Or use Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

2. **Start MongoDB**
```bash
# macOS/Linux
brew services start mongodb-community
# or
mongod

# Docker
docker start mongodb
```

## 📚 API Documentation

### Base URL
```
Development: http://localhost:5000/api
Production: https://api.oryn.finance/api
```

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <jwt-token>
```

### Health Check
```http
GET /api/health
```

### Markets API

#### Get All Markets
```http
GET /api/markets?category=crypto&status=active&page=1&limit=20
```

#### Get Market Details
```http
GET /api/markets/{marketId}
```

#### Create Market
```http
POST /api/markets
Content-Type: application/json
Authorization: Bearer <token>

{
  "question": "Will Bitcoin reach $100,000 by end of 2024?",
  "category": "crypto",
  "expiresAt": "2024-12-31T23:59:59Z",
  "resolutionCriteria": "Based on CoinGecko price data",
  "initialLiquidity": 1000,
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

### Trading API

#### Execute Trade
```http
POST /api/trades
Content-Type: application/json
Authorization: Bearer <token>

{
  "marketId": "market_123456789",
  "tokenType": "yes",
  "tradeType": "buy",
  "amount": 100,
  "maxSlippage": 0.05,
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

#### Get Trade History
```http
GET /api/trades/history?marketId=market_123&page=1&limit=50
Authorization: Bearer <token>
```

### User API

#### Get User Profile
```http
GET /api/users/profile
Authorization: Bearer <token>
```

#### Update Profile
```http
PUT /api/users/profile
Content-Type: application/json
Authorization: Bearer <token>

{
  "username": "crypto_trader",
  "email": "trader@example.com",
  "bio": "Crypto enthusiast and prediction market trader"
}
```

### Leaderboard API

#### Top Traders
```http
GET /api/leaderboard/traders?timeframe=week&limit=10
```

#### Top Market Creators
```http
GET /api/leaderboard/creators?limit=10
```

## 🔌 WebSocket Events

Connect to WebSocket server:
```javascript
const socket = io('http://localhost:5000');

// Authenticate
socket.emit('authenticate', {
  token: 'your-jwt-token',
  walletAddress: 'GXXXXX...'
});

// Subscribe to market updates
socket.emit('subscribe_market', {
  marketId: 'market_123456789'
});

// Listen for market updates
socket.on('market_update', (data) => {
  console.log('Market update:', data);
});

// Listen for new trades
socket.on('new_trade', (data) => {
  console.log('New trade:', data);
});
```

## 🛡️ Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents API abuse with configurable limits
- **Input Validation**: Comprehensive validation using express-validator
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet Security**: Security headers and protection middleware
- **Error Handling**: Structured error responses without sensitive data
- **Logging**: Comprehensive audit trail of all operations

## 📊 Monitoring & Health

### Health Endpoints
```http
GET /api/health        # Comprehensive health check
GET /api/health/live   # Liveness probe (Kubernetes)
GET /api/health/ready  # Readiness probe (Kubernetes)
GET /api/health/metrics # Platform metrics
```

### Logging

Logs are written to:
- **Console**: Development and real-time monitoring
- **Files**: `logs/combined.log`, `logs/error.log`
- **Specialized Logs**: `logs/stellar.log`, `logs/database.log`

Log levels: `error`, `warn`, `info`, `http`, `debug`

### Background Jobs

Automatic background processes:
- **Stellar Transaction Indexing**: Every 30 seconds
- **Market Expiration Check**: Every hour
- **Statistics Updates**: Every 10 minutes
- **Leaderboard Updates**: Every 5 minutes
- **Data Cleanup**: Daily at 2 AM
- **Reputation Updates**: Every 6 hours

## 🚀 Deployment

### Environment-Specific Configuration

#### Development
```env
NODE_ENV=development
LOG_LEVEL=debug
STELLAR_NETWORK=testnet
```

#### Production
```env
NODE_ENV=production
LOG_LEVEL=info
STELLAR_NETWORK=public
STELLAR_HORIZON_URL=https://horizon.stellar.org
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/oryn-finance
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis
  
  mongo:
    image: mongo:latest
    volumes:
      - mongodb_data:/data/db
  
  redis:
    image: redis:alpine

volumes:
  mongodb_data:
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --grep "Market Controller"
```

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment mode |
| `PORT` | No | `5000` | Server port |
| `MONGODB_URI` | Yes | - | MongoDB connection string |
| `JWT_SECRET` | Yes | - | JWT signing secret |
| `STELLAR_NETWORK` | No | `testnet` | Stellar network (testnet/public) |
| `ADMIN_SECRET_KEY` | Yes | - | Stellar admin account secret |
| `FRONTEND_URL` | No | `http://localhost:3000` | Frontend URL for CORS |
| `REDIS_URL` | No | - | Redis connection string |
| `COINGECKO_API_KEY` | No | - | CoinGecko API key |

## 📈 Performance Considerations

- **Database Indexing**: Optimized indexes for frequent queries
- **Connection Pooling**: MongoDB connection pool configuration
- **Rate Limiting**: Prevents API abuse and ensures fair usage
- **Caching**: Redis caching for frequently accessed data
- **Background Processing**: Asynchronous job processing
- **WebSocket Optimization**: Efficient real-time communication

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

#### Database Connection Failed
```bash
# Check MongoDB is running
mongo --eval "db.adminCommand('ismaster')"

# Check connection string
echo $MONGODB_URI
```

#### Stellar Network Issues
```bash
# Test Stellar connection
curl https://horizon-testnet.stellar.org/

# Verify admin account
curl "https://horizon-testnet.stellar.org/accounts/YOUR_PUBLIC_KEY"
```

#### Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>
```

### Debug Mode
```bash
DEBUG=oryn:* npm run dev
```

## 📞 Support

For technical support or questions:
- Create an issue in the repository
- Contact the development team
- Check the API documentation at `/api-docs` (development only)

---

**Built with ❤️ for the Oryn Finance community**
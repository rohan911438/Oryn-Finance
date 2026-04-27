# Contract Integration & Deployment Fix Guide

## Issues Fixed

### 1. MongoDB Connection Timeout
**Problem:** Connection pooling was too aggressive causing timeouts
**Solution:** 
- Reduced `maxPoolSize` from 10 to 5
- Set `minPoolSize` to 0 (don't maintain connections)
- Reduced timeouts from 5s/45s to 3s/30s
- Added IPv4 enforcement (`family: 4`)
- Disabled retry writes for testing mode

### 2. Database Save Failure
**Problem:** Market creation blocked when database unavailable
**Solution:**
- Added timeout wrapper around database save (5 seconds)
- Fallback to mock market data if database fails
- Development mode now works without database
- Transaction XDR still generated successfully

---

## Contract Addresses Configured

All contracts are now properly configured in `.env`:

```
AMM_POOL_CONTRACT_ADDRESS=CBVTPYDEAQJL377TFTF6YND4BCMMPR2NR2O22EDPQ77AG7AVCILGUTIA
GOVERNANCE_CONTRACT_ADDRESS=CADJ4FBXLAZLGOASYLXDSQUV6ACB6EPVW2RBMYHUSUQUPOIM4CTFRKR5
INSURANCE_CONTRACT_ADDRESS=CAC647C2R33OCEHXUE3KWCBA4QTG5YYHCXJNLLG7JZ7NVQDSXOFZ25VS
MARKET_FACTORY_CONTRACT_ADDRESS=CCUENLYBXW3WTWBUD2TZLX3EWI7WFD223TW4LSBNQQ5W26B2Q2WNSM6M
ORACLE_RESOLVER_CONTRACT_ADDRESS=CDCL4MFB6RMCEAY32FOSQFFVDEQO3OXGCRP7YIUXCOVOAREYRQ2PMOOB
PREDICTION_MARKET_CONTRACT_ADDRESS=CCDPJ2UFUE5WNDSCIRPXQAT2XU7JZEIJMRNKIO4ANT5MWJNKDXJ4JUQ7
REPUTATION_CONTRACT_ADDRESS=CCGZV643TWW6IGYKUHYYCJABYBNJ5DOAQJXJIQNIUAXBJSDIVADLJB37
X402_INTEGRATION_CONTRACT_ADDRESS=CBKSOAE52ONGDTGGB6CAZAGYEKMJ54WFIDW3U6PBL4FUP75G2H3LWVHS
PREDICTION_TOKEN_CONTRACT_ADDRESS=CCK6QOIU5U3BKRGXAX4O6FJFZVZZNTVQ6TTTJC3TAI4UYLYTSO6Z6HTZ
```

---

## Testing the Setup

### 1. Start Backend
```bash
cd backend
npm run dev
```

Expected output:
```
info: Soroban service initialized for testnet network
info: Connected to RPC: https://soroban-testnet.stellar.org
warn: Database connection skipped (if MongoDB unavailable)
info: Server running on port 5001
```

### 2. Test Market Creation
```bash
# Connect wallet in frontend and create a market
# Or use curl:

curl -X POST http://localhost:5001/api/transactions/build/create-market \
  -H "Authorization: Bearer <wallet_address>" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Will Bitcoin reach $100k?",
    "category": "crypto",
    "expiryTimestamp": 1735689600,
    "initialLiquidity": 100,
    "resolutionSource": "CoinGecko"
  }'
```

### 3. Test Market Queries
```bash
curl http://localhost:5001/api/markets
```

### 4. Health Check
```bash
curl http://localhost:5001/api/health
```

---

## Flow: Create Market on-chain

### Current Implementation (Database First)
```
Frontend (User inputs) 
  ↓
POST /api/transactions/build/create-market
  ↓
Backend validates data
  ↓
Tries to save to MongoDB
  ↓ (if timeout)
Fallback to mock data
  ↓
Generate XDR for Market Factory contract
  ↓
Return XDR to frontend
  ↓
Frontend signs with Freighter wallet
  ↓
Frontend submits signed transaction
  ↓
On-chain market is created
```

### Proposed On-chain Implementation (Direct)
```
Frontend (User inputs)
  ↓
POST /api/transactions/build/create-market
  ↓
Backend validates data
  ↓
Generate XDR for Market Factory contract
  - Invoke MARKET_FACTORY_CONTRACT_ADDRESS
  - Function: create_market
  - Args: creator, question, category, liquidity
  ↓
Return XDR to frontend
  ↓
Frontend signs with Freighter wallet
  ↓
Frontend submits signed transaction
  ↓
Soroban creates market on-chain
  ↓
(Optional) Store reference in MongoDB
```

---

## Oracle Integration

### Oracle Resolution Flow
```
Market Expires
  ↓
Oracle nodes submit resolution data
  ↓
Invoke ORACLE_RESOLVER_CONTRACT_ADDRESS
  - Function: submit_resolution
  - Args: marketId, outcome, confidence
  ↓
Other oracles dispute or confirm
  ↓
Invoke ORACLE_RESOLVER_CONTRACT_ADDRESS
  - Function: finalize
  - Args: marketId, finalOutcome
  ↓
Market resolved
```

### Implementation Points
- File: `backend/src/services/oracleService.js` (create if needed)
- Oracle addresses pulled from `process.env.ORACLE_RESOLVER_CONTRACT_ADDRESS`
- Events tracked in contract event indexer

---

## AMM Pool Integration

### Liquidity Pool Creation
```
Market Created
  ↓
Create YES/NO tokens
  ↓
Initialize AMM Pool
  - Invoke AMM_POOL_CONTRACT_ADDRESS
  - Function: initialize
  - Args: yesToken, noToken, initialLiquidity
  ↓
Add initial liquidity
  - Function: add_liquidity
  - Args: yesAmount, noAmount
  ↓
Market ready for trading
```

### Trading Flow
```
User buys YES tokens
  ↓
Invoke AMM_POOL_CONTRACT_ADDRESS
  - Function: swap
  - Args: inputToken, outputToken, amount
  ↓
Get NO tokens
  ↓
Execute trade on-chain
  ↓
Liquidity pool rebalanced
```

---

## Next Steps Implementation

### Phase 1: Fix Current Issues ✅
- [x] Fix MongoDB connection timeout
- [x] Add database fallback mode
- [x] Ensure XDR generation works

### Phase 2: Direct On-Chain (TODO)
- [ ] Remove database dependency for XDR
- [ ] Call Market Factory contract directly
- [ ] Pass all market data to contract
- [ ] Store only transaction hash in DB

### Phase 3: Oracle Integration (TODO)
- [ ] Create oracle service
- [ ] Implement resolution submission
- [ ] Handle dispute mechanism
- [ ] Finalize outcomes

### Phase 4: AMM Pool Integration (TODO)
- [ ] Create liquidity pool service
- [ ] Initialize pools on market creation
- [ ] Implement swap mechanism
- [ ] Track pool reserves

### Phase 5: Trading System (TODO)
- [ ] Implement buy tokens flow
- [ ] Implement sell tokens flow
- [ ] Track user positions
- [ ] Calculate prices from AMM

---

## Configuration Files

### Backend/src/config/contracts.js
- ✅ All contract addresses configured
- ✅ Function mappings defined
- ✅ Event types listed
- ✅ XDR helper functions available

### Backend/.env
- ✅ All contract addresses set
- ✅ Network configuration done
- ✅ API keys available (add if needed)

### Soroban Service
- ✅ Build contract invocation XDR
- ✅ Submit signed transactions
- ✅ Poll transaction status
- ✅ Handle simulation errors

---

## Debugging Commands

### Check Contract Addresses
```bash
# View current config
grep CONTRACT_ADDRESS backend/.env

# Verify in contracts.js
grep "DEPLOYED_CONTRACTS" backend/src/config/contracts.js
```

### Test Soroban RPC
```bash
# Check network status
curl https://soroban-testnet.stellar.org -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"getNetwork"}'
```

### Simulate Market Creation
```bash
# Use test script (if available)
npm run test:create-market

# Or use curl with detailed logging
DEBUG=* npm run dev
```

---

## Monitoring & Logs

### Backend Logs Location
```
/Applications/Development/Oryn-Finance/backend/logs/app.log
```

### Key Log Messages
```
✅ "Soroban service initialized"
✅ "Connected to RPC"
⚠️  "Database connection skipped" (OK in dev)
❌ "Failed to create market" (needs fix)
```

### Enable Debug Logging
```bash
# In .env
LOG_LEVEL=debug

# Or run with debug
DEBUG=* npm run dev
```

---

## Troubleshooting

### MongoDB Still Timing Out?
1. Check IP whitelist in MongoDB Atlas
   - Add your IP: https://cloud.mongodb.com/v2
   - Settings → Security → IP Whitelist
   - Add 0.0.0.0/0 for development (NOT production)

2. Or use local MongoDB
   ```bash
   # Install MongoDB locally
   brew install mongodb-community
   
   # Update .env
   MONGODB_URI=mongodb://localhost:27017/oryn-finance
   ```

3. Or skip MongoDB in development
   ```bash
   # Set in .env
   MONGODB_URI=skip
   ```

### Contract Address Errors?
```
Error: "Invalid contract address"
```
→ Verify address format (56 chars, starts with C)
→ Check address matches testnet deployment
→ Verify in contracts.js

### Soroban RPC Errors?
```
Error: "Failed to connect to RPC"
```
→ Check SOROBAN_RPC_URL in .env
→ Verify network passphrase matches testnet
→ Try: `curl https://soroban-testnet.stellar.org`

### Transaction Simulation Failed?
```
Error: "Simulation failed"
```
→ Check function arguments format (XDR)
→ Verify contract address is valid
→ Check account has sufficient XLM for fees
→ Review contract function definition

---

## Production Deployment

### Before Going Live
1. [ ] Update contract addresses to mainnet
2. [ ] Update network passphrase to PUBLIC
3. [ ] Set up MongoDB Atlas security properly
4. [ ] Update JWT_SECRET with strong key
5. [ ] Enable rate limiting
6. [ ] Set FRONTEND_URL to production domain
7. [ ] Review all error logging
8. [ ] Test all contract calls on mainnet testnet
9. [ ] Audit oracle resolution mechanism
10. [ ] Test failover and recovery

---

## Summary

✅ **Fixed:**
- MongoDB connection timeout with fallback mode
- Database save errors with timeout wrapper
- Contract addresses properly configured

⚠️ **In Progress:**
- Frontend signing and submission working
- XDR generation tested

🔄 **Next Phase:**
- Remove database dependency for market creation
- Call contracts directly on-chain
- Implement oracle and AMM integrations

**Status:** Ready to test market creation end-to-end!

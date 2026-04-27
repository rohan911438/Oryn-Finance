#!/bin/bash

# Quick test script for Oryn Finance Backend

echo "==================================="
echo "Testing Oryn Finance Backend"
echo "==================================="
echo ""

# Test 1: Health Check
echo "1️⃣  Testing Health Endpoint..."
HEALTH=$(curl -s http://localhost:5001/api/health)
echo "$HEALTH" | jq . 2>/dev/null && echo "✅ Health check passed" || echo "❌ Health check failed"
echo ""

# Test 2: Get Markets
echo "2️⃣  Fetching Markets..."
MARKETS=$(curl -s http://localhost:5001/api/markets)
echo "$MARKETS" | jq '.data | length' 2>/dev/null
echo ""

# Test 3: Create Market
echo "3️⃣  Creating Test Market..."
WALLET="GAPZY3TLTEKFQOFCQXSBGEYUGYSNEGZRYKCRZHHEFXKFXQ2M5WBNZSFK"
EXPIRY=$(date -v+30d +%s)

MARKET=$(curl -s -X POST http://localhost:5001/api/transactions/build/create-market \
  -H "Authorization: Bearer $WALLET" \
  -H "Content-Type: application/json" \
  -d "{
    \"question\": \"Will Bitcoin reach \\\$100k by Q1 2026?\",
    \"category\": \"crypto\",
    \"expiryTimestamp\": $EXPIRY,
    \"initialLiquidity\": 100,
    \"resolutionSource\": \"CoinGecko\"
  }")

echo "$MARKET" | jq '.' 2>/dev/null

if echo "$MARKET" | jq -e '.success == true' >/dev/null 2>&1; then
  echo "✅ Market creation successful!"
  echo "$MARKET" | jq '.data | {marketId, xdrLength: (.xdr | length)}'
else
  echo "❌ Market creation failed"
  echo "$MARKET"
fi

echo ""
echo "==================================="
echo "Test complete!"
echo "==================================="

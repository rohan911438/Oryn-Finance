#!/bin/bash

# MongoDB Setup and Connection Testing Script
# For Oryn Finance Development

set -e

echo "=========================================="
echo "Oryn Finance - MongoDB Setup Helper"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ Error: backend/.env not found${NC}"
    echo "Please run from project root directory"
    exit 1
fi

echo -e "${YELLOW}1. Current MongoDB Configuration:${NC}"
grep -E "MONGODB_URI|DATABASE_URL" backend/.env || echo "No MongoDB vars found"
echo ""

# Extract MongoDB URI
MONGODB_URI=$(grep "MONGODB_URI=" backend/.env | cut -d'=' -f2-)

echo -e "${YELLOW}2. Testing MongoDB Connection...${NC}"
echo "Connection string: ${MONGODB_URI:0:50}..."
echo ""

# Test if mongosh is available
if ! command -v mongosh &> /dev/null; then
    echo -e "${YELLOW}⚠️  mongosh not installed. Install with:${NC}"
    echo "brew install mongodb-community"
    echo ""
    echo -e "${YELLOW}Or use npm to test:${NC}"
    echo "cd backend && npm test:db"
    exit 0
fi

echo -e "${YELLOW}3. Testing Connection...${NC}"
if mongosh --eval "db.version()" "$MONGODB_URI" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MongoDB connection successful!${NC}"
else
    echo -e "${RED}❌ MongoDB connection failed${NC}"
    echo ""
    echo -e "${YELLOW}Solutions:${NC}"
    echo "1. Add your IP to MongoDB Atlas whitelist:"
    echo "   https://cloud.mongodb.com → Security → IP Whitelist"
    echo ""
    echo "2. Or use local MongoDB:"
    echo "   brew install mongodb-community"
    echo "   brew services start mongodb-community"
    echo "   Update MONGODB_URI=mongodb://localhost:27017/oryn-finance"
    echo ""
    echo "3. Or run backend without database:"
    echo "   npm run dev  # Will skip DB and continue"
    exit 1
fi

echo ""
echo -e "${YELLOW}4. MongoDB Collections:${NC}"
mongosh --eval "db.getCollectionNames()" "$MONGODB_URI"

echo ""
echo -e "${GREEN}✅ MongoDB setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Start backend: cd backend && npm run dev"
echo "2. Create a market from frontend"
echo "3. Check logs for successful transactions"

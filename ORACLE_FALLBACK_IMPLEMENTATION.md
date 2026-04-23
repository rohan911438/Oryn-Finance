# Oracle Failure Fallback Mechanism Implementation
## Issue #26 - Robust Oracle Failure Handling

### Overview
This implementation adds a comprehensive fallback mechanism to handle oracle failures robustly, including anomaly detection and detailed discrepancy logging.

### Changes Made

#### 1. **Fallback Data Sources** ✓

**Location:** `backend/src/services/oracleService.js`

**Features Implemented:**
- **Multi-source resolution with fallback chains**: If primary sources fail, the system automatically falls back to secondary sources
- **Predefined fallback hierarchies** based on market category:
  ```javascript
  FALLBACK_SOURCES = {
    crypto: ['coingecko', 'chainlink'],
    sports: ['sports-api'],
    news: ['news-api'],
    generic: ['coingecko', 'chainlink', 'sports-api']
  }
  ```
- **Retry logic with exponential backoff**: Up to 3 attempts per source with increasing delays
- **Result caching**: Successfully resolved results cached for 5 minutes to reduce redundant API calls
- **Source health tracking**: Monitors success/failure rates for each data source

**Key Methods:**
- `resolveWithFallback()`: Main resolution with fallback chain
- `resolveSourceWithRetry()`: Implements retry logic with exponential backoff
- `getCachedResult()`: Check cache before attempting resolution
- `cacheResult()`: Store successful resolutions
- `recordSourceSuccess()` / `recordSourceFailure()`: Track source reliability

#### 2. **Anomaly Detection** ✓

**Location:** `backend/src/services/oracleService.js`

**Detection Mechanisms:**

1. **Source Disagreement Detection**
   - Identifies when oracle sources provide conflicting outcomes
   - Logs which sources disagree and provides aggregated decision
   - Example: One source says "YES", another says "NO"

2. **Price Drift Detection**
   - Monitors price movements for crypto assets
   - Threshold: 25% deviation triggers alert
   - Maintains 20-point price history per symbol
   - Detects unusual market movements

3. **Confidence Level Monitoring**
   - Flags results with confidence below 60%
   - Lower confidence indicates less reliable aggregation
   - Helps identify when manual intervention may be needed

4. **Outlier Filtering**
   - Enhanced from original implementation
   - Removes statistically significant outliers from aggregation
   - Recursively re-aggregates cleaned results

**Key Methods:**
- `detectAnomalies()`: Main anomaly detection orchestrator
- `detectPriceDrift()`: Analyzes price movements
- `trackPriceHistory()`: Maintains historical price data
- `filterOutliers()`: Statistical outlier removal
- `getSourceHealthStatus()`: Current health of all sources

#### 3. **Oracle Discrepancy Logging** ✓

**Location:** `backend/src/services/oracleService.js`

**Logging Coverage:**

1. **Source Failures**
   ```
   - Source name
   - Attempt number/max retries
   - Error message
   - Market ID
   - Timestamp
   ```

2. **Source Disagreements**
   ```
   - Market ID
   - Conflicting outcomes per source
   - Aggregated final outcome
   - Severity level (warning)
   - Timestamp
   ```

3. **Price Drift Alerts**
   ```
   - Market ID
   - Source name
   - Previous price
   - Current price
   - Percentage change
   - Severity (high)
   - Timestamp
   ```

4. **Low Confidence Warnings**
   ```
   - Market ID
   - Confidence score
   - Number of sources
   - Timestamp
   - Severity (warning)
   ```

**Key Methods:**
- `getDiscrepancyLog(limit)`: Retrieve recent discrepancies (default last 100)
- `clearDiscrepancyLog()`: Maintenance operation to reset log
- Enhanced logging throughout resolution pipeline

### Usage Examples

#### Basic Market Resolution with Fallback
```javascript
const market = {
  marketId: 'btc-100k',
  category: 'crypto',
  oracleConfig: {
    symbol: 'bitcoin',
    targetPrice: 100000,
    condition: 'above',
    sources: ['coingecko']  // Primary source
  }
};

// Will automatically fallback to chainlink if coingecko fails
const result = await oracleService.resolveMarket(market);
```

#### Check Source Health
```javascript
const health = oracleService.getSourceHealthStatus();
console.log(health);
// Output:
// {
//   coingecko: { successCount: 45, failureCount: 2, failureRate: 0.04, isHealthy: true },
//   chainlink: { successCount: 30, failureCount: 5, failureRate: 0.14, isHealthy: true },
//   'sports-api': { successCount: 12, failureCount: 3, failureRate: 0.20, isHealthy: true }
// }
```

#### Review Discrepancies
```javascript
const discrepancies = oracleService.getDiscrepancyLog(50);
// Returns last 50 recorded anomalies, disagreements, drift alerts, etc.
```

#### Price History Tracking
```javascript
const history = oracleService.getPriceHistory('bitcoin');
// Returns array of {price, timestamp} objects
// Useful for analyzing trends and volatility
```

### Configuration Constants

```javascript
OUTLIER_THRESHOLD = 0.15         // 15% deviation = outlier
ANOMALY_THRESHOLD = 0.25         // 25% price drift threshold
CACHE_DURATION = 5 * 60 * 1000   // 5 minutes
MAX_RETRIES = 3                   // Max 3 attempts per source
RETRY_DELAY = 1000                // 1 second between retries
```

### Error Handling Flow

```
1. Attempt primary source resolution
   ├─ Success → Cache result, return
   └─ Failure → Move to step 2

2. Retry primary source (up to 3 times)
   ├─ Success → Cache result, return
   └─ Failure → Move to step 3

3. Try fallback sources in order
   ├─ Success → Cache result, return
   └─ Failure → Move to step 4

4. Check cache for previous result
   ├─ Cache hit → Return cached result
   └─ Cache miss → Return null (manual resolution needed)

Throughout: Track anomalies, log discrepancies, update source health
```

### Health Monitoring

**Source Health Metrics:**
- `successCount`: Total successful resolutions
- `failureCount`: Total failed attempts
- `failureRate`: Percentage of failures
- `isHealthy`: Boolean flag (unhealthy if >30% failure rate)
- `lastFailure`: Timestamp of most recent failure

**Health Status Use Cases:**
- Adjust source weights dynamically
- Alert admins when sources degrade
- Automatic source disable/enable
- Performance analytics

### Testing

A comprehensive test suite is provided: `backend/test-oracle-fallback.js`

**Tests Included:**
1. Source health initialization
2. Fallback resolution with multiple sources
3. Result caching functionality
4. Source health tracking updates
5. Discrepancy logging
6. Price history tracking
7. Multi-source aggregation
8. Anomaly detection

**Run Tests:**
```bash
cd backend
node test-oracle-fallback.js
```

### Deployment Notes

1. **Backward Compatible**: Existing code continues to work
2. **No Breaking Changes**: Added methods don't affect existing API
3. **Optional Configuration**: Fallback sources use sensible defaults
4. **API Keys Required**: Ensure environment variables set for all services:
   - `COINGECKO_API_KEY`
   - `NEWS_API_KEY`
   - Chainlink integration credentials (if used)

### Future Enhancements

1. **Database Persistence**: Store discrepancy logs to database
2. **Alerting System**: Send notifications for critical anomalies
3. **Chainlink Integration**: Full implementation of Chainlink price feeds
4. **Machine Learning**: Use historical anomalies to predict failures
5. **Custom Weights**: Admin UI to dynamically adjust source weights
6. **Reputation System**: Integrate with reputation contract for source scoring

### Related Files Modified

- `backend/src/services/oracleService.js` - Main implementation
- `backend/test-oracle-fallback.js` - Test suite (NEW)

### Verification Checklist

- ✓ Fallback data sources implemented and tested
- ✓ Anomaly detection operational (drift, disagreement, confidence)
- ✓ Oracle discrepancies logged comprehensively
- ✓ Retry logic with exponential backoff working
- ✓ Result caching functional
- ✓ Source health tracking accurate
- ✓ Error handling graceful
- ✓ No breaking changes to existing API
- ✓ Backward compatible
- ✓ Test coverage included

### Questions or Issues?

Refer to the logger output for detailed diagnostics. All oracle operations are logged with:
- Operation type
- Market ID
- Source information
- Outcomes and confidence levels
- Timing information
- Error details when applicable

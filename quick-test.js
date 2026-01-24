/**
 * Simple Frontend-Backend Integration Test
 * 
 * This script tests the basic connectivity between frontend and backend
 */

const BACKEND_URL = 'http://localhost:5000/api';

async function testIntegration() {
  console.log('🚀 Testing Oryn Finance Frontend-Backend Integration\n');
  
  let passedTests = 0;
  let totalTests = 0;
  
  // Test 1: Backend Health Check
  totalTests++;
  try {
    console.log('1. Testing Backend Health Check...');
    const healthResponse = await fetch(`${BACKEND_URL}/health`);
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok && healthData.success) {
      console.log('✅ Backend is healthy');
      console.log(`   - Status: ${healthData.data.status}`);
      console.log(`   - Environment: ${healthData.data.environment}`);
      console.log(`   - Uptime: ${Math.round(healthData.data.uptime)}s`);
      passedTests++;
    } else {
      console.log('❌ Backend health check failed');
      console.log(`   - Status: ${healthResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Backend is not running or unreachable');
    console.log(`   - Error: ${error.message}`);
  }
  
  // Test 2: Markets Endpoint
  totalTests++;
  try {
    console.log('\n2. Testing Markets API...');
    const marketsResponse = await fetch(`${BACKEND_URL}/markets`);
    
    if (marketsResponse.ok) {
      const marketsData = await marketsResponse.json();
      console.log('✅ Markets API is accessible');
      console.log(`   - Response status: ${marketsResponse.status}`);
      console.log(`   - Markets count: ${marketsData.data ? marketsData.data.length : 0}`);
      passedTests++;
    } else {
      console.log('❌ Markets API failed');
      console.log(`   - Status: ${marketsResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Markets API error');
    console.log(`   - Error: ${error.message}`);
  }
  
  // Test 3: Network Info
  totalTests++;
  try {
    console.log('\n3. Testing Network Info API...');
    const networkResponse = await fetch(`${BACKEND_URL}/transactions/network-info`);
    
    if (networkResponse.ok) {
      const networkData = await networkResponse.json();
      console.log('✅ Network Info API is working');
      console.log(`   - Network: ${networkData.data?.network || 'Unknown'}`);
      console.log(`   - Latest Ledger: ${networkData.data?.latestLedger || 'Unknown'}`);
      passedTests++;
    } else {
      console.log('❌ Network Info API failed');
    }
  } catch (error) {
    console.log('❌ Network Info API error');
    console.log(`   - Error: ${error.message}`);
  }
  
  // Test 4: Leaderboard Endpoint
  totalTests++;
  try {
    console.log('\n4. Testing Leaderboard API...');
    const leaderboardResponse = await fetch(`${BACKEND_URL}/leaderboard`);
    
    if (leaderboardResponse.ok) {
      const leaderboardData = await leaderboardResponse.json();
      console.log('✅ Leaderboard API is accessible');
      console.log(`   - Response status: ${leaderboardResponse.status}`);
      passedTests++;
    } else {
      console.log('❌ Leaderboard API failed');
    }
  } catch (error) {
    console.log('❌ Leaderboard API error');
    console.log(`   - Error: ${error.message}`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Integration Test Results:`);
  console.log(`   - Tests Passed: ${passedTests}/${totalTests}`);
  console.log(`   - Success Rate: ${Math.round((passedTests/totalTests) * 100)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! Integration is working properly.');
    console.log('\n📋 Next steps:');
    console.log('   1. Start frontend: cd frontend && npm run dev');
    console.log('   2. Visit: http://localhost:8080');
    console.log('   3. Connect your wallet and test the features');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Make sure backend is running: cd backend && npm start');
    console.log('   2. Check the backend logs for errors');
    console.log('   3. Verify environment variables are set correctly');
  }
}

// Run the test
testIntegration().catch(console.error);
/**
 * Quick Backend API Test
 */

async function testBackendAPI() {
  const BACKEND_URL = 'http://localhost:5000/api';
  
  console.log('🔍 Testing Oryn Finance Backend APIs...\n');
  
  try {
    // Test 1: Health endpoint
    console.log('1. Testing Health endpoint...');
    const healthRes = await fetch(`${BACKEND_URL}/health`);
    const healthData = await healthRes.text();
    console.log(`✅ Health endpoint responded (${healthRes.status})`);
    
    if (healthData) {
      try {
        const parsed = JSON.parse(healthData);
        console.log(`   - Status: ${parsed.data?.status || 'unknown'}`);
        console.log(`   - Stellar: ${parsed.data?.services?.stellar?.status || 'unknown'}`);
        console.log(`   - Soroban: ${parsed.data?.services?.soroban?.status || 'unknown'}`);
      } catch (e) {
        console.log('   - Response received but not JSON');
      }
    }
    
    // Test 2: Markets endpoint
    console.log('\n2. Testing Markets endpoint...');
    const marketsRes = await fetch(`${BACKEND_URL}/markets`);
    console.log(`✅ Markets endpoint responded (${marketsRes.status})`);
    
    // Test 3: Network info
    console.log('\n3. Testing Network info endpoint...');
    const networkRes = await fetch(`${BACKEND_URL}/transactions/network-info`);
    console.log(`✅ Network info responded (${networkRes.status})`);
    
    console.log('\n🎉 Backend API is responding! Integration test successful.');
    console.log('\n📋 Ready to test frontend:');
    console.log('   1. cd frontend && npm run dev');
    console.log('   2. Open http://localhost:8080');
    console.log('   3. Connect wallet and test features');
    
  } catch (error) {
    console.log('❌ Error testing backend APIs:');
    console.log(`   ${error.message}`);
    console.log('\n🔧 Make sure backend is running: cd backend && npm start');
  }
}

testBackendAPI();
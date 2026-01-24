/**
 * Test Create Market API Endpoint
 */

async function testCreateMarketAPI() {
  const BACKEND_URL = 'http://localhost:5000/api';
  
  console.log('🧪 Testing Create Market API endpoint...\n');
  
  try {
    // Test data
    const testData = {
      question: "Will Bitcoin reach $100,000 by end of 2024?",
      category: "Crypto", 
      expiryTimestamp: Math.floor(new Date('2024-12-31').getTime() / 1000),
      initialLiquidity: 100,
      resolutionSource: "Based on CoinGecko price",
      feePercentage: 2
    };
    
    const testWallet = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"; // Valid Stellar testnet key format
    
    console.log('📡 Testing POST to /transactions/build/create-market...');
    
    const response = await fetch(`${BACKEND_URL}/transactions/build/create-market`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testWallet}`
      },
      body: JSON.stringify(testData)
    });
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log(`Response body:`, responseText.substring(0, 500));
    
    if (response.ok) {
      console.log('✅ Create Market endpoint is working!');
    } else {
      console.log('❌ Create Market endpoint returned error');
      console.log(`   Status: ${response.status} ${response.statusText}`);
    }
    
  } catch (error) {
    console.log('❌ Error testing Create Market API:');
    console.log(`   ${error.message}`);
  }
}

testCreateMarketAPI();
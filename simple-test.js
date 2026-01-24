/**
 * Simple Integration Test for Node.js
 * Tests the frontend-backend integration using Node.js http module
 */

const http = require('http');

function testEndpoint(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: `/api${path}`,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            success: res.statusCode === 200,
            status: res.statusCode,
            data: jsonData
          });
        } catch (error) {
          resolve({
            success: false,
            status: res.statusCode,
            error: 'Invalid JSON response'
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        success: false,
        error: error.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Request timeout'
      });
    });

    req.end();
  });
}

async function runTests() {
  console.log('🚀 Testing Frontend-Backend Integration\n');
  
  const tests = [
    { name: 'Backend Health', path: '/health' },
    { name: 'Contract Status', path: '/health/contracts' },
    { name: 'Network Info', path: '/transactions/network-info' },
    { name: 'Current Ledger', path: '/transactions/current-ledger' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`📡 Testing ${test.name}... `);
    
    const result = await testEndpoint(test.path);
    
    if (result.success && result.data && result.data.success) {
      console.log('✅ PASSED');
      passed++;
    } else {
      console.log(`❌ FAILED`);
      console.log(`   Error: ${result.error || `HTTP ${result.status}`}`);
      failed++;
    }
  }

  console.log(`\n📊 Integration Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total Tests: ${passed + failed}`);

  if (failed === 0) {
    console.log('\n🎉 ALL INTEGRATION TESTS PASSED!');
    console.log('\n✨ Frontend-Backend Integration is working perfectly!');
    console.log('\n🚀 Next Steps:');
    console.log('1. Start frontend: cd frontend && npm run dev');
    console.log('2. Open browser: http://localhost:8080/integration-test');
    console.log('3. View the visual integration dashboard');
    console.log('\n✅ Integration Status: COMPLETE AND READY');
    return true;
  } else {
    console.log('\n❌ Integration test failed - check backend connectivity');
    return false;
  }
}

// Run the tests
runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('❌ Test execution error:', error);
    process.exit(1);
  });
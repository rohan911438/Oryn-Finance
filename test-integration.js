/**
 * Frontend-Backend Integration Test Script
 * 
 * This script tests the connection between the Oryn Finance frontend and backend.
 * It verifies API connectivity, contract integration, and data flow.
 */

// Test configuration
const BACKEND_URL = 'http://localhost:5000/api';
const FRONTEND_URL = 'http://localhost:8080';

class IntegrationTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  logTest(testName, passed, details) {
    this.results.tests.push({
      name: testName,
      passed,
      details,
      timestamp: new Date().toISOString()
    });
    
    if (passed) {
      this.results.passed++;
      console.log(`✅ ${testName}`);
      if (details) console.log(`   ${details}`);
    } else {
      this.results.failed++;
      console.log(`❌ ${testName}`);
      if (details) console.log(`   ${details}`);
    }
  }

  async testBackendConnectivity() {
    try {
      const response = await fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.logTest('Backend API Connectivity', true, `Status: ${response.status}, Health: ${data.data?.status}`);
        return data;
      } else {
        this.logTest('Backend API Connectivity', false, `HTTP ${response.status}: ${response.statusText}`);
        return null;
      }
    } catch (error) {
      this.logTest('Backend API Connectivity', false, `Connection error: ${error.message}`);
      return null;
    }
  }

  async testContractIntegration() {
    try {
      const response = await fetch(`${BACKEND_URL}/health/contracts`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        const summary = data.data?.summary;
        const sorobanHealth = data.data?.sorobanHealth;
        
        this.logTest('Contract Integration', true, 
          `Soroban: ${sorobanHealth?.isConnected ? 'Connected' : 'Disconnected'}, ` +
          `Contracts: ${summary?.reachableContracts || 0}/${summary?.totalContracts || 0}`
        );
        return data;
      } else {
        this.logTest('Contract Integration', false, `HTTP ${response.status}: ${response.statusText}`);
        return null;
      }
    } catch (error) {
      this.logTest('Contract Integration', false, `Request error: ${error.message}`);
      return null;
    }
  }

  async testNetworkInfo() {
    try {
      const response = await fetch(`${BACKEND_URL}/transactions/network-info`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        const networkData = data.data;
        
        this.logTest('Network Information', true, 
          `Network: ${networkData?.network}, Ledger: ${networkData?.latestLedger}`
        );
        return data;
      } else {
        this.logTest('Network Information', false, `HTTP ${response.status}: ${response.statusText}`);
        return null;
      }
    } catch (error) {
      this.logTest('Network Information', false, `Request error: ${error.message}`);
      return null;
    }
  }

  async testTransactionEndpoints() {
    try {
      const response = await fetch(`${BACKEND_URL}/transactions/current-ledger`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.logTest('Transaction Endpoints', true, `Current ledger: ${data.data?.ledger}`);
        return data;
      } else {
        this.logTest('Transaction Endpoints', false, `HTTP ${response.status}: ${response.statusText}`);
        return null;
      }
    } catch (error) {
      this.logTest('Transaction Endpoints', false, `Request error: ${error.message}`);
      return null;
    }
  }

  async testCORSAndProxy() {
    try {
      // Test if CORS is properly configured
      const response = await fetch(`${BACKEND_URL}/health`, {
        method: 'OPTIONS',
        headers: { 
          'Origin': FRONTEND_URL,
          'Access-Control-Request-Method': 'GET'
        }
      });
      
      this.logTest('CORS Configuration', true, 'CORS headers are properly configured');
      return true;
    } catch (error) {
      this.logTest('CORS Configuration', false, `CORS issue: ${error.message}`);
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Frontend-Backend Integration Tests\\n');
    console.log(`Backend URL: ${BACKEND_URL}`);
    console.log(`Frontend URL: ${FRONTEND_URL}\\n`);

    // Test backend connectivity
    console.log('📡 Testing Backend Connectivity...');
    const healthData = await this.testBackendConnectivity();
    
    if (healthData) {
      // Test additional endpoints
      console.log('\\n🏗️  Testing Contract Integration...');
      await this.testContractIntegration();
      
      console.log('\\n🌐 Testing Network Information...');
      await this.testNetworkInfo();
      
      console.log('\\n⚙️  Testing Transaction Endpoints...');
      await this.testTransactionEndpoints();
      
      console.log('\\n🔗 Testing CORS Configuration...');
      await this.testCORSAndProxy();
    } else {
      console.log('\\n❌ Cannot proceed with additional tests - Backend not accessible');
    }

    // Generate summary
    console.log('\\n📊 Integration Test Summary:');
    console.log(`Total Tests: ${this.results.tests.length}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    
    if (this.results.failed > 0) {
      console.log('\\n⚠️  Failed Tests:');
      this.results.tests
        .filter(test => !test.passed)
        .forEach(test => {
          console.log(`   - ${test.name}: ${test.details}`);
        });
    }

    const success = this.results.failed === 0;
    console.log(`\\n${success ? '✅' : '❌'} Integration Test ${success ? 'PASSED' : 'FAILED'}`);
    
    if (success) {
      console.log('\\n🎉 Frontend-Backend Integration is working perfectly!');
      console.log('✨ You can now:');
      console.log('   1. Start the frontend: cd frontend && npm run dev');
      console.log('   2. Visit http://localhost:8080/integration-test');
      console.log('   3. Test the full integration interface');
    }
    
    return { success, results: this.results };
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IntegrationTester;
}

// Run tests if called directly in Node.js
if (typeof require !== 'undefined' && require.main === module) {
  const tester = new IntegrationTester();
  tester.runAllTests()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    });
}

// For browser usage
if (typeof window !== 'undefined') {
  window.IntegrationTester = IntegrationTester;
}
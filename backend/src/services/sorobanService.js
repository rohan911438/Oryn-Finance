const StellarSdk = require('stellar-sdk');
const logger = require('../config/logger');
const contractConfig = require('../config/contracts');

class SorobanService {
  constructor() {
    const networkConfig = contractConfig.getNetworkConfig();
    
    this.network = contractConfig.CURRENT_NETWORK;
    this.server = new StellarSdk.SorobanRpc.Server(networkConfig.sorobanRpcUrl);
    this.networkPassphrase = networkConfig.passphrase;
    this.contracts = contractConfig.DEPLOYED_CONTRACTS;
    this.xdrHelpers = contractConfig.XDR_HELPERS;
    
    logger.info(`Soroban service initialized for ${this.network} network`);
    logger.info(`Connected to RPC: ${networkConfig.sorobanRpcUrl}`);
    
    // Validate all contract addresses
    if (!contractConfig.validateAllContracts()) {
      logger.warn('Some contract addresses are invalid');
    }
  }

  /* ============================================================
     CONTRACT INTERACTION METHODS
  ============================================================ */

  /**
   * Build an unsigned XDR transaction for contract invocation
   * This XDR will be sent to frontend for Freighter signing
   */
  async buildContractInvocationXDR(userAddress, contractName, functionName, args = []) {
    try {
      const contractAddress = contractConfig.getContractAddress(contractName);
      const contractFunction = contractConfig.getContractFunction(contractName, functionName);
      
      const account = await this.server.getAccount(userAddress);
      
      // Create contract instance
      const contract = new StellarSdk.Contract(contractAddress);
      
      // Build the transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(contract.call(contractFunction, ...args))
        .setTimeout(300) // 5 minutes
        .build();

      // Simulate the transaction to get proper fee
      const simulation = await this.server.simulateTransaction(transaction);
      
      if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      // Update transaction with simulation results
      const simulatedTransaction = StellarSdk.SorobanRpc.assembleTransaction(
        transaction,
        simulation
      );

      return {
        xdr: simulatedTransaction.toXDR(),
        simulation: simulation,
        fees: simulation.minResourceFee || StellarSdk.BASE_FEE
      };
    } catch (error) {
      logger.error('Failed to build contract invocation XDR:', error);
      throw new Error(`Failed to build XDR: ${error.message}`);
    }
  }

  /**
   * Submit a signed XDR transaction to the network
   */
  async submitSignedTransaction(signedXDR) {
    try {
      const transaction = StellarSdk.TransactionBuilder.fromXDR(
        signedXDR,
        this.networkPassphrase
      );

      const result = await this.server.sendTransaction(transaction);
      
      if (result.status === 'PENDING') {
        // Poll for final result
        const finalResult = await this.pollTransactionStatus(result.hash);
        return finalResult;
      }

      return result;
    } catch (error) {
      logger.error('Failed to submit signed transaction:', error);
      throw new Error(`Failed to submit transaction: ${error.message}`);
    }
  }

  /**
   * Query contract state (read-only)
   */
  async queryContract(contractName, functionName, args = []) {
    try {
      const contractAddress = contractConfig.getContractAddress(contractName);
      const contractFunction = contractConfig.getContractFunction(contractName, functionName);
      
      // Create contract instance
      const contract = new StellarSdk.Contract(contractAddress);
      
      // Create a dummy account for simulation
      const dummyKeypair = StellarSdk.Keypair.random();
      const dummyAccount = new StellarSdk.Account(dummyKeypair.publicKey(), '0');

      const transaction = new StellarSdk.TransactionBuilder(dummyAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(contract.call(contractFunction, ...args))
        .setTimeout(300)
        .build();

      const simulation = await this.server.simulateTransaction(transaction);

      if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
        throw new Error(`Query simulation failed: ${simulation.error}`);
      }

      return {
        result: simulation.result?.retval ? 
          StellarSdk.scValToNative(simulation.result.retval) : null,
        rawResult: simulation.result
      };
    } catch (error) {
      logger.error('Failed to query contract:', error);
      throw new Error(`Failed to query contract: ${error.message}`);
    }
  }

  /**
   * Poll transaction status until completion
   */
  async pollTransactionStatus(txHash, maxAttempts = 10, intervalMs = 2000) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await this.server.getTransaction(txHash);
        
        if (result.status !== 'NOT_FOUND') {
          return result;
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error(`Transaction status polling failed: ${error.message}`);
        }
      }
    }
    
    throw new Error('Transaction status polling timeout');
  }

  /* ============================================================
     HIGH-LEVEL CONTRACT METHODS
  ============================================================ */

  // Market Factory Contract Methods
  async buildCreateMarketXDR(creatorAddress, marketData) {
    const args = [
      this.xdrHelpers.toXdr.address(creatorAddress),
      this.xdrHelpers.toXdr.string(marketData.question),
      this.xdrHelpers.toXdr.string(marketData.category),
      this.xdrHelpers.toXdr.number(marketData.expiryTimestamp),
      this.xdrHelpers.toXdr.number(marketData.initialLiquidity),
      this.xdrHelpers.toXdr.address(marketData.marketContract),
      this.xdrHelpers.toXdr.address(marketData.poolAddress),
      this.xdrHelpers.toXdr.address(marketData.yesToken),
      this.xdrHelpers.toXdr.address(marketData.noToken)
    ];

    return this.buildContractInvocationXDR(
      creatorAddress, 
      'MARKET_FACTORY', 
      'createMarket', 
      args
    );
  }

  async getMarketData(marketId) {
    const args = [this.xdrHelpers.toXdr.number(marketId)];
    return this.queryContract('MARKET_FACTORY', 'getMarket', args);
  }

  async getAllMarkets() {
    return this.queryContract('MARKET_FACTORY', 'getAllMarkets', []);
  }

  // Prediction Market Contract Methods
  async buildBuyTokensXDR(userAddress, marketContract, tokenType, amount, price) {
    const args = [
      this.xdrHelpers.toXdr.address(userAddress),
      this.xdrHelpers.toXdr.string(tokenType), // 'YES' or 'NO'
      this.xdrHelpers.toXdr.number(amount),
      this.xdrHelpers.toXdr.number(price)
    ];

    return this.buildContractInvocationXDR(
      userAddress,
      'PREDICTION_MARKET_TEMPLATE',
      'buy',
      args
    );
  }

  async buildSellTokensXDR(userAddress, marketContract, tokenType, amount, price) {
    const args = [
      this.xdrHelpers.toXdr.address(userAddress),
      this.xdrHelpers.toXdr.string(tokenType),
      this.xdrHelpers.toXdr.number(amount),
      this.xdrHelpers.toXdr.number(price)
    ];

    return this.buildContractInvocationXDR(
      userAddress,
      'PREDICTION_MARKET_TEMPLATE',
      'sell',
      args
    );
  }

  async buildClaimWinningsXDR(userAddress, marketContract) {
    const args = [this.xdrHelpers.toXdr.address(userAddress)];

    return this.buildContractInvocationXDR(
      userAddress,
      'PREDICTION_MARKET_TEMPLATE',
      'claim',
      args
    );
  }

  async getUserPosition(marketContract, userAddress) {
    const args = [this.xdrHelpers.toXdr.address(userAddress)];
    return this.queryContract('PREDICTION_MARKET_TEMPLATE', 'getPosition', args);
  }

  // AMM Pool Contract Methods
  async buildSwapXDR(userAddress, fromToken, toToken, amountIn, minAmountOut) {
    const args = [
      this.xdrHelpers.toXdr.address(userAddress),
      this.xdrHelpers.toXdr.address(fromToken),
      this.xdrHelpers.toXdr.address(toToken),
      this.xdrHelpers.toXdr.number(amountIn),
      this.xdrHelpers.toXdr.number(minAmountOut)
    ];

    return this.buildContractInvocationXDR(
      userAddress,
      'AMM_POOL',
      'swap',
      args
    );
  }

  async buildAddLiquidityXDR(userAddress, tokenA, tokenB, amountA, amountB) {
    const args = [
      this.xdrHelpers.toXdr.address(userAddress),
      this.xdrHelpers.toXdr.address(tokenA),
      this.xdrHelpers.toXdr.address(tokenB),
      this.xdrHelpers.toXdr.number(amountA),
      this.xdrHelpers.toXdr.number(amountB)
    ];

    return this.buildContractInvocationXDR(
      userAddress,
      'AMM_POOL',
      'addLiquidity',
      args
    );
  }

  async getAMMPrice(tokenA, tokenB) {
    const args = [
      this.xdrHelpers.toXdr.address(tokenA),
      this.xdrHelpers.toXdr.address(tokenB)
    ];
    return this.queryContract('AMM_POOL', 'getPrice', args);
  }

  async getAMMReserves() {
    return this.queryContract('AMM_POOL', 'getReserves', []);
  }

  // Oracle Resolver Contract Methods
  async buildSubmitResolutionXDR(oracleAddress, marketAddress, outcome, proof) {
    const args = [
      this.xdrHelpers.toXdr.address(oracleAddress),
      this.xdrHelpers.toXdr.address(marketAddress),
      this.xdrHelpers.toXdr.boolean(outcome),
      this.xdrHelpers.toXdr.bytes(proof)
    ];

    return this.buildContractInvocationXDR(
      oracleAddress,
      'ORACLE_RESOLVER',
      'submitResolution',
      args
    );
  }

  async buildFinalizeResolutionXDR(userAddress, marketAddress) {
    const args = [this.xdrHelpers.toXdr.address(marketAddress)];

    return this.buildContractInvocationXDR(
      userAddress,
      'ORACLE_RESOLVER',
      'finalize',
      args
    );
  }

  // Governance Contract Methods
  async buildStakeXDR(userAddress, amount, lockPeriod) {
    const args = [
      this.xdrHelpers.toXdr.address(userAddress),
      this.xdrHelpers.toXdr.number(amount),
      this.xdrHelpers.toXdr.number(lockPeriod)
    ];

    return this.buildContractInvocationXDR(
      userAddress,
      'GOVERNANCE',
      'stake',
      args
    );
  }

  async buildVoteXDR(userAddress, proposalId, choice) {
    const args = [
      this.xdrHelpers.toXdr.address(userAddress),
      this.xdrHelpers.toXdr.number(proposalId),
      this.xdrHelpers.toXdr.string(choice) // 'YES', 'NO', 'ABSTAIN'
    ];

    return this.buildContractInvocationXDR(
      userAddress,
      'GOVERNANCE',
      'vote',
      args
    );
  }

  // Insurance Contract Methods
  async buildPurchaseInsuranceXDR(userAddress, marketId, coverageAmount, coverageType, duration) {
    const args = [
      this.xdrHelpers.toXdr.address(userAddress),
      this.xdrHelpers.toXdr.string(marketId),
      this.xdrHelpers.toXdr.number(coverageAmount),
      this.xdrHelpers.toXdr.string(coverageType),
      this.xdrHelpers.toXdr.number(duration)
    ];

    return this.buildContractInvocationXDR(
      userAddress,
      'INSURANCE',
      'purchaseInsurance',
      args
    );
  }

  // Reputation Contract Methods
  async getUserReputation(userAddress) {
    const args = [this.xdrHelpers.toXdr.address(userAddress)];
    return this.queryContract('REPUTATION', 'getReputation', args);
  }

  // X402 Integration Methods
  async buildSubmitPrivateOrderXDR(userAddress, orderData) {
    const args = [
      this.xdrHelpers.toXdr.address(userAddress),
      this.xdrHelpers.toXdr.string(orderData.marketId),
      this.xdrHelpers.toXdr.bytes(orderData.encryptedData),
      this.xdrHelpers.toXdr.string(orderData.privacyLevel),
      this.xdrHelpers.toXdr.address(orderData.sequencer),
      this.xdrHelpers.toXdr.boolean(orderData.mevProtection),
      this.xdrHelpers.toXdr.number(orderData.priorityFee)
    ];

    return this.buildContractInvocationXDR(
      userAddress,
      'X402_INTEGRATION',
      'submitPrivateOrder',
      args
    );
  }

  /* ============================================================
     EVENT FETCHING METHODS
  ============================================================ */

  /**
   * Fetch contract events for indexing
   */
  async getContractEvents(contractName, eventFilter = {}, fromLedger = null, toLedger = null) {
    try {
      const contractAddress = contractConfig.getContractAddress(contractName);
      
      const request = {
        filters: [
          {
            type: 'contract',
            contractIds: [contractAddress]
          }
        ]
      };

      if (fromLedger) request.startLedger = fromLedger;
      if (toLedger) request.endLedger = toLedger;

      const response = await this.server.getEvents(request);
      
      return response.events || [];
    } catch (error) {
      logger.error(`Failed to fetch events for ${contractName}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all recent contract events for indexing
   */
  async getAllRecentEvents(fromLedger = null) {
    const events = [];
    
    for (const contractName of Object.keys(this.contracts)) {
      if (this.contracts[contractName]) {
        try {
          const contractEvents = await this.getContractEvents(contractName, {}, fromLedger);
          events.push(...contractEvents);
        } catch (error) {
          logger.warn(`Failed to fetch events for ${contractName}:`, error.message);
        }
      }
    }
    
    return events.sort((a, b) => a.ledger - b.ledger);
  }

  /* ============================================================
     UTILITY METHODS
  ============================================================ */

  /**
   * Get current ledger sequence
   */
  async getCurrentLedger() {
    try {
      const healthResponse = await this.server.getHealth();
      return healthResponse.latestLedger;
    } catch (error) {
      logger.error('Failed to get current ledger:', error);
      return null;
    }
  }

  /**
   * Validate transaction XDR
   */
  validateTransactionXDR(xdr) {
    try {
      StellarSdk.TransactionBuilder.fromXDR(xdr, this.networkPassphrase);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get network info
   */
  getNetworkInfo() {
    return {
      network: this.network,
      passphrase: this.networkPassphrase,
      rpcUrl: this.server.serverURL.href,
      contracts: this.contracts
    };
  }

  /**
   * Health check for Soroban service
   */
  async getHealth() {
    try {
      const healthResponse = await this.server.getHealth();
      const latestLedger = await this.getCurrentLedger();
      
      return {
        isConnected: true,
        network: this.network,
        rpcUrl: this.server.serverURL.href,
        latestLedger: latestLedger,
        status: healthResponse.status,
        contracts: {
          total: Object.keys(this.contracts).length,
          deployed: Object.entries(this.contracts).filter(([_, addr]) => addr && addr !== '').length
        }
      };
    } catch (error) {
      logger.error('Soroban health check failed:', error);
      return {
        isConnected: false,
        error: error.message,
        network: this.network
      };
    }
  }

  /**
   * Test contract integration by calling a simple read-only method
   */
  async testContractIntegration() {
    const results = {
      marketFactory: false,
      predictionMarket: false,
      ammPool: false,
      oracleResolver: false,
      errors: []
    };

    // Test Market Factory contract
    try {
      if (this.contracts.MARKET_FACTORY) {
        // Try to get market count or similar read-only method
        const args = [];
        await this.queryContract('MARKET_FACTORY', 'getMarketCount', args);
        results.marketFactory = true;
      }
    } catch (error) {
      results.errors.push(`Market Factory: ${error.message}`);
    }

    // Test AMM Pool contract
    try {
      if (this.contracts.AMM_POOL) {
        // Try to get pool info
        const args = [];
        await this.queryContract('AMM_POOL', 'getPoolInfo', args);
        results.ammPool = true;
      }
    } catch (error) {
      results.errors.push(`AMM Pool: ${error.message}`);
    }

    // Test Oracle Resolver contract
    try {
      if (this.contracts.ORACLE_RESOLVER) {
        // Try to get oracle status
        const args = [];
        await this.queryContract('ORACLE_RESOLVER', 'getStatus', args);
        results.oracleResolver = true;
      }
    } catch (error) {
      results.errors.push(`Oracle Resolver: ${error.message}`);
    }

    return results;
  }

  /**
   * Test contract connectivity with a simple ping
   */
  async pingContract(contractName) {
    try {
      const contractAddress = contractConfig.getContractAddress(contractName);
      
      // Try to get the contract's WASM
      const wasmId = await this.server.getContractWasmByContractId(contractAddress);
      
      return {
        contractName,
        address: contractAddress,
        isReachable: !!wasmId,
        wasmId: wasmId
      };
    } catch (error) {
      return {
        contractName,
        address: this.contracts[contractName] || 'Not deployed',
        isReachable: false,
        error: error.message
      };
    }
  }
}

module.exports = new SorobanService();
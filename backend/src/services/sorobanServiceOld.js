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

  // Contract Deployment
  async deployContract(sourceKeypair, wasmHash, initArgs = []) {
    try {
      const account = await stellarService.server.loadAccount(sourceKeypair.publicKey());
      
      // Create contract
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: '1000000', // Higher fee for contract operations
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.createContract({
          wasmHash: wasmHash,
          address: new StellarSdk.Address(sourceKeypair.publicKey()),
          salt: StellarSdk.randomBytes(32)
        }))
        .setTimeout(30)
        .build();

      transaction.sign(sourceKeypair);
      
      const result = await stellarService.server.submitTransaction(transaction);
      
      // Extract contract address from result
      const contractAddress = this.extractContractAddress(result);
      
      // Initialize contract if init args provided
      if (initArgs.length > 0) {
        await this.initializeContract(sourceKeypair, contractAddress, initArgs);
      }
      
      logger.stellar('Contract deployed', {
        contractAddress,
        wasmHash,
        deployer: sourceKeypair.publicKey(),
        txHash: result.hash
      });

      return {
        contractAddress,
        transactionHash: result.hash
      };
    } catch (error) {
      logger.error('Failed to deploy contract:', error);
      throw new Error(`Failed to deploy contract: ${error.message}`);
    }
  }

  async initializeContract(sourceKeypair, contractAddress, initArgs) {
    try {
      const result = await this.invokeContract(
        sourceKeypair,
        contractAddress,
        'initialize',
        initArgs
      );
      
      logger.stellar('Contract initialized', {
        contractAddress,
        txHash: result.hash
      });

      return result;
    } catch (error) {
      logger.error('Failed to initialize contract:', error);
      throw error;
    }
  }

  extractContractAddress(transactionResult) {
    // This is a simplified extraction - in reality, you'd parse the transaction result
    // to get the actual contract address from the operation results
    try {
      const operations = transactionResult.operations || [];
      for (const op of operations) {
        if (op.type === 'create_contract') {
          return op.contract_id;
        }
      }
      throw new Error('Contract address not found in transaction result');
    } catch (error) {
      logger.error('Failed to extract contract address:', error);
      throw error;
    }
  }

  // Contract Invocation
  async invokeContract(sourceKeypair, contractAddress, method, args = [], fee = '1000000') {
    try {
      const account = await stellarService.server.loadAccount(sourceKeypair.publicKey());
      
      // Convert arguments to Soroban values
      const sorobanArgs = this.convertArgsToSorobanValues(args);
      
      // Create contract invocation operation
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: fee,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.invokeContract({
          contract: contractAddress,
          function: method,
          args: sorobanArgs
        }))
        .setTimeout(30)
        .build();

      transaction.sign(sourceKeypair);
      
      const result = await stellarService.server.submitTransaction(transaction);
      
      logger.stellar('Contract invoked', {
        contractAddress,
        method,
        args: args.length,
        caller: sourceKeypair.publicKey(),
        txHash: result.hash
      });

      return this.parseContractResult(result);
    } catch (error) {
      logger.error(`Failed to invoke contract method ${method}:`, error);
      throw new Error(`Failed to invoke contract: ${error.message}`);
    }
  }

  async queryContract(contractAddress, method, args = []) {
    try {
      const sorobanArgs = this.convertArgsToSorobanValues(args);
      
      const result = await this.server.simulateTransaction(
        new StellarSdk.TransactionBuilder(
          new StellarSdk.Account('GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H', '0'),
          {
            fee: '100',
            networkPassphrase: this.networkPassphrase
          }
        )
          .addOperation(StellarSdk.Operation.invokeContract({
            contract: contractAddress,
            function: method,
            args: sorobanArgs
          }))
          .setTimeout(0)
          .build()
      );

      if (result.error) {
        throw new Error(`Contract query failed: ${result.error}`);
      }

      return this.parseSorobanValue(result.result.retval);
    } catch (error) {
      logger.error(`Failed to query contract method ${method}:`, error);
      throw new Error(`Failed to query contract: ${error.message}`);
    }
  }

  // Market Contract Operations
  async createMarket(creatorKeypair, marketParams) {
    try {
      const {
        question,
        category,
        expirationTime,
        resolutionSource,
        initialLiquidity,
        yesTokenAddress,
        noTokenAddress
      } = marketParams;

      const args = [
        StellarSdk.nativeToScVal(question, { type: 'string' }),
        StellarSdk.nativeToScVal(category, { type: 'string' }),
        StellarSdk.nativeToScVal(expirationTime, { type: 'u64' }),
        StellarSdk.nativeToScVal(resolutionSource, { type: 'string' }),
        StellarSdk.nativeToScVal(initialLiquidity, { type: 'u64' }),
        StellarSdk.nativeToScVal(yesTokenAddress, { type: 'address' }),
        StellarSdk.nativeToScVal(noTokenAddress, { type: 'address' })
      ];

      const result = await this.invokeContract(
        creatorKeypair,
        this.contractAddresses.marketFactory,
        'create_market',
        args
      );

      return {
        marketId: result.marketId,
        contractAddress: result.contractAddress,
        transactionHash: result.hash
      };
    } catch (error) {
      logger.error('Failed to create market contract:', error);
      throw error;
    }
  }

  async getMarketInfo(marketContractAddress) {
    try {
      const result = await this.queryContract(marketContractAddress, 'get_market_info');
      
      return {
        marketId: result.market_id,
        creator: result.creator,
        question: result.question,
        category: result.category,
        expirationTime: new Date(result.expiration_time * 1000),
        status: result.status,
        totalVolume: result.total_volume,
        yesTokenSupply: result.yes_token_supply,
        noTokenSupply: result.no_token_supply,
        currentYesPrice: result.current_yes_price,
        currentNoPrice: result.current_no_price
      };
    } catch (error) {
      logger.error('Failed to get market info:', error);
      throw error;
    }
  }

  // AMM Operations
  async executeTrade(traderKeypair, marketContractAddress, tradeParams) {
    try {
      const {
        tokenType, // 'yes' or 'no'
        tradeType, // 'buy' or 'sell'
        amount,
        maxSlippage,
        deadline
      } = tradeParams;

      const args = [
        StellarSdk.nativeToScVal(tokenType === 'yes' ? 1 : 0, { type: 'u32' }),
        StellarSdk.nativeToScVal(tradeType === 'buy' ? 1 : 0, { type: 'u32' }),
        StellarSdk.nativeToScVal(amount, { type: 'u64' }),
        StellarSdk.nativeToScVal(maxSlippage, { type: 'u64' }),
        StellarSdk.nativeToScVal(deadline, { type: 'u64' })
      ];

      const result = await this.invokeContract(
        traderKeypair,
        marketContractAddress,
        'execute_trade',
        args
      );

      return {
        tradeId: result.trade_id,
        executedAmount: result.executed_amount,
        executedPrice: result.executed_price,
        fees: result.fees,
        slippage: result.slippage,
        transactionHash: result.hash
      };
    } catch (error) {
      logger.error('Failed to execute trade:', error);
      throw error;
    }
  }

  async calculateTradePrice(marketContractAddress, tokenType, tradeType, amount) {
    try {
      const args = [
        StellarSdk.nativeToScVal(tokenType === 'yes' ? 1 : 0, { type: 'u32' }),
        StellarSdk.nativeToScVal(tradeType === 'buy' ? 1 : 0, { type: 'u32' }),
        StellarSdk.nativeToScVal(amount, { type: 'u64' })
      ];

      const result = await this.queryContract(
        marketContractAddress,
        'calculate_trade_price',
        args
      );

      return {
        price: result.price,
        priceImpact: result.price_impact,
        fees: result.fees,
        amountOut: result.amount_out
      };
    } catch (error) {
      logger.error('Failed to calculate trade price:', error);
      throw error;
    }
  }

  async addLiquidity(providerKeypair, marketContractAddress, liquidityParams) {
    try {
      const { usdcAmount, expectedYesTokens, expectedNoTokens, deadline } = liquidityParams;

      const args = [
        StellarSdk.nativeToScVal(usdcAmount, { type: 'u64' }),
        StellarSdk.nativeToScVal(expectedYesTokens, { type: 'u64' }),
        StellarSdk.nativeToScVal(expectedNoTokens, { type: 'u64' }),
        StellarSdk.nativeToScVal(deadline, { type: 'u64' })
      ];

      const result = await this.invokeContract(
        providerKeypair,
        marketContractAddress,
        'add_liquidity',
        args
      );

      return {
        liquidityTokens: result.liquidity_tokens,
        yesTokensAdded: result.yes_tokens_added,
        noTokensAdded: result.no_tokens_added,
        transactionHash: result.hash
      };
    } catch (error) {
      logger.error('Failed to add liquidity:', error);
      throw error;
    }
  }

  // Market Resolution
  async resolveMarket(oracleKeypair, marketContractAddress, outcome) {
    try {
      // outcome: 0 = invalid, 1 = yes, 2 = no
      const outcomeValue = outcome === 'invalid' ? 0 : outcome === 'yes' ? 1 : 2;

      const args = [
        StellarSdk.nativeToScVal(outcomeValue, { type: 'u32' })
      ];

      const result = await this.invokeContract(
        oracleKeypair,
        marketContractAddress,
        'resolve_market',
        args
      );

      return {
        outcome,
        winningTokenHolders: result.winning_token_holders,
        totalPayout: result.total_payout,
        transactionHash: result.hash
      };
    } catch (error) {
      logger.error('Failed to resolve market:', error);
      throw error;
    }
  }

  async claimWinnings(userKeypair, marketContractAddress) {
    try {
      const result = await this.invokeContract(
        userKeypair,
        marketContractAddress,
        'claim_winnings',
        []
      );

      return {
        claimedAmount: result.claimed_amount,
        transactionHash: result.hash
      };
    } catch (error) {
      logger.error('Failed to claim winnings:', error);
      throw error;
    }
  }

  // Utility Methods
  convertArgsToSorobanValues(args) {
    return args.map(arg => {
      if (typeof arg === 'string') {
        return StellarSdk.nativeToScVal(arg, { type: 'string' });
      } else if (typeof arg === 'number') {
        return StellarSdk.nativeToScVal(arg, { type: 'u64' });
      } else if (typeof arg === 'boolean') {
        return StellarSdk.nativeToScVal(arg, { type: 'bool' });
      } else if (Buffer.isBuffer(arg)) {
        return StellarSdk.nativeToScVal(arg, { type: 'bytes' });
      } else {
        return arg; // Assume it's already a Soroban value
      }
    });
  }

  parseContractResult(transactionResult) {
    try {
      // Parse the contract result from the transaction
      // This is simplified - actual implementation would parse the XDR result
      return {
        success: transactionResult.successful,
        hash: transactionResult.hash,
        result: transactionResult.result || {}
      };
    } catch (error) {
      logger.error('Failed to parse contract result:', error);
      return { success: false, error: error.message };
    }
  }

  parseSorobanValue(scVal) {
    try {
      return StellarSdk.scValToNative(scVal);
    } catch (error) {
      logger.error('Failed to parse Soroban value:', error);
      return null;
    }
  }

  // Gas Estimation
  async estimateGas(operation) {
    try {
      const simulation = await this.server.simulateTransaction(operation);
      
      if (simulation.error) {
        throw new Error(`Gas estimation failed: ${simulation.error}`);
      }

      return {
        cpuInstructions: simulation.cost.cpuInsns,
        memoryBytes: simulation.cost.memBytes,
        fee: simulation.minResourceFee
      };
    } catch (error) {
      logger.error('Failed to estimate gas:', error);
      return {
        cpuInstructions: 1000000, // Default fallback
        memoryBytes: 1000000,
        fee: '1000000'
      };
    }
  }

  // Contract State Queries
  async getContractData(contractAddress, key) {
    try {
      const result = await this.server.getContractData(contractAddress, key);
      return this.parseSorobanValue(result.val);
    } catch (error) {
      logger.error('Failed to get contract data:', error);
      return null;
    }
  }

  async getContractEvents(contractAddress, startLedger = null, endLedger = null) {
    try {
      const result = await this.server.getEvents({
        filters: [{
          type: 'contract',
          contractIds: [contractAddress]
        }],
        startLedger,
        endLedger,
        limit: 100
      });

      return result.events.map(event => ({
        id: event.id,
        type: event.type,
        ledger: event.ledger,
        contractId: event.contractId,
        topic: event.topic.map(t => this.parseSorobanValue(t)),
        value: this.parseSorobanValue(event.value),
        timestamp: new Date(event.ledgerClosedAt)
      }));
    } catch (error) {
      logger.error('Failed to get contract events:', error);
      return [];
    }
  }

  // Health Check
  async getHealth() {
    try {
      const health = await this.server.getHealth();
      return {
        status: health.status,
        latestLedger: health.latestLedger,
        oldestLedger: health.oldestLedger,
        ledgerRetentionWindow: health.ledgerRetentionWindow
      };
    } catch (error) {
      logger.error('Failed to get Soroban health:', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

module.exports = new SorobanService();
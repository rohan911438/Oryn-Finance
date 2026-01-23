const StellarSdk = require('stellar-sdk');
const logger = require('../config/logger');

class StellarService {
  constructor() {
    this.network = process.env.STELLAR_NETWORK || 'testnet';
    this.horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    this.server = new StellarSdk.Horizon.Server(this.horizonUrl);
    this.networkPassphrase = this.network === 'testnet' 
      ? StellarSdk.Networks.TESTNET 
      : StellarSdk.Networks.PUBLIC;
    
    this.adminKeypair = null;
    this.initializeAdmin();
    
    logger.info(`Stellar service initialized for ${this.network} network`);
  }

  initializeAdmin() {
    try {
      const adminSecret = process.env.ADMIN_SECRET_KEY;
      if (adminSecret) {
        this.adminKeypair = StellarSdk.Keypair.fromSecret(adminSecret);
        logger.info(`Admin account initialized: ${this.adminKeypair.publicKey()}`);
      } else {
        logger.warn('Admin secret key not provided, some operations may not be available');
      }
    } catch (error) {
      logger.error('Failed to initialize admin keypair:', error);
    }
  }

  // Account Management
  async createAccount() {
    try {
      const keypair = StellarSdk.Keypair.random();
      
      if (this.network === 'testnet') {
        // Fund account on testnet using Friendbot
        await this.server.friendbot(keypair.publicKey()).call();
        logger.stellar('Account created and funded on testnet', {
          publicKey: keypair.publicKey()
        });
      }
      
      return {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret()
      };
    } catch (error) {
      logger.error('Failed to create Stellar account:', error);
      throw new Error(`Failed to create account: ${error.message}`);
    }
  }

  async getAccountInfo(accountId) {
    try {
      const account = await this.server.loadAccount(accountId);
      
      return {
        id: account.id,
        sequence: account.sequence,
        balances: account.balances.map(balance => ({
          asset: balance.asset_type === 'native' ? 'XLM' : `${balance.asset_code}:${balance.asset_issuer}`,
          balance: parseFloat(balance.balance),
          limit: balance.limit ? parseFloat(balance.limit) : null
        })),
        signers: account.signers,
        flags: account.flags,
        thresholds: account.thresholds
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new Error('Account not found');
      }
      throw new Error(`Failed to load account: ${error.message}`);
    }
  }

  async getAccountBalance(accountId, assetCode = null, assetIssuer = null) {
    try {
      const accountInfo = await this.getAccountInfo(accountId);
      
      if (!assetCode) {
        return accountInfo.balances.find(b => b.asset === 'XLM')?.balance || 0;
      }
      
      const assetString = `${assetCode}:${assetIssuer}`;
      return accountInfo.balances.find(b => b.asset === assetString)?.balance || 0;
    } catch (error) {
      logger.error('Failed to get account balance:', error);
      return 0;
    }
  }

  // Asset Management
  async createMarketAssets(marketId, issuerKeypair = null) {
    try {
      const issuer = issuerKeypair || this.adminKeypair;
      if (!issuer) {
        throw new Error('No issuer keypair available');
      }

      const yesAssetCode = this.generateAssetCode(marketId, 'YES');
      const noAssetCode = this.generateAssetCode(marketId, 'NO');

      const yesAsset = new StellarSdk.Asset(yesAssetCode, issuer.publicKey());
      const noAsset = new StellarSdk.Asset(noAssetCode, issuer.publicKey());

      logger.stellar('Market assets created', {
        marketId,
        yesAsset: `${yesAssetCode}:${issuer.publicKey()}`,
        noAsset: `${noAssetCode}:${issuer.publicKey()}`
      });

      return {
        yesAsset: {
          code: yesAssetCode,
          issuer: issuer.publicKey(),
          asset: yesAsset
        },
        noAsset: {
          code: noAssetCode,
          issuer: issuer.publicKey(),
          asset: noAsset
        },
        issuerKeypair: issuer
      };
    } catch (error) {
      logger.error('Failed to create market assets:', error);
      throw new Error(`Failed to create market assets: ${error.message}`);
    }
  }

  generateAssetCode(marketId, tokenType) {
    // Generate deterministic asset code from market ID
    const hash = require('crypto')
      .createHash('sha256')
      .update(`${marketId}-${tokenType}`)
      .digest('hex');
    
    // Take first 8 characters and ensure it starts with tokenType
    const suffix = hash.substring(0, 6).toUpperCase();
    return `${tokenType}${suffix}`;
  }

  // Trustline Management
  async createTrustline(userKeypair, asset) {
    try {
      const account = await this.server.loadAccount(userKeypair.publicKey());
      
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.changeTrust({
          asset: asset
        }))
        .setTimeout(30)
        .build();

      transaction.sign(userKeypair);
      
      const result = await this.server.submitTransaction(transaction);
      
      logger.stellar('Trustline created', {
        account: userKeypair.publicKey(),
        asset: `${asset.code}:${asset.issuer}`,
        txHash: result.hash
      });

      return result;
    } catch (error) {
      logger.error('Failed to create trustline:', error);
      throw new Error(`Failed to create trustline: ${error.message}`);
    }
  }

  // Token Operations
  async mintTokens(issuerKeypair, distributorKeypair, asset, amount) {
    try {
      // First, create trustline from distributor to issuer
      await this.createTrustline(distributorKeypair, asset);

      const issuerAccount = await this.server.loadAccount(issuerKeypair.publicKey());
      
      const transaction = new StellarSdk.TransactionBuilder(issuerAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.payment({
          destination: distributorKeypair.publicKey(),
          asset: asset,
          amount: amount.toString()
        }))
        .setTimeout(30)
        .build();

      transaction.sign(issuerKeypair);
      
      const result = await this.server.submitTransaction(transaction);
      
      logger.stellar('Tokens minted', {
        asset: `${asset.code}:${asset.issuer}`,
        amount,
        distributor: distributorKeypair.publicKey(),
        txHash: result.hash
      });

      return result;
    } catch (error) {
      logger.error('Failed to mint tokens:', error);
      throw new Error(`Failed to mint tokens: ${error.message}`);
    }
  }

  async transferTokens(fromKeypair, toPublicKey, asset, amount) {
    try {
      const fromAccount = await this.server.loadAccount(fromKeypair.publicKey());
      
      const transaction = new StellarSdk.TransactionBuilder(fromAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.payment({
          destination: toPublicKey,
          asset: asset,
          amount: amount.toString()
        }))
        .setTimeout(30)
        .build();

      transaction.sign(fromKeypair);
      
      const result = await this.server.submitTransaction(transaction);
      
      logger.stellar('Tokens transferred', {
        from: fromKeypair.publicKey(),
        to: toPublicKey,
        asset: `${asset.code}:${asset.issuer}`,
        amount,
        txHash: result.hash
      });

      return result;
    } catch (error) {
      logger.error('Failed to transfer tokens:', error);
      throw new Error(`Failed to transfer tokens: ${error.message}`);
    }
  }

  // DEX Operations
  async createLiquidityPool(keypair, assetA, assetB, reserveA, reserveB, fee = 30) {
    try {
      const account = await this.server.loadAccount(keypair.publicKey());
      
      // Sort assets for consistent pool ID generation
      const [sortedAssetA, sortedAssetB, sortedReserveA, sortedReserveB] = 
        this.sortAssetsForPool(assetA, assetB, reserveA, reserveB);

      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.liquidityPoolDeposit({
          liquidityPoolId: StellarSdk.getLiquidityPoolId(sortedAssetA, sortedAssetB, fee).toString('hex'),
          maxAmountA: sortedReserveA.toString(),
          maxAmountB: sortedReserveB.toString(),
          minPrice: { n: 1, d: 10000 },
          maxPrice: { n: 10000, d: 1 }
        }))
        .setTimeout(30)
        .build();

      transaction.sign(keypair);
      
      const result = await this.server.submitTransaction(transaction);
      
      const poolId = StellarSdk.getLiquidityPoolId(sortedAssetA, sortedAssetB, fee).toString('hex');
      
      logger.stellar('Liquidity pool created', {
        poolId,
        assetA: `${sortedAssetA.code}:${sortedAssetA.issuer}`,
        assetB: `${sortedAssetB.code}:${sortedAssetB.issuer}`,
        reserveA: sortedReserveA,
        reserveB: sortedReserveB,
        txHash: result.hash
      });

      return { poolId, result };
    } catch (error) {
      logger.error('Failed to create liquidity pool:', error);
      throw new Error(`Failed to create liquidity pool: ${error.message}`);
    }
  }

  sortAssetsForPool(assetA, assetB, reserveA, reserveB) {
    const assetAString = assetA.isNative() ? 'native' : `${assetA.code}:${assetA.issuer}`;
    const assetBString = assetB.isNative() ? 'native' : `${assetB.code}:${assetB.issuer}`;
    
    if (assetAString < assetBString) {
      return [assetA, assetB, reserveA, reserveB];
    } else {
      return [assetB, assetA, reserveB, reserveA];
    }
  }

  async placeOrder(keypair, selling, buying, amount, price) {
    try {
      const account = await this.server.loadAccount(keypair.publicKey());
      
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.manageSellOffer({
          selling: selling,
          buying: buying,
          amount: amount.toString(),
          price: price.toString()
        }))
        .setTimeout(30)
        .build();

      transaction.sign(keypair);
      
      const result = await this.server.submitTransaction(transaction);
      
      logger.stellar('Order placed', {
        account: keypair.publicKey(),
        selling: selling.isNative() ? 'XLM' : `${selling.code}:${selling.issuer}`,
        buying: buying.isNative() ? 'XLM' : `${buying.code}:${buying.issuer}`,
        amount,
        price,
        txHash: result.hash
      });

      return result;
    } catch (error) {
      logger.error('Failed to place order:', error);
      throw new Error(`Failed to place order: ${error.message}`);
    }
  }

  async getOrderbook(sellingAsset, buyingAsset, limit = 20) {
    try {
      const orderbook = await this.server.orderbook(sellingAsset, buyingAsset)
        .limit(limit)
        .call();

      return {
        bids: orderbook.bids.map(bid => ({
          price: parseFloat(bid.price),
          amount: parseFloat(bid.amount)
        })),
        asks: orderbook.asks.map(ask => ({
          price: parseFloat(ask.price),
          amount: parseFloat(ask.amount)
        }))
      };
    } catch (error) {
      logger.error('Failed to get orderbook:', error);
      throw new Error(`Failed to get orderbook: ${error.message}`);
    }
  }

  // Market Data
  async getAssetPrice(asset, baseAsset = StellarSdk.Asset.native()) {
    try {
      const orderbook = await this.getOrderbook(asset, baseAsset, 1);
      
      if (orderbook.asks.length > 0) {
        return orderbook.asks[0].price;
      }
      
      if (orderbook.bids.length > 0) {
        return orderbook.bids[0].price;
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get asset price:', error);
      return null;
    }
  }

  async getTrades(asset, baseAsset = StellarSdk.Asset.native(), limit = 50) {
    try {
      const trades = await this.server.trades()
        .forAssetPair(asset, baseAsset)
        .order('desc')
        .limit(limit)
        .call();

      return trades.records.map(trade => ({
        id: trade.id,
        price: parseFloat(trade.price.n) / parseFloat(trade.price.d),
        amount: parseFloat(trade.amount),
        timestamp: new Date(trade.ledger_close_time),
        type: trade.trade_type,
        account: trade.account
      }));
    } catch (error) {
      logger.error('Failed to get trades:', error);
      return [];
    }
  }

  // Transaction History
  async getTransactionHistory(accountId, limit = 50, cursor = null) {
    try {
      let query = this.server.transactions()
        .forAccount(accountId)
        .order('desc')
        .limit(limit);

      if (cursor) {
        query = query.cursor(cursor);
      }

      const transactions = await query.call();
      
      return {
        records: transactions.records.map(tx => ({
          id: tx.id,
          hash: tx.hash,
          type: tx.type,
          timestamp: new Date(tx.created_at),
          fee: parseFloat(tx.fee_paid),
          successful: tx.successful,
          memo: tx.memo,
          operationCount: tx.operation_count
        })),
        nextCursor: transactions.records.length > 0 
          ? transactions.records[transactions.records.length - 1].paging_token 
          : null
      };
    } catch (error) {
      logger.error('Failed to get transaction history:', error);
      return { records: [], nextCursor: null };
    }
  }

  async getPayments(accountId, limit = 50, cursor = null) {
    try {
      let query = this.server.payments()
        .forAccount(accountId)
        .order('desc')
        .limit(limit);

      if (cursor) {
        query = query.cursor(cursor);
      }

      const payments = await query.call();
      
      return payments.records.map(payment => ({
        id: payment.id,
        type: payment.type,
        from: payment.from,
        to: payment.to,
        asset: payment.asset_type === 'native' ? 'XLM' : `${payment.asset_code}:${payment.asset_issuer}`,
        amount: parseFloat(payment.amount),
        timestamp: new Date(payment.created_at),
        transactionHash: payment.transaction_hash
      }));
    } catch (error) {
      logger.error('Failed to get payments:', error);
      return [];
    }
  }

  // Claimable Balances
  async createClaimableBalance(sourceKeypair, asset, amount, claimants) {
    try {
      const account = await this.server.loadAccount(sourceKeypair.publicKey());
      
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.createClaimableBalance({
          asset: asset,
          amount: amount.toString(),
          claimants: claimants
        }))
        .setTimeout(30)
        .build();

      transaction.sign(sourceKeypair);
      
      const result = await this.server.submitTransaction(transaction);
      
      logger.stellar('Claimable balance created', {
        asset: asset.isNative() ? 'XLM' : `${asset.code}:${asset.issuer}`,
        amount,
        claimants: claimants.length,
        txHash: result.hash
      });

      return result;
    } catch (error) {
      logger.error('Failed to create claimable balance:', error);
      throw new Error(`Failed to create claimable balance: ${error.message}`);
    }
  }

  async claimBalance(claimerKeypair, balanceId) {
    try {
      const account = await this.server.loadAccount(claimerKeypair.publicKey());
      
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(StellarSdk.Operation.claimClaimableBalance({
          balanceId: balanceId
        }))
        .setTimeout(30)
        .build();

      transaction.sign(claimerKeypair);
      
      const result = await this.server.submitTransaction(transaction);
      
      logger.stellar('Claimable balance claimed', {
        claimer: claimerKeypair.publicKey(),
        balanceId,
        txHash: result.hash
      });

      return result;
    } catch (error) {
      logger.error('Failed to claim balance:', error);
      throw new Error(`Failed to claim balance: ${error.message}`);
    }
  }

  // Utility Methods
  async validateAddress(address) {
    try {
      StellarSdk.Keypair.fromPublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  formatAmount(amount, decimals = 7) {
    return parseFloat(amount).toFixed(decimals);
  }

  calculateTransactionFee(operationCount) {
    return (StellarSdk.BASE_FEE * operationCount) / 10000000; // Convert stroops to XLM
  }

  // Network Monitoring
  async getNetworkStatus() {
    try {
      const ledger = await this.server.ledgers().order('desc').limit(1).call();
      const latestLedger = ledger.records[0];
      
      return {
        network: this.network,
        latestLedger: {
          sequence: latestLedger.sequence,
          hash: latestLedger.hash,
          closedAt: new Date(latestLedger.closed_at),
          transactionCount: latestLedger.transaction_count,
          operationCount: latestLedger.operation_count
        },
        isConnected: true
      };
    } catch (error) {
      logger.error('Failed to get network status:', error);
      return {
        network: this.network,
        isConnected: false,
        error: error.message
      };
    }
  }
}

module.exports = new StellarService();
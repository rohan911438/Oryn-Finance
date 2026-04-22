const sorobanService = require('../services/sorobanService');
const logger = require('../config/logger');
const { ValidationError, BadRequestError } = require('../middleware/errorHandler');

class TransactionController {
  /**
   * Get governance proposals
   */
  static async getGovernanceProposals(req, res) {
    try {
      const proposals = [
        {
          proposalId: 1,
          title: 'Increase protocol fee for treasury stability',
          description: 'Raise the platform fee from 0.1% to 0.2% to build treasury reserves.',
          status: 'Active',
          forVotes: 1420,
          againstVotes: 430,
          abstainVotes: 90,
        },
        {
          proposalId: 2,
          title: 'Enable new prediction market category',
          description: 'Allow sports betting markets in addition to finance and politics.',
          status: 'Pending',
          forVotes: 820,
          againstVotes: 230,
          abstainVotes: 50,
        },
        {
          proposalId: 3,
          title: 'Allocate treasury funds to marketing',
          description: 'Release 5% of treasury assets for user growth and ecosystem marketing.',
          status: 'Active',
          forVotes: 980,
          againstVotes: 610,
          abstainVotes: 120,
        }
      ];

      res.json({
        success: true,
        data: proposals
      });
    } catch (error) {
      logger.error('Failed to get governance proposals:', error);
      throw new BadRequestError(`Failed to get governance proposals: ${error.message}`);
    }
  }

  /**
   * Build XDR for market creation
   */
  static async buildCreateMarketXDR(req, res) {
    try {
      const { walletAddress } = req.user;
      const {
        question,
        category,
        expiryTimestamp,
        initialLiquidity,
        marketContract,
        poolAddress,
        yesToken,
        noToken
      } = req.body;

      // Validate required fields
      if (!question || !category || !expiryTimestamp || !initialLiquidity) {
        throw new ValidationError('Missing required fields for market creation');
      }

      // Transform and validate data
      const normalizedCategory = category.toLowerCase();
      const validCategories = ['sports', 'politics', 'crypto', 'entertainment', 'economics', 'technology', 'other'];
      if (!validCategories.includes(normalizedCategory)) {
        throw new ValidationError(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
      }

      // Ensure platform fee is within valid range (0% to 10%)
      const normalizedPlatformFee = Math.min(0.1, Math.max(0, (req.body.feePercentage || 0.005)));
      if (normalizedPlatformFee > 0.1) {
        throw new ValidationError('Platform fee cannot exceed 10%');
      }

      // For now, create the market directly in the database
      const { Market } = require('../models');
      
      const expiresAt = new Date(expiryTimestamp * 1000);
      const marketId = question.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50) + '-' + Date.now();

      const newMarket = new Market({
        marketId,
        question: question.trim(),
        category: normalizedCategory,
        creatorWalletAddress: walletAddress.toUpperCase(),
        expiresAt,
        resolutionCriteria: req.body.resolutionSource || 'Manual resolution by market creator',
        oracleSource: 'manual',
        status: 'active',
        totalVolume: 0,
        totalTrades: 0,
        yesTokenAssetCode: `YES${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        noTokenAssetCode: `NO${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        yesTokenIssuer: walletAddress.toUpperCase(),
        noTokenIssuer: walletAddress.toUpperCase(),
        initialLiquidity,
        currentYesPrice: 0.5,
        currentNoPrice: 0.5,
        resolvedOutcome: null,
        tags: [normalizedCategory],
        metadata: {
          description: question.trim(),
          sourceUrls: []
        },
        statistics: {
          uniqueTraders: 0,
          yesTotalStake: 0,
          noTotalStake: 0,
          avgTradeSize: 0,
          priceHistory: []
        },
        platformFee: normalizedPlatformFee,
        isPublic: true,
        isFeatured: false
      });

      const savedMarket = await newMarket.save();

      logger.info('Created market in database', {
        user: walletAddress,
        question: question.substring(0, 50),
        category: normalizedCategory,
        marketId: savedMarket.marketId
      });

      // Return mock XDR for frontend compatibility
      res.json({
        success: true,
        data: {
          xdr: 'AAAAAgAAAAA=',
          marketId: savedMarket.marketId,
          message: 'Market created successfully',
          fees: 0
        }
      });
    } catch (error) {
      logger.error('Failed to create market:', error);
      throw new BadRequestError(`Failed to create market: ${error.message}`);
    }
  }

  /**
   * Build XDR for token purchase
   */
  static async buildBuyTokensXDR(req, res) {
    try {
      const { walletAddress } = req.user;
      const {
        marketContract,
        tokenType,
        amount,
        price
      } = req.body;

      if (!marketContract || !tokenType || !amount || !price) {
        throw new ValidationError('Missing required fields for token purchase');
      }

      if (!['yes', 'no'].includes(tokenType.toLowerCase())) {
        throw new ValidationError('Token type must be "yes" or "no"');
      }

      const result = await sorobanService.buildBuyTokensXDR(
        walletAddress,
        marketContract,
        tokenType,
        amount,
        price
      );

      logger.info('Built buy tokens XDR', {
        user: walletAddress,
        marketContract,
        tokenType,
        amount
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: result.simulation
        }
      });
    } catch (error) {
      logger.error('Failed to build buy tokens XDR:', error);
      throw new BadRequestError(`Failed to build token purchase transaction: ${error.message}`);
    }
  }

  /**
   * Build XDR for token sale
   */
  static async buildSellTokensXDR(req, res) {
    try {
      const { walletAddress } = req.user;
      const {
        marketContract,
        tokenType,
        amount,
        price
      } = req.body;

      if (!marketContract || !tokenType || !amount || !price) {
        throw new ValidationError('Missing required fields for token sale');
      }

      const result = await sorobanService.buildSellTokensXDR(
        walletAddress,
        marketContract,
        tokenType,
        amount,
        price
      );

      logger.info('Built sell tokens XDR', {
        user: walletAddress,
        marketContract,
        tokenType,
        amount
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: result.simulation
        }
      });
    } catch (error) {
      logger.error('Failed to build sell tokens XDR:', error);
      throw new BadRequestError(`Failed to build token sale transaction: ${error.message}`);
    }
  }

  /**
   * Build XDR for claiming winnings
   */
  static async buildClaimWinningsXDR(req, res) {
    try {
      const { userAddress } = req.user;
      const { marketContract } = req.body;

      if (!marketContract) {
        throw new ValidationError('Market contract address is required');
      }

      const result = await sorobanService.buildClaimWinningsXDR(userAddress, marketContract);

      logger.info('Built claim winnings XDR', {
        user: userAddress,
        marketContract
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: result.simulation
        }
      });
    } catch (error) {
      logger.error('Failed to build claim winnings XDR:', error);
      throw new BadRequestError(`Failed to build claim winnings transaction: ${error.message}`);
    }
  }

  /**
   * Build XDR for AMM swap
   */
  static async buildSwapXDR(req, res) {
    try {
      const { userAddress } = req.user;
      const {
        fromToken,
        toToken,
        amountIn,
        minAmountOut
      } = req.body;

      if (!fromToken || !toToken || !amountIn || !minAmountOut) {
        throw new ValidationError('Missing required fields for swap');
      }

      const result = await sorobanService.buildSwapXDR(
        userAddress,
        fromToken,
        toToken,
        amountIn,
        minAmountOut
      );

      logger.info('Built swap XDR', {
        user: userAddress,
        fromToken,
        toToken,
        amountIn
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: result.simulation
        }
      });
    } catch (error) {
      logger.error('Failed to build swap XDR:', error);
      throw new BadRequestError(`Failed to build swap transaction: ${error.message}`);
    }
  }

  /**
   * Build XDR for adding liquidity
   */
  static async buildAddLiquidityXDR(req, res) {
    try {
      const { userAddress } = req.user;
      const {
        tokenA,
        tokenB,
        amountA,
        amountB
      } = req.body;

      if (!tokenA || !tokenB || !amountA || !amountB) {
        throw new ValidationError('Missing required fields for adding liquidity');
      }

      const result = await sorobanService.buildAddLiquidityXDR(
        userAddress,
        tokenA,
        tokenB,
        amountA,
        amountB
      );

      logger.info('Built add liquidity XDR', {
        user: userAddress,
        tokenA,
        tokenB,
        amountA,
        amountB
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: result.simulation
        }
      });
    } catch (error) {
      logger.error('Failed to build add liquidity XDR:', error);
      throw new BadRequestError(`Failed to build add liquidity transaction: ${error.message}`);
    }
  }

  /**
   * Build XDR for staking tokens
   */
  static async buildStakeXDR(req, res) {
    try {
      const { userAddress } = req.user;
      const {
        amount,
        lockPeriod
      } = req.body;

      if (!amount || !lockPeriod) {
        throw new ValidationError('Missing required fields for staking');
      }

      const result = await sorobanService.buildStakeXDR(userAddress, amount, lockPeriod);

      logger.info('Built stake XDR', {
        user: userAddress,
        amount,
        lockPeriod
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: result.simulation
        }
      });
    } catch (error) {
      logger.error('Failed to build stake XDR:', error);
      throw new BadRequestError(`Failed to build stake transaction: ${error.message}`);
    }
  }

  /**
   * Build XDR for voting on proposal
   */
  static async buildVoteXDR(req, res) {
    try {
      const { userAddress } = req.user;
      const {
        proposalId,
        choice
      } = req.body;

      if (!proposalId || !choice) {
        throw new ValidationError('Missing required fields for voting');
      }

      if (!['YES', 'NO', 'ABSTAIN'].includes(choice.toUpperCase())) {
        throw new ValidationError('Vote choice must be YES, NO, or ABSTAIN');
      }

      const result = await sorobanService.buildVoteXDR(userAddress, proposalId, choice);

      logger.info('Built vote XDR', {
        user: userAddress,
        proposalId,
        choice
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: result.simulation
        }
      });
    } catch (error) {
      logger.error('Failed to build vote XDR:', error);
      throw new BadRequestError(`Failed to build vote transaction: ${error.message}`);
    }
  }

  /**
   * Build XDR for purchasing insurance
   */
  static async buildPurchaseInsuranceXDR(req, res) {
    try {
      const { userAddress } = req.user;
      const {
        marketId,
        coverageAmount,
        coverageType,
        duration
      } = req.body;

      if (!marketId || !coverageAmount || !coverageType || !duration) {
        throw new ValidationError('Missing required fields for insurance purchase');
      }

      const result = await sorobanService.buildPurchaseInsuranceXDR(
        userAddress,
        marketId,
        coverageAmount,
        coverageType,
        duration
      );

      logger.info('Built purchase insurance XDR', {
        user: userAddress,
        marketId,
        coverageAmount,
        coverageType
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: result.simulation
        }
      });
    } catch (error) {
      logger.error('Failed to build purchase insurance XDR:', error);
      throw new BadRequestError(`Failed to build insurance purchase transaction: ${error.message}`);
    }
  }

  /**
   * Build XDR for submitting private order
   */
  static async buildSubmitPrivateOrderXDR(req, res) {
    try {
      const { userAddress } = req.user;
      const {
        marketId,
        encryptedData,
        privacyLevel,
        sequencer,
        mevProtection,
        priorityFee
      } = req.body;

      if (!marketId || !encryptedData || !privacyLevel || !sequencer) {
        throw new ValidationError('Missing required fields for private order');
      }

      const orderData = {
        marketId,
        encryptedData,
        privacyLevel,
        sequencer,
        mevProtection: mevProtection || false,
        priorityFee: priorityFee || 0
      };

      const result = await sorobanService.buildSubmitPrivateOrderXDR(userAddress, orderData);

      logger.info('Built submit private order XDR', {
        user: userAddress,
        marketId,
        privacyLevel
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: result.simulation
        }
      });
    } catch (error) {
      logger.error('Failed to build submit private order XDR:', error);
      throw new BadRequestError(`Failed to build private order transaction: ${error.message}`);
    }
  }

  /**
   * Submit signed XDR transaction
   */
  static async submitSignedTransaction(req, res) {
    try {
      const { signedXDR } = req.body;

      if (!signedXDR) {
        throw new ValidationError('Signed XDR is required');
      }

      // Validate XDR format
      if (!sorobanService.validateTransactionXDR(signedXDR)) {
        throw new ValidationError('Invalid XDR format');
      }

      const result = await sorobanService.submitSignedTransaction(signedXDR);

      logger.info('Successfully submitted signed transaction', {
        txHash: result.hash,
        status: result.status
      });

      res.json({
        success: true,
        data: {
          transactionHash: result.hash,
          status: result.status,
          stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`,
          result: result
        }
      });
    } catch (error) {
      logger.error('Failed to submit signed transaction:', error);
      throw new BadRequestError(`Failed to submit transaction: ${error.message}`);
    }
  }

  /**
   * Get transaction status
   */
  static async getTransactionStatus(req, res) {
    try {
      const { txHash } = req.params;

      if (!txHash) {
        throw new ValidationError('Transaction hash is required');
      }

      const result = await sorobanService.pollTransactionStatus(txHash, 1); // Single attempt

      res.json({
        success: true,
        data: {
          transactionHash: txHash,
          status: result.status,
          stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
          result: result
        }
      });
    } catch (error) {
      logger.error('Failed to get transaction status:', error);
      throw new BadRequestError(`Failed to get transaction status: ${error.message}`);
    }
  }

  /**
   * Get network information
   */
  static async getNetworkInfo(req, res) {
    try {
      const networkInfo = sorobanService.getNetworkInfo();

      res.json({
        success: true,
        data: networkInfo
      });
    } catch (error) {
      logger.error('Failed to get network info:', error);
      throw new BadRequestError(`Failed to get network information: ${error.message}`);
    }
  }

  /**
   * Get current ledger
   */
  static async getCurrentLedger(req, res) {
    try {
      const currentLedger = await sorobanService.getCurrentLedger();

      res.json({
        success: true,
        data: {
          currentLedger,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to get current ledger:', error);
      throw new BadRequestError(`Failed to get current ledger: ${error.message}`);
    }
  }
}

module.exports = TransactionController;
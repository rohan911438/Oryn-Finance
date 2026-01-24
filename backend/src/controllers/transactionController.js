const sorobanService = require('../services/sorobanService');
const logger = require('../config/logger');
const { ValidationError, BadRequestError } = require('../middleware/errorHandler');

class TransactionController {
  /**
   * Build XDR for market creation
   */
  static async buildCreateMarketXDR(req, res) {
    try {
      const { userAddress } = req.user;
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

      const marketData = {
        question,
        category,
        expiryTimestamp,
        initialLiquidity,
        marketContract: marketContract || sorobanService.contracts.PREDICTION_MARKET_TEMPLATE,
        poolAddress: poolAddress || sorobanService.contracts.AMM_POOL,
        yesToken,
        noToken
      };

      const result = await sorobanService.buildCreateMarketXDR(userAddress, marketData);

      logger.info('Built create market XDR', {
        user: userAddress,
        question: question.substring(0, 50),
        category
      });

      res.json({
        success: true,
        data: {
          xdr: result.xdr,
          fees: result.fees,
          simulation: {
            success: true,
            cost: result.simulation.cost,
            resources: result.simulation.minResourceFee
          }
        }
      });
    } catch (error) {
      logger.error('Failed to build create market XDR:', error);
      throw new BadRequestError(`Failed to build market creation transaction: ${error.message}`);
    }
  }

  /**
   * Build XDR for token purchase
   */
  static async buildBuyTokensXDR(req, res) {
    try {
      const { userAddress } = req.user;
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
        userAddress,
        marketContract,
        tokenType,
        amount,
        price
      );

      logger.info('Built buy tokens XDR', {
        user: userAddress,
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
      const { userAddress } = req.user;
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
        userAddress,
        marketContract,
        tokenType,
        amount,
        price
      );

      logger.info('Built sell tokens XDR', {
        user: userAddress,
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
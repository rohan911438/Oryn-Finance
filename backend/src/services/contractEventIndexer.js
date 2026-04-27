const logger = require('../config/logger');
const sorobanService = require('./sorobanService');
const contractConfig = require('../config/contracts');
const { Market, Trade, Position, User, IndexedEvent, ResolutionEvent } = require('../models');

class ContractEventIndexer {
  constructor() {
    this.isRunning = false;
    this.lastProcessedLedger = null;
    this.pollInterval = 30000; // 30 seconds
    this.maxRetries = 3;
  }

  /**
   * Start the event indexing service
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Contract event indexer is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting contract event indexer...');

    // Initialize last processed ledger from database or current ledger
    await this.initializeLastProcessedLedger();

    // Start polling for new events
    this.startPolling();
  }

  /**
   * Stop the event indexing service
   */
  stop() {
    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
    logger.info('Contract event indexer stopped');
  }

  /**
   * Initialize the last processed ledger sequence
   */
  async initializeLastProcessedLedger() {
    try {
      // Try to get from environment or database
      this.lastProcessedLedger = parseInt(process.env.LAST_INDEXED_LEDGER) || null;
      
      if (!this.lastProcessedLedger) {
        // Get current ledger and start from there
        const currentLedger = await sorobanService.getCurrentLedger();
        this.lastProcessedLedger = currentLedger ? currentLedger - 100 : 0; // Start 100 ledgers back
      }

      logger.info(`Starting event indexing from ledger: ${this.lastProcessedLedger}`);
    } catch (error) {
      logger.error('Failed to initialize last processed ledger:', error);
      this.lastProcessedLedger = 0;
    }
  }

  /**
   * Start polling for new events
   */
  startPolling() {
    if (!this.isRunning) return;

    this.pollTimeout = setTimeout(async () => {
      try {
        await this.processNewEvents();
      } catch (error) {
        logger.error('Error processing events:', error);
      }
      
      // Continue polling
      this.startPolling();
    }, this.pollInterval);
  }

  /**
   * Process new events since last processed ledger
   */
  async processNewEvents() {
    try {
      const currentLedger = await sorobanService.getCurrentLedger();
      if (!currentLedger || currentLedger <= this.lastProcessedLedger) {
        return; // No new ledgers to process
      }

      logger.info(`Processing events from ledger ${this.lastProcessedLedger + 1} to ${currentLedger}`);

      // Fetch events from all contracts
      const events = await sorobanService.getAllRecentEvents(this.lastProcessedLedger + 1);
      
      if (events.length === 0) {
        this.lastProcessedLedger = currentLedger;
        return;
      }

      logger.info(`Processing ${events.length} events`);

      // Process events in batches
      const batchSize = 50;
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        await this.processBatch(batch);
      }

      this.lastProcessedLedger = currentLedger;
      logger.info(`Processed events up to ledger ${currentLedger}`);
    } catch (error) {
      logger.error('Failed to process new events:', error);
      // Don't update lastProcessedLedger on error to retry
    }
  }

  /**
   * Process a batch of events
   */
  async processBatch(events) {
    const promises = events.map(event => this.processEvent(event));
    await Promise.allSettled(promises);
  }

  /**
   * Process a single contract event
   */
  async processEvent(event) {
    try {
      const { contractId, topic, value, ledger, txHash } = event;
      
      // Determine which contract emitted this event
      const contractName = this.getContractNameByAddress(contractId);
      if (!contractName) {
        logger.debug(`Unknown contract address: ${contractId}`);
        return;
      }

      await IndexedEvent.updateOne(
        { txHash, topic, contractId },
        {
          $setOnInsert: {
            contractId,
            contractName,
            topic,
            txHash,
            ledger,
            payload: value,
            processedAt: new Date()
          }
        },
        { upsert: true }
      );

      // Parse event based on contract and topic
      await this.parseAndStoreEvent(contractName, topic, value, {
        ledger,
        txHash,
        contractId
      });

    } catch (error) {
      logger.error('Failed to process event:', error, { event });
    }
  }

  /**
   * Get contract name by address
   */
  getContractNameByAddress(address) {
    for (const [name, contractAddress] of Object.entries(contractConfig.DEPLOYED_CONTRACTS)) {
      if (contractAddress === address) {
        return name;
      }
    }
    return null;
  }

  /**
   * Parse and store event based on contract and topic
   */
  async parseAndStoreEvent(contractName, topic, value, metadata) {
    const eventHandler = this.getEventHandler(contractName, topic);
    if (eventHandler) {
      await eventHandler(value, metadata);
    } else {
      logger.debug(`No handler for ${contractName} event: ${topic}`);
    }
  }

  /**
   * Get event handler for specific contract and event type
   */
  getEventHandler(contractName, topic) {
    const handlers = {
      MARKET_FACTORY: {
        'market_created': this.handleMarketCreated.bind(this),
      },
      PREDICTION_MARKET_TEMPLATE: {
        'trade_executed': this.handleTradeExecuted.bind(this),
        'position_updated': this.handlePositionUpdated.bind(this),
        'market_resolved': this.handleMarketResolved.bind(this),
        'winnings_claimed': this.handleWinningsClaimed.bind(this),
      },
      AMM_POOL: {
        'swap_executed': this.handleSwapExecuted.bind(this),
        'liquidity_added': this.handleLiquidityAdded.bind(this),
        'liquidity_removed': this.handleLiquidityRemoved.bind(this),
      },
      ORACLE_RESOLVER: {
        'resolution_submitted': this.handleResolutionSubmitted.bind(this),
        'resolution_disputed': this.handleResolutionDisputed.bind(this),
        'resolution_finalized': this.handleResolutionFinalized.bind(this),
      },
      GOVERNANCE: {
        'proposal_created': this.handleProposalCreated.bind(this),
        'vote_cast': this.handleVoteCast.bind(this),
        'proposal_executed': this.handleProposalExecuted.bind(this),
      },
      REPUTATION: {
        'reputation_updated': this.handleReputationUpdated.bind(this),
      },
      INSURANCE: {
        'insurance_purchased': this.handleInsurancePurchased.bind(this),
        'claim_submitted': this.handleClaimSubmitted.bind(this),
      }
    };

    return handlers[contractName]?.[topic];
  }

  /* ============================================================
     EVENT HANDLERS
  ============================================================ */

  /**
   * Handle market creation events
   */
  async handleMarketCreated(eventValue, metadata) {
    try {
      const {
        marketId,
        creator,
        question,
        category,
        expiresAt,
        contractAddress,
        poolAddress,
        yesToken,
        noToken
      } = eventValue;

      // Check if market already exists
      const existingMarket = await Market.findOne({ marketId });
      if (existingMarket) {
        logger.debug(`Market ${marketId} already indexed`);
        return;
      }

      // Create new market record
      const market = new Market({
        marketId,
        question,
        category,
        creatorWalletAddress: creator,
        expiresAt: new Date(expiresAt * 1000),
        contractAddress,
        poolAddress,
        yesTokenAssetCode: yesToken,
        noTokenAssetCode: noToken,
        yesTokenIssuer: creator, // Simplified - in reality parse from token info
        noTokenIssuer: creator,
        status: 'active',
        totalVolume: 0,
        totalTrades: 0,
        currentYesPrice: 0.5,
        currentNoPrice: 0.5,
        blockchainTxHash: metadata.txHash,
        createdAt: new Date()
      });

      await market.save();
      logger.info(`Indexed new market: ${marketId}`, { question });
    } catch (error) {
      logger.error('Failed to handle market created event:', error);
    }
  }

  /**
   * Handle trade execution events
   */
  async handleTradeExecuted(eventValue, metadata) {
    try {
      const {
        marketId,
        user,
        tokenType,
        amount,
        price,
        cost,
        tradeType
      } = eventValue;

      // Create trade record
      const trade = new Trade({
        tradeId: `indexed_${metadata.txHash}_${Date.now()}`,
        marketId,
        userWalletAddress: user,
        tradeType: tradeType.toLowerCase(), // 'buy' or 'sell'
        tokenType: tokenType.toLowerCase(), // 'yes' or 'no'
        amount: parseFloat(amount) / 1e9, // Convert from contract precision
        price: parseFloat(price) / 1e9,
        totalCost: parseFloat(cost) / 1e9,
        status: 'confirmed',
        stellarTransactionHash: metadata.txHash,
        timestamp: new Date()
      });

      await trade.save();

      // Update market statistics
      await this.updateMarketStats(marketId, trade);

      // Update user position
      await this.updateUserPosition(marketId, user, trade);

      logger.info(`Indexed trade: ${tradeType} ${amount} ${tokenType} tokens in market ${marketId}`);
    } catch (error) {
      logger.error('Failed to handle trade executed event:', error);
    }
  }

  /**
   * Handle position update events
   */
  async handlePositionUpdated(eventValue, metadata) {
    try {
      const { marketId, user, yesTokens, noTokens, totalInvested } = eventValue;

      await Position.findOneAndUpdate(
        { marketId, userWalletAddress: user },
        {
          yesTokens: parseFloat(yesTokens) / 1e9,
          noTokens: parseFloat(noTokens) / 1e9,
          totalInvested: parseFloat(totalInvested) / 1e9,
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );

      logger.debug(`Updated position for user ${user} in market ${marketId}`);
    } catch (error) {
      logger.error('Failed to handle position updated event:', error);
    }
  }

  /**
   * Handle market resolution events
   */
  async handleMarketResolved(eventValue, metadata) {
    try {
      const { marketId, outcome, resolvedAt } = eventValue;

      await Market.findOneAndUpdate(
        { marketId },
        {
          status: 'resolved',
          resolvedOutcome: outcome,
          resolvedAt: new Date(resolvedAt * 1000),
          resolutionTxHash: metadata.txHash
        }
      );

      await this.updateReputationFromResolvedMarket(marketId, outcome);

      logger.info(`Market ${marketId} resolved with outcome: ${outcome}`);
    } catch (error) {
      logger.error('Failed to handle market resolved event:', error);
    }
  }

  /**
   * Handle winnings claimed events
   */
  async handleWinningsClaimed(eventValue, metadata) {
    try {
      const { marketId, user, amount } = eventValue;

      await Position.findOneAndUpdate(
        { marketId, userWalletAddress: user },
        {
          winningsClaimed: parseFloat(amount) / 1e9,
          claimedAt: new Date(),
          claimTxHash: metadata.txHash
        }
      );

      logger.info(`User ${user} claimed ${amount} from market ${marketId}`);
    } catch (error) {
      logger.error('Failed to handle winnings claimed event:', error);
    }
  }

  /**
   * Handle swap events from AMM
   */
  async handleSwapExecuted(eventValue, metadata) {
    try {
      const { user, tokenIn, tokenOut, amountIn, amountOut, fee } = eventValue;

      // Create trade record for AMM swap
      const trade = new Trade({
        tradeId: `amm_${metadata.txHash}_${Date.now()}`,
        marketId: 'AMM_SWAP',
        userWalletAddress: user,
        tradeType: 'buy',
        tokenType: 'yes',
        amount: parseFloat(amountOut) / 1e9,
        price: parseFloat(amountIn) / Math.max(parseFloat(amountOut), 1e-12),
        totalCost: parseFloat(amountIn) / 1e9,
        fees: {
          platformFee: parseFloat(fee || 0) / 1e9,
          stellarFee: 0,
          total: parseFloat(fee || 0) / 1e9
        },
        status: 'confirmed',
        stellarTransactionHash: metadata.txHash,
        timestamp: new Date()
      });

      await trade.save();
      logger.info(`Indexed AMM swap: ${amountIn} ${tokenIn} -> ${amountOut} ${tokenOut}`);
    } catch (error) {
      logger.error('Failed to handle swap executed event:', error);
    }
  }

  /**
   * Handle resolution submission events
   */
  async handleResolutionSubmitted(eventValue, metadata) {
    try {
      const {
        marketId,
        oracle,
        outcome,
        confidenceScore,
        proofDataHash,
        timestamp
      } = eventValue;

      const { ledger, txHash } = metadata;

      await ResolutionEvent.updateOne(
        { txHash, eventType: 'oracle_submission' },
        {
          $setOnInsert: {
            marketId,
            eventType: 'oracle_submission',
            actorAddress: oracle,
            outcome,
            confidenceScore,
            proofDataHash,
            ledger,
            txHash,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            payload: eventValue,
            processedAt: new Date()
          }
        },
        { upsert: true }
      );

      logger.debug(`Persisted oracle_submission ResolutionEvent for market ${marketId}, txHash ${txHash}`);
    } catch (error) {
      logger.error('Failed to handle resolution submitted event:', error);
    }
  }

  /**
   * Handle reputation update events
   */
  async handleReputationUpdated(eventValue, metadata) {
    try {
      const { user, newScore, delta } = eventValue;

      await User.findOneAndUpdate(
        { walletAddress: user },
        {
          reputationScore: parseFloat(newScore) / 1e9,
          lastReputationUpdate: new Date()
        },
        { upsert: true }
      );

      logger.info(`Updated reputation for ${user}: ${newScore} (${delta > 0 ? '+' : ''}${delta})`);
    } catch (error) {
      logger.error('Failed to handle reputation updated event:', error);
    }
  }

  /* ============================================================
     HELPER METHODS
  ============================================================ */

  /**
   * Update market statistics
   */
  async updateMarketStats(marketId, trade) {
    try {
      const update = {
        $inc: {
          totalVolume: trade.totalCost,
          totalTrades: 1
        }
      };

      // Update current prices based on latest trades
      if (trade.tokenType === 'yes') {
        update.currentYesPrice = trade.price;
      } else if (trade.tokenType === 'no') {
        update.currentNoPrice = trade.price;
      }

      await Market.findOneAndUpdate({ marketId }, update);
    } catch (error) {
      logger.error('Failed to update market stats:', error);
    }
  }

  /**
   * Update user position
   */
  async updateUserPosition(marketId, userAddress, trade) {
    try {
      const position = await Position.findOne({ 
        marketId, 
        userWalletAddress: userAddress 
      });

      if (!position) {
        // Create new position
        const newPosition = new Position({
          marketId,
          userWalletAddress: userAddress,
          yesTokens: trade.tokenType === 'yes' && trade.tradeType === 'buy' ? trade.amount : 0,
          noTokens: trade.tokenType === 'no' && trade.tradeType === 'buy' ? trade.amount : 0,
          totalInvested: trade.tradeType === 'buy' ? trade.totalCost : -trade.totalCost,
          unrealizedPnL: 0,
          lastUpdated: new Date()
        });

        await newPosition.save();
      } else {
        // Update existing position
        const update = {
          lastUpdated: new Date()
        };

        if (trade.tokenType === 'yes') {
          if (trade.tradeType === 'buy') {
            update.$inc = { yesTokens: trade.amount, totalInvested: trade.totalCost };
          } else {
            update.$inc = { yesTokens: -trade.amount, totalInvested: -trade.totalCost };
          }
        } else if (trade.tokenType === 'no') {
          if (trade.tradeType === 'buy') {
            update.$inc = { noTokens: trade.amount, totalInvested: trade.totalCost };
          } else {
            update.$inc = { noTokens: -trade.amount, totalInvested: -trade.totalCost };
          }
        }

        await Position.findOneAndUpdate(
          { marketId, userWalletAddress: userAddress },
          update
        );
      }
    } catch (error) {
      logger.error('Failed to update user position:', error);
    }
  }

  async updateReputationFromResolvedMarket(marketId, outcome) {
    const outcomeNormalized =
      typeof outcome === 'boolean'
        ? (outcome ? 'yes' : 'no')
        : String(outcome || '').toLowerCase();
    const winningToken = outcomeNormalized === 'yes' ? 'yes' : 'no';
    const positions = await Position.find({ marketId }).lean();

    for (const position of positions) {
      const winningAmount = winningToken === 'yes' ? (position.yesTokens || 0) : (position.noTokens || 0);
      const isSuccessful = winningAmount > 0;

      const user = await User.findOneAndUpdate(
        { walletAddress: position.userWalletAddress.toLowerCase() },
        {
          $inc: {
            'statistics.totalPredictions': 1,
            ...(isSuccessful ? { 'statistics.successfulPredictions': 1 } : {})
          }
        },
        { new: true, upsert: true }
      );

      if (user) {
        const dynamicScore = this.calculateDynamicReputation(user.statistics, user.reputationScore || 100);
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              reputationScore: dynamicScore,
              lastReputationUpdate: new Date()
            }
          }
        );
      }
    }
  }

  calculateDynamicReputation(stats = {}, currentScore = 100) {
    const totalPredictions = stats.totalPredictions || 0;
    const successfulPredictions = stats.successfulPredictions || 0;
    const winRate = totalPredictions > 0 ? successfulPredictions / totalPredictions : 0;
    const confidenceMultiplier = Math.min(1, totalPredictions / 20);
    const accuracyImpact = (winRate - 0.5) * 300 * confidenceMultiplier;
    const volumeImpact = Math.min(150, (stats.totalVolume || 0) / 1000);

    const nextScore = currentScore + accuracyImpact + volumeImpact;
    return Math.max(0, Math.min(1000, Math.round(nextScore)));
  }

  /* ============================================================
     DEFAULT HANDLERS FOR MISSING EVENTS
  ============================================================ */

  async handleLiquidityAdded(eventValue, metadata) {
    logger.info('Liquidity added event:', eventValue);
  }

  async handleLiquidityRemoved(eventValue, metadata) {
    logger.info('Liquidity removed event:', eventValue);
  }

  async handleResolutionDisputed(eventValue, metadata) {
    try {
      const {
        marketId,
        disputer,
        disputeReason,
        timestamp
      } = eventValue;

      const { ledger, txHash } = metadata;

      await ResolutionEvent.updateOne(
        { txHash, eventType: 'resolution_disputed' },
        {
          $setOnInsert: {
            marketId,
            eventType: 'resolution_disputed',
            actorAddress: disputer,
            disputeReason,
            ledger,
            txHash,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            payload: eventValue,
            processedAt: new Date()
          }
        },
        { upsert: true }
      );

      logger.debug(`Persisted resolution_disputed ResolutionEvent for market ${marketId}, txHash ${txHash}`);
    } catch (error) {
      logger.error('Failed to handle resolution disputed event:', error);
    }
  }

  async handleResolutionFinalized(eventValue, metadata) {
    try {
      const {
        marketId,
        timestamp
      } = eventValue;

      const { ledger, txHash } = metadata;

      await ResolutionEvent.updateOne(
        { txHash, eventType: 'resolution_finalized' },
        {
          $setOnInsert: {
            marketId,
            eventType: 'resolution_finalized',
            ledger,
            txHash,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            payload: eventValue,
            processedAt: new Date()
          }
        },
        { upsert: true }
      );

      logger.debug(`Persisted resolution_finalized ResolutionEvent for market ${marketId}, txHash ${txHash}`);

      // Update the Market document with finalization metadata
      try {
        await Market.findOneAndUpdate(
          { marketId },
          {
            resolutionFinalizationTxHash: txHash,
            resolutionFinalizationTimestamp: timestamp ? new Date(timestamp) : new Date()
          }
        );
      } catch (marketUpdateError) {
        logger.error(`Failed to update market ${marketId} with finalization data (ResolutionEvent already committed):`, marketUpdateError);
      }
    } catch (error) {
      logger.error('Failed to handle resolution finalized event:', error);
    }
  }

  async handleProposalCreated(eventValue, metadata) {
    logger.info('Proposal created event:', eventValue);
  }

  async handleVoteCast(eventValue, metadata) {
    logger.info('Vote cast event:', eventValue);
  }

  async handleProposalExecuted(eventValue, metadata) {
    logger.info('Proposal executed event:', eventValue);
  }

  async handleInsurancePurchased(eventValue, metadata) {
    logger.info('Insurance purchased event:', eventValue);
  }

  async handleClaimSubmitted(eventValue, metadata) {
    logger.info('Claim submitted event:', eventValue);
  }
}

module.exports = new ContractEventIndexer();
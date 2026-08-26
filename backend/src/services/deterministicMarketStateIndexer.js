const logger = require('../config/logger');
const sorobanService = require('./sorobanService');
const contractConfig = require('../config/contracts');
const {
  Market, Trade, Position, User, IndexedEvent, ResolutionEvent,
  MarketEvent, MarketSnapshot, LiquidityPosition, IndexerHealth, ChainReorg
} = require('../models');
const eventSourcingService = require('./eventSourcingService');

class DeterministicMarketStateIndexer {
  constructor() {
    this.indexerId = 'deterministic-market-state-indexer';
    this.isRunning = false;
    this.lastProcessedLedger = null;
    this.pollInterval = 15000;
    this.maxRetries = 3;
    this.batchSize = 100;
    this.healthUpdateInterval = 60000;
    this.startTime = null;
    this.eventsProcessedSinceStart = 0;
    this.processingTimes = [];
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Deterministic market state indexer is already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    logger.info('Starting deterministic market state indexer...');

    await this.initializeLastProcessedLedger();
    await this.updateHealth({ status: 'starting' });
    await this.detectPendingReorgs();

    this.startPolling();
    this.startHealthUpdates();

    await this.updateHealth({ status: 'healthy' });
    logger.info('Deterministic market state indexer started successfully');
  }

  stop() {
    this.isRunning = false;
    if (this.pollTimeout) clearTimeout(this.pollTimeout);
    if (this.healthUpdateTimeout) clearTimeout(this.healthUpdateTimeout);
    logger.info('Deterministic market state indexer stopped');
  }

  async initializeLastProcessedLedger() {
    try {
      const savedHealth = await IndexerHealth.findOne({ indexerId: this.indexerId });
      
      if (savedHealth && savedHealth.lastProcessedLedger > 0) {
        this.lastProcessedLedger = savedHealth.lastProcessedLedger;
        logger.info(`Resuming from saved ledger: ${this.lastProcessedLedger}`);
      } else {
        this.lastProcessedLedger = parseInt(process.env.LAST_INDEXED_LEDGER) || null;
        
        if (!this.lastProcessedLedger) {
          const currentLedger = await sorobanService.getCurrentLedger();
          this.lastProcessedLedger = currentLedger ? currentLedger - 100 : 0;
        }
      }

      logger.info(`Starting event indexing from ledger: ${this.lastProcessedLedger}`);
    } catch (error) {
      logger.error('Failed to initialize last processed ledger:', error);
      this.lastProcessedLedger = 0;
    }
  }

  startPolling() {
    if (!this.isRunning) return;

    this.pollTimeout = setTimeout(async () => {
      try {
        await this.processNewEvents();
      } catch (error) {
        logger.error('Error processing events:', error);
        await this.updateHealth({
          status: 'degraded',
          lastError: error.message,
          lastErrorAt: new Date()
        });
      }
      
      this.startPolling();
    }, this.pollInterval);
  }

  startHealthUpdates() {
    if (!this.isRunning) return;

    this.healthUpdateTimeout = setTimeout(async () => {
      try {
        await this.collectAndReportHealth();
      } catch (error) {
        logger.error('Error updating health:', error);
      }
      
      this.startHealthUpdates();
    }, this.healthUpdateInterval);
  }

  async processNewEvents() {
    const startTime = Date.now();
    
    try {
      const currentLedger = await sorobanService.getCurrentLedger();
      if (!currentLedger || currentLedger <= this.lastProcessedLedger) {
        return;
      }

      logger.info(`Processing events from ledger ${this.lastProcessedLedger + 1} to ${currentLedger}`);

      const reorgDetected = await this.detectChainReorg(currentLedger);
      if (reorgDetected) {
        logger.warn('Chain reorg detected, handling before processing new events');
        await this.handleChainReorg(reorgDetected);
      }

      const events = await sorobanService.getAllRecentEvents(this.lastProcessedLedger + 1);
      
      if (events.length === 0) {
        this.lastProcessedLedger = currentLedger;
        await this.updateLastProcessedLedger(currentLedger);
        return;
      }

      const deduplicatedEvents = await this.deduplicateEvents(events);
      logger.info(`Processing ${deduplicatedEvents.length} unique events (skipped ${events.length - deduplicatedEvents.length} duplicates)`);

      await this.processEventsDeterministically(deduplicatedEvents);
      
      this.lastProcessedLedger = currentLedger;
      await this.updateLastProcessedLedger(currentLedger);

      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) this.processingTimes.shift();
      
      this.eventsProcessedSinceStart += deduplicatedEvents.length;

      await this.updateHealth({
        lastProcessedLedger: currentLedger,
        eventsProcessed: this.eventsProcessedSinceStart,
        duplicateEventsSkipped: (await this.getHealthStats()).duplicateEventsSkipped + (events.length - deduplicatedEvents.length),
        averageProcessingTime: this.calculateAverageProcessingTime()
      });

    } catch (error) {
      logger.error('Failed to process new events:', error);
      throw error;
    }
  }

  async deduplicateEvents(events) {
    const seen = new Map();
    const unique = [];

    for (const event of events) {
      const key = `${event.txHash}:${event.topic}:${event.contractId}`;
      
      if (!seen.has(key)) {
        seen.set(key, event);
        unique.push(event);
      } else {
        logger.debug(`Duplicate event detected: ${key}`);
      }
    }

    return unique;
  }

  async processEventsDeterministically(events) {
    const sortedEvents = events.sort((a, b) => {
      if (a.ledger !== b.ledger) return a.ledger - b.ledger;
      return (a.txIndex || 0) - (b.txIndex || 0);
    });

    for (const event of sortedEvents) {
      await this.processEventDeterministically(event);
    }
  }

  async processEventDeterministically(event) {
    const startTime = Date.now();
    
    try {
      const { contractId, topic, value, ledger, txHash } = event;
      
      const contractName = this.getContractNameByAddress(contractId);
      if (!contractName) {
        logger.debug(`Unknown contract address: ${contractId}`);
        return;
      }

      const eventMetadata = this.extractEventMetadata(contractName, topic, value);

      const existingEvent = await IndexedEvent.findOne({
        txHash, topic, contractId
      });

      if (existingEvent) {
        logger.debug(`Event already indexed: ${txHash}:${topic}`);
        return;
      }

      await IndexedEvent.create({
        contractId,
        contractName,
        topic,
        txHash,
        ledger,
        payload: value,
        processedAt: new Date(),
        ...eventMetadata
      });

      await this.parseAndStoreEvent(contractName, topic, value, {
        ledger,
        txHash,
        contractId
      });

      const processingTime = Date.now() - startTime;
      logger.debug(`Processed event ${topic} in ${processingTime}ms`);

    } catch (error) {
      logger.error('Failed to process event:', error, { event });
      await this.updateHealth({
        errorsCount: (await this.getHealthStats()).errorsCount + 1,
        lastError: error.message,
        lastErrorAt: new Date()
      });
    }
  }

  extractEventMetadata(contractName, topic, value) {
    const metadata = {
      eventType: 'other',
      userAddress: null,
      marketId: null,
      amount: null,
      tokenType: null
    };

    if (value.user) metadata.userAddress = value.user;
    if (value.investor) metadata.userAddress = value.investor;
    if (value.withdrawer) metadata.userAddress = value.withdrawer;
    if (value.creator) metadata.userAddress = value.creator;
    if (value.marketId) metadata.marketId = value.marketId;
    if (value.amount) metadata.amount = value.amount;
    if (value.investmentAmount) metadata.amount = value.investmentAmount;
    if (value.withdrawalAmount) metadata.amount = value.withdrawalAmount;
    if (value.tokenType) metadata.tokenType = value.tokenType.toLowerCase();
    if (value.yesToken) metadata.tokenType = 'yes';
    if (value.noToken) metadata.tokenType = 'no';

    const eventTypeMapping = {
      'investment_made': 'investment',
      'investment_withdrawn': 'withdrawal',
      'liquidity_withdrawn': 'withdrawal',
      'trade_executed': 'trade',
      'liquidity_added': 'liquidity_add',
      'liquidity_removed': 'liquidity_remove',
      'liquidity_removed_withdrawable': 'liquidity_remove',
      'market_created': 'market_creation',
      'market_resolved': 'market_resolution',
      'winnings_claimed': 'winnings_claimed',
      'swap_executed': 'swap',
      'proposal_created': 'governance',
      'vote_cast': 'governance',
      'proposal_executed': 'governance',
      'resolution_submitted': 'oracle',
      'resolution_disputed': 'oracle',
      'resolution_finalized': 'oracle',
      'insurance_purchased': 'insurance',
      'claim_submitted': 'insurance',
      'reputation_updated': 'reputation',
      'circuit_breaker_activated': 'other',
      'liquidity_imbalance_detected': 'other',
      'trading_limit_reached': 'other',
      'emergency_pause_activated': 'other'
    };

    metadata.eventType = eventTypeMapping[topic] || 'other';

    return metadata;
  }

  getContractNameByAddress(address) {
    for (const [name, contractAddress] of Object.entries(contractConfig.DEPLOYED_CONTRACTS)) {
      if (contractAddress === address) {
        return name;
      }
    }
    return null;
  }

  async parseAndStoreEvent(contractName, topic, value, metadata) {
    const eventHandler = this.getEventHandler(contractName, topic);
    if (eventHandler) {
      await eventHandler(value, metadata);
    } else {
      logger.debug(`No handler for ${contractName} event: ${topic}`);
    }
  }

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
        'investment_made': this.handleInvestmentMade.bind(this),
        'investment_withdrawn': this.handleInvestmentWithdrawn.bind(this),
      },
      AMM_POOL: {
        'swap_executed': this.handleSwapExecuted.bind(this),
        'liquidity_added': this.handleLiquidityAdded.bind(this),
        'liquidity_removed': this.handleLiquidityRemoved.bind(this),
        'liquidity_removed_withdrawable': this.handleLiquidityRemoved.bind(this),
        'liquidity_withdrawn': this.handleLiquidityWithdrawn.bind(this),
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
      },
      TREASURY: {
        'investment_made': this.handleInvestmentMade.bind(this),
        'investment_withdrawn': this.handleInvestmentWithdrawn.bind(this),
      }
    };

    return handlers[contractName]?.[topic];
  }

  async handleMarketCreated(eventValue, metadata) {
    try {
      const {
        marketId, creator, question, category, expiresAt,
        contractAddress, poolAddress, yesToken, noToken
      } = eventValue;

      const existingMarket = await Market.findOne({ marketId });
      if (existingMarket) {
        logger.debug(`Market ${marketId} already indexed`);
        return;
      }

      const marketPayload = {
        marketId,
        question,
        category,
        creatorWalletAddress: creator,
        expiresAt: new Date(expiresAt * 1000),
        contractAddress,
        poolAddress,
        yesTokenAssetCode: yesToken,
        noTokenAssetCode: noToken,
        yesTokenIssuer: creator,
        noTokenIssuer: creator,
        status: 'active',
        totalVolume: 0,
        totalTrades: 0,
        currentYesPrice: 0.5,
        currentNoPrice: 0.5,
        blockchainTxHash: metadata.txHash,
        createdAt: new Date()
      };

      await eventSourcingService.appendEvent(marketId, 'MARKET_CREATED', marketPayload, creator);
      
      await this.updateHealth({
        marketsIndexed: (await this.getHealthStats()).marketsIndexed + 1
      });
      
      logger.info(`Indexed new market: ${marketId}`, { question });
    } catch (error) {
      logger.error('Failed to handle market created event:', error);
    }
  }

  async handleTradeExecuted(eventValue, metadata) {
    try {
      const { marketId, user, tokenType, amount, price, cost, tradeType } = eventValue;

      const existingTrade = await Trade.findOne({
        stellarTransactionHash: metadata.txHash,
        marketId,
        userWalletAddress: user
      });

      if (existingTrade) {
        logger.debug(`Trade already indexed for txHash: ${metadata.txHash}`);
        return;
      }

      const trade = new Trade({
        tradeId: `indexed_${metadata.txHash}_${Date.now()}`,
        marketId,
        userWalletAddress: user,
        tradeType: tradeType.toLowerCase(),
        tokenType: tokenType.toLowerCase(),
        amount: parseFloat(amount) / 1e9,
        price: parseFloat(price) / 1e11,
        totalCost: parseFloat(cost) / 1e9,
        status: 'confirmed',
        stellarTransactionHash: metadata.txHash,
        timestamp: new Date()
      });

      await trade.save();

      await this.updateMarketStats(marketId, trade);
      await this.updateUserPosition(marketId, user, trade);

      await this.updateHealth({
        tradesIndexed: (await this.getHealthStats()).tradesIndexed + 1
      });

      logger.info(`Indexed trade: ${tradeType} ${amount} ${tokenType} tokens in market ${marketId}`);
    } catch (error) {
      logger.error('Failed to handle trade executed event:', error);
    }
  }

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

  async handleMarketResolved(eventValue, metadata) {
    try {
      const { marketId, outcome, resolvedAt } = eventValue;

      await eventSourcingService.appendEvent(marketId, 'MARKET_RESOLVED', {
        outcome,
        resolvedAt: new Date(resolvedAt * 1000),
        resolutionTxHash: metadata.txHash
      }, 'SYSTEM_INDEXER');

      await this.updateReputationFromResolvedMarket(marketId, outcome);

      logger.info(`Market ${marketId} resolved with outcome: ${outcome}`);
    } catch (error) {
      logger.error('Failed to handle market resolved event:', error);
    }
  }

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

  async handleSwapExecuted(eventValue, metadata) {
    try {
      const { user, tokenIn, tokenOut, amountIn, amountOut, fee, marketId } = eventValue;

      const trade = new Trade({
        tradeId: `amm_${metadata.txHash}_${Date.now()}`,
        marketId: marketId || 'AMM_SWAP',
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

  async handleLiquidityAdded(eventValue, metadata) {
    try {
      const {
        user, poolAddress, amountA, amountB,
        lpTokens, marketId
      } = eventValue;

      const existingPosition = await LiquidityPosition.findOne({
        marketId,
        userWalletAddress: user,
        status: 'active'
      });

      if (existingPosition) {
        existingPosition.depositedYesAmount = (existingPosition.depositedYesAmount || 0) + parseFloat(amountA || 0) / 1e9;
        existingPosition.depositedNoAmount = (existingPosition.depositedNoAmount || 0) + parseFloat(amountB || 0) / 1e9;
        existingPosition.lpTokens = (existingPosition.lpTokens || 0) + parseFloat(lpTokens || 0) / 1e9;
        await existingPosition.save();
      } else {
        const newPosition = new LiquidityPosition({
          positionId: `lp_${metadata.txHash}_${Date.now()}`,
          marketId,
          userWalletAddress: user,
          depositedYesAmount: parseFloat(amountA || 0) / 1e9,
          depositedNoAmount: parseFloat(amountB || 0) / 1e9,
          lpTokens: parseFloat(lpTokens || 0) / 1e9,
          shareOfPool: 0,
          totalFeesEarned: 0,
          feeHistory: [],
          impermanentLoss: {
            estimatedLossPct: 0,
            estimatedLossUsd: 0,
            holdValue: 0,
            lpValue: 0
          },
          status: 'active',
          createdAt: new Date()
        });
        await newPosition.save();
      }

      await eventSourcingService.appendEvent(marketId, 'LIQUIDITY_ADDED', {
        user,
        amountA: parseFloat(amountA || 0) / 1e9,
        amountB: parseFloat(amountB || 0) / 1e9,
        lpTokens: parseFloat(lpTokens || 0) / 1e9
      }, user);

      logger.info(`Indexed liquidity added: ${user} added ${amountA} + ${amountB} to pool ${poolAddress}`);
    } catch (error) {
      logger.error('Failed to handle liquidity added event:', error);
    }
  }

  async handleLiquidityRemoved(eventValue, metadata) {
    try {
      const {
        user, poolAddress, amountA, amountB,
        lpTokens, marketId
      } = eventValue;

      const position = await LiquidityPosition.findOne({
        marketId,
        userWalletAddress: user,
        status: 'active'
      });

      if (position) {
        position.depositedYesAmount = Math.max(0, (position.depositedYesAmount || 0) - parseFloat(amountA || 0) / 1e9);
        position.depositedNoAmount = Math.max(0, (position.depositedNoAmount || 0) - parseFloat(amountB || 0) / 1e9);
        position.lpTokens = Math.max(0, (position.lpTokens || 0) - parseFloat(lpTokens || 0) / 1e9);
        
        if (position.lpTokens <= 0) {
          position.status = 'withdrawn';
          position.withdrawnAt = new Date();
        }
        
        await position.save();
      }

      await eventSourcingService.appendEvent(marketId, 'LIQUIDITY_REMOVED', {
        user,
        amountA: parseFloat(amountA || 0) / 1e9,
        amountB: parseFloat(amountB || 0) / 1e9,
        lpTokens: parseFloat(lpTokens || 0) / 1e9
      }, user);

      logger.info(`Indexed liquidity removed: ${user} removed ${amountA} + ${amountB} from pool ${poolAddress}`);
    } catch (error) {
      logger.error('Failed to handle liquidity removed event:', error);
    }
  }

  async handleLiquidityWithdrawn(eventValue, metadata) {
    try {
      const { withdrawer, poolAddress, amountA, amountB, timestamp, marketId } = eventValue;

      logger.info(`Liquidity withdrawn: ${amountA} + ${amountB} by ${withdrawer} from pool ${poolAddress}`);
    } catch (error) {
      logger.error('Failed to handle liquidity withdrawn event:', error);
    }
  }

  async handleResolutionSubmitted(eventValue, metadata) {
    try {
      const {
        marketId, oracle, outcome, confidenceScore, proofDataHash, timestamp
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

  async handleResolutionDisputed(eventValue, metadata) {
    try {
      const { marketId, disputer, disputeReason, timestamp } = eventValue;
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
      const { marketId, timestamp } = eventValue;
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

      try {
        await Market.findOneAndUpdate(
          { marketId },
          {
            resolutionFinalizationTxHash: txHash,
            resolutionFinalizationTimestamp: timestamp ? new Date(timestamp) : new Date()
          }
        );
      } catch (marketUpdateError) {
        logger.error(`Failed to update market ${marketId} with finalization data:`, marketUpdateError);
      }

      logger.debug(`Persisted resolution_finalized ResolutionEvent for market ${marketId}, txHash ${txHash}`);
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

  async handleInvestmentMade(eventValue, metadata) {
    try {
      const { investor, marketId, amount, tokenType, timestamp } = eventValue;
      logger.info(`Investment made: ${amount} ${tokenType} by ${investor} in market ${marketId}`);
    } catch (error) {
      logger.error('Failed to handle investment made event:', error);
    }
  }

  async handleInvestmentWithdrawn(eventValue, metadata) {
    try {
      const { investor, marketId, amount, tokenType, timestamp } = eventValue;
      logger.info(`Investment withdrawn: ${amount} ${tokenType} by ${investor} from market ${marketId}`);
    } catch (error) {
      logger.error('Failed to handle investment withdrawn event:', error);
    }
  }

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

  async updateMarketStats(marketId, trade) {
    try {
      const amount = trade.totalCost;
      await eventSourcingService.appendEvent(marketId, 'TRADE_EXECUTED', { amount }, trade.userWalletAddress);

      const currentMarket = await Market.findOne({ marketId });
      let yesPrice = currentMarket ? currentMarket.currentYesPrice : 0.5;
      let noPrice = currentMarket ? currentMarket.currentNoPrice : 0.5;

      if (trade.tokenType === 'yes') {
        yesPrice = trade.price;
        noPrice = 1.0 - trade.price;
      } else if (trade.tokenType === 'no') {
        noPrice = trade.price;
        yesPrice = 1.0 - trade.price;
      }

      await eventSourcingService.appendEvent(marketId, 'PRICES_UPDATED', { yesPrice, noPrice }, trade.userWalletAddress);
    } catch (error) {
      logger.error('Failed to update market stats:', error);
    }
  }

  async updateUserPosition(marketId, userAddress, trade) {
    try {
      const position = await Position.findOne({ 
        marketId, 
        userWalletAddress: userAddress 
      });

      if (!position) {
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
        const update = { lastUpdated: new Date() };

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

  async detectChainReorg(currentLedger) {
    try {
      const reorgWindow = 100;
      const checkLedger = currentLedger - reorgWindow;
      
      if (checkLedger <= this.lastProcessedLedger) {
        return null;
      }

      const eventsAtCheckLedger = await IndexedEvent.find({
        ledger: { $gte: checkLedger - 5, $lte: checkLedger + 5 }
      }).limit(50);

      if (eventsAtCheckLedger.length === 0) {
        return null;
      }

      for (const event of eventsAtCheckLedger) {
        try {
          const txResult = await sorobanService.getTransaction(event.txHash);
          
          if (!txResult || !txResult.success) {
            logger.warn(`Potential reorg detected: txHash ${event.txHash} not found on chain`);
            
            return {
              fromLedger: event.ledger - 5,
              toLedger: event.ledger + 5,
              affectedEvents: [event]
            };
          }
        } catch (error) {
          if (error.message.includes('NOT_FOUND') || error.message.includes('does not exist')) {
            logger.warn(`Potential reorg detected: txHash ${event.txHash} not found`);
            
            return {
              fromLedger: event.ledger - 5,
              toLedger: event.ledger + 5,
              affectedEvents: [event]
            };
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Error detecting chain reorg:', error);
      return null;
    }
  }

  async handleChainReorg(reorgData) {
    const reorgId = `reorg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const reorg = new ChainReorg({
        reorgId,
        fromLedger: reorgData.fromLedger,
        toLedger: reorgData.toLedger,
        affectedEvents: reorgData.affectedEvents.map(e => ({
          txHash: e.txHash,
          topic: e.topic,
          contractId: e.contractId,
          originalLedger: e.ledger,
          status: 'pending'
        })),
        status: 'detected'
      });

      await reorg.save();
      logger.info(`Chain reorg detected and recorded: ${reorgId}`);

      await this.updateHealth({
        reorgCount: (await this.getHealthStats()).reorgCount + 1,
        lastReorgAt: new Date()
      });

      await this.replayAffectedEvents(reorg);

      reorg.status = 'completed';
      reorg.completedAt = new Date();
      reorg.duration = Date.now() - reorg.detectedAt.getTime();
      await reorg.save();

      logger.info(`Chain reorg handled successfully: ${reorgId}`);
    } catch (error) {
      logger.error(`Failed to handle chain reorg ${reorgId}:`, error);
      
      await ChainReorg.updateOne(
        { reorgId },
        { $set: { status: 'failed', error: error.message } }
      );
    }
  }

  async replayAffectedEvents(reorg) {
    reorg.status = 'replaying';
    await reorg.save();

    for (const affectedEvent of reorg.affectedEvents) {
      try {
        const existingEvent = await IndexedEvent.findOne({
          txHash: affectedEvent.txHash,
          topic: affectedEvent.topic
        });

        if (existingEvent) {
          await IndexedEvent.deleteOne({ _id: existingEvent._id });
          reorg.invalidatedEventsCount++;
          logger.info(`Invalidated event: ${affectedEvent.txHash}:${affectedEvent.topic}`);
        }

        const txResult = await sorobanService.getTransaction(affectedEvent.txHash);
        
        if (txResult && txResult.success) {
          const newEvent = {
            contractId: affectedEvent.contractId,
            topic: affectedEvent.topic,
            value: txResult.events?.[0]?.value || {},
            ledger: txResult.ledger || affectedEvent.originalLedger,
            txHash: affectedEvent.txHash
          };

          await this.processEventDeterministically(newEvent);
          reorg.replayedEventsCount++;
          
          affectedEvent.status = 'replayed';
          affectedEvent.newLedger = newEvent.ledger;
        } else {
          affectedEvent.status = 'invalidated';
          logger.warn(`Event ${affectedEvent.txHash} is no longer valid after reorg`);
        }

        await reorg.save();
      } catch (error) {
        logger.error(`Failed to replay event ${affectedEvent.txHash}:`, error);
        affectedEvent.status = 'invalidated';
        await reorg.save();
      }
    }
  }

  async detectPendingReorgs() {
    try {
      const pendingReorgs = await ChainReorg.find({
        status: { $in: ['detected', 'replaying'] }
      });

      for (const reorg of pendingReorgs) {
        logger.warn(`Found pending reorg: ${reorg.reorgId}, attempting to complete...`);
        await this.replayAffectedEvents(reorg);
      }
    } catch (error) {
      logger.error('Error detecting pending reorgs:', error);
    }
  }

  async updateLastProcessedLedger(ledger) {
    try {
      await IndexerHealth.findOneAndUpdate(
        { indexerId: this.indexerId },
        {
          lastProcessedLedger: ledger,
          lastHealthCheck: new Date()
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error('Failed to update last processed ledger:', error);
    }
  }

  async updateHealth(data) {
    try {
      await IndexerHealth.findOneAndUpdate(
        { indexerId: this.indexerId },
        {
          $set: {
            ...data,
            lastHealthCheck: new Date(),
            currentLedger: this.lastProcessedLedger,
            ledgerLag: await this.calculateLedgerLag()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error('Failed to update health:', error);
    }
  }

  async calculateLedgerLag() {
    try {
      const currentLedger = await sorobanService.getCurrentLedger();
      return currentLedger ? currentLedger - this.lastProcessedLedger : 0;
    } catch (error) {
      return 0;
    }
  }

  async collectAndReportHealth() {
    try {
      const healthStats = await this.getHealthStats();
      const uptime = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
      
      const memUsage = process.memoryUsage();
      
      let status = 'healthy';
      if (healthStats.ledgerLag > 1000) {
        status = 'unhealthy';
      } else if (healthStats.ledgerLag > 100 || healthStats.errorsCount > 10) {
        status = 'degraded';
      }

      await this.updateHealth({
        status,
        uptime,
        eventsProcessed: this.eventsProcessedSinceStart,
        memoryUsage: {
          rss: memUsage.rss,
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal
        },
        metadata: {
          pollInterval: this.pollInterval,
          batchSize: this.batchSize,
          processingTimesCount: this.processingTimes.length
        }
      });

      logger.debug('Health metrics updated:', { status, uptime, eventsProcessed: this.eventsProcessedSinceStart });
    } catch (error) {
      logger.error('Failed to collect health metrics:', error);
    }
  }

  async getHealthStats() {
    const health = await IndexerHealth.findOne({ indexerId: this.indexerId });
    return health || {};
  }

  calculateAverageProcessingTime() {
    if (this.processingTimes.length === 0) return 0;
    const sum = this.processingTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.processingTimes.length);
  }

  async reconstructMarketState(marketId) {
    try {
      logger.info(`Reconstructing state for market: ${marketId}`);
      
      const state = await eventSourcingService.replayMarket(marketId);
      
      const market = await Market.findOne({ marketId });
      if (market) {
        const stateHash = this.calculateStateHash(state);
        const dbHash = this.calculateStateHash(market.toObject());
        
        if (stateHash !== dbHash) {
          logger.warn(`State mismatch for market ${marketId}, updating from event store`);
          await Market.findOneAndUpdate({ marketId }, { $set: state });
        }
      } else if (state && state.marketId) {
        logger.info(`Market ${marketId} not found in read model, creating from events`);
        const newMarket = new Market(state);
        await newMarket.save();
      }

      return state;
    } catch (error) {
      logger.error(`Failed to reconstruct market state for ${marketId}:`, error);
      throw error;
    }
  }

  calculateStateHash(state) {
    const crypto = require('crypto');
    const sortedState = Object.keys(state).sort().reduce((acc, key) => {
      acc[key] = state[key];
      return acc;
    }, {});
    return crypto.createHash('md5').update(JSON.stringify(sortedState)).digest('hex');
  }

  async getIndexerStatus() {
    const health = await this.getHealthStats();
    const reorgCount = await ChainReorg.countDocuments();
    const pendingReorgs = await ChainReorg.countDocuments({
      status: { $in: ['detected', 'replaying'] }
    });

    return {
      indexerId: this.indexerId,
      isRunning: this.isRunning,
      health: health || {},
      reorgStats: {
        totalReorgs: reorgCount,
        pendingReorgs
      },
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0
    };
  }
}

module.exports = new DeterministicMarketStateIndexer();

const mockMarketSave = jest.fn();
const mockTradeSave = jest.fn();
const mockPositionSave = jest.fn();

const MockMarket = jest.fn(function MockMarket(data) {
  Object.assign(this, data);
  this.save = mockMarketSave;
});
MockMarket.findOne = jest.fn();
MockMarket.findOneAndUpdate = jest.fn();

const MockTrade = jest.fn(function MockTrade(data) {
  Object.assign(this, data);
  this.save = mockTradeSave;
});

const MockPosition = jest.fn(function MockPosition(data) {
  Object.assign(this, data);
  this.save = mockPositionSave;
});
MockPosition.findOne = jest.fn();
MockPosition.findOneAndUpdate = jest.fn();
MockPosition.find = jest.fn();

const MockUser = {
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
};

const MockIndexedEvent = {
  updateOne: jest.fn()
};

const MockResolutionEvent = {
  updateOne: jest.fn()
};

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../src/services/sorobanService', () => ({
  getCurrentLedger: jest.fn(),
  getAllRecentEvents: jest.fn()
}));

jest.mock('../../src/config/contracts', () => ({
  DEPLOYED_CONTRACTS: {
    MARKET_FACTORY: 'FACTORY_CONTRACT',
    PREDICTION_MARKET_TEMPLATE: 'MARKET_TEMPLATE'
  }
}));

jest.mock('../../src/models', () => ({
  Market: MockMarket,
  Trade: MockTrade,
  Position: MockPosition,
  User: MockUser,
  IndexedEvent: MockIndexedEvent,
  ResolutionEvent: MockResolutionEvent
}));

const sorobanService = require('../../src/services/sorobanService');
const indexer = require('../../src/services/contractEventIndexer');

describe('ContractEventIndexer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    indexer.stop();
    indexer.lastProcessedLedger = null;
    sorobanService.getCurrentLedger.mockResolvedValue(1200);
    sorobanService.getAllRecentEvents.mockResolvedValue([]);
    MockPosition.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    });
  });

  it('initializes the last processed ledger from the current ledger window', async () => {
    delete process.env.LAST_INDEXED_LEDGER;

    await indexer.initializeLastProcessedLedger();

    expect(indexer.lastProcessedLedger).toBe(1100);
  });

  it('resolves deployed addresses back to their contract names', () => {
    expect(indexer.getContractNameByAddress('FACTORY_CONTRACT')).toBe('MARKET_FACTORY');
    expect(indexer.getContractNameByAddress('UNKNOWN')).toBeNull();
  });

  it('processes new ledgers in batches and advances the cursor', async () => {
    indexer.lastProcessedLedger = 1100;
    const processBatchSpy = jest.spyOn(indexer, 'processBatch').mockResolvedValue(undefined);
    sorobanService.getAllRecentEvents.mockResolvedValue([
      { ledger: 1101, contractId: 'FACTORY_CONTRACT', topic: 'market_created', value: {}, txHash: 'tx-1' },
      { ledger: 1102, contractId: 'MARKET_TEMPLATE', topic: 'trade_executed', value: {}, txHash: 'tx-2' }
    ]);

    await indexer.processNewEvents();

    expect(processBatchSpy).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ txHash: 'tx-1' }),
      expect.objectContaining({ txHash: 'tx-2' })
    ]));
    expect(indexer.lastProcessedLedger).toBe(1200);
  });

  it('indexes events and dispatches them to the matching contract handler', async () => {
    const parseSpy = jest.spyOn(indexer, 'parseAndStoreEvent').mockResolvedValue(undefined);

    await indexer.processEvent({
      contractId: 'MARKET_TEMPLATE',
      topic: 'trade_executed',
      value: {
        marketId: 'btc-100k',
        user: 'GTRADER',
        tokenType: 'YES',
        amount: '3000000000',
        price: '650000000',
        cost: '1950000000',
        tradeType: 'BUY'
      },
      ledger: 55,
      txHash: 'tx-trade'
    });

    expect(MockIndexedEvent.updateOne).toHaveBeenCalledWith(
      { txHash: 'tx-trade', topic: 'trade_executed', contractId: 'MARKET_TEMPLATE' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          contractName: 'PREDICTION_MARKET_TEMPLATE',
          ledger: 55
        })
      }),
      { upsert: true }
    );
    expect(parseSpy).toHaveBeenCalledWith(
      'PREDICTION_MARKET_TEMPLATE',
      'trade_executed',
      expect.objectContaining({ marketId: 'btc-100k' }),
      expect.objectContaining({ txHash: 'tx-trade', ledger: 55 })
    );
  });

  it('updates market stats from an indexed trade payload', async () => {
    await indexer.updateMarketStats('btc-100k', {
      tokenType: 'yes',
      price: 0.65,
      totalCost: 1.95
    });

    expect(MockMarket.findOneAndUpdate).toHaveBeenCalledWith(
      { marketId: 'btc-100k' },
      {
        $inc: { totalVolume: 1.95, totalTrades: 1 },
        currentYesPrice: 0.65
      }
    );
  });

  it('indexes market creation events once per market id', async () => {
    MockMarket.findOne.mockResolvedValue(null);

    await indexer.handleMarketCreated({
      marketId: 'market-1',
      creator: 'GCREATOR',
      question: 'Will coverage improve?',
      category: 'technology',
      expiresAt: 1800000000,
      contractAddress: 'GMARKET',
      poolAddress: 'GPOOL',
      yesToken: 'YESABC',
      noToken: 'NOABC'
    }, { txHash: 'tx-create' });

    expect(MockMarket).toHaveBeenCalledWith(expect.objectContaining({
      marketId: 'market-1',
      creatorWalletAddress: 'GCREATOR',
      blockchainTxHash: 'tx-create'
    }));
  });

  it('updates reputation after market resolution based on winning positions', async () => {
    MockPosition.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { userWalletAddress: 'gwinner', yesTokens: 10, noTokens: 0 },
        { userWalletAddress: 'gloser', yesTokens: 0, noTokens: 12 }
      ])
    });
    MockUser.findOneAndUpdate
      .mockResolvedValueOnce({
        _id: 'winner-id',
        reputationScore: 120,
        statistics: { totalPredictions: 6, successfulPredictions: 4, totalVolume: 5000 }
      })
      .mockResolvedValueOnce({
        _id: 'loser-id',
        reputationScore: 120,
        statistics: { totalPredictions: 6, successfulPredictions: 2, totalVolume: 5000 }
      });

    await indexer.updateReputationFromResolvedMarket('market-1', true);

    expect(MockUser.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(MockUser.updateOne).toHaveBeenCalledTimes(2);
    expect(MockUser.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: 'winner-id' },
      expect.objectContaining({
        $set: expect.objectContaining({
          reputationScore: expect.any(Number)
        })
      })
    );
  });

  it('calculates bounded dynamic reputation scores', () => {
    expect(indexer.calculateDynamicReputation({
      totalPredictions: 50,
      successfulPredictions: 45,
      totalVolume: 100000
    }, 950)).toBeLessThanOrEqual(1000);

    expect(indexer.calculateDynamicReputation({
      totalPredictions: 10,
      successfulPredictions: 0,
      totalVolume: 0
    }, 10)).toBeGreaterThanOrEqual(0);
  });

  describe('handleResolutionSubmitted', () => {
    it('upserts an oracle_submission ResolutionEvent with correct field mapping', async () => {
      MockResolutionEvent.updateOne.mockResolvedValue({ upsertedCount: 1 });

      const eventValue = {
        marketId: 'market-btc',
        oracle: 'GORACLE123',
        outcome: true,
        confidenceScore: 0.92,
        proofDataHash: 'abc123hash',
        timestamp: 1700000000
      };
      const metadata = { ledger: 500, txHash: 'tx-submit-1' };

      await indexer.handleResolutionSubmitted(eventValue, metadata);

      expect(MockResolutionEvent.updateOne).toHaveBeenCalledWith(
        { txHash: 'tx-submit-1', eventType: 'oracle_submission' },
        {
          $setOnInsert: expect.objectContaining({
            marketId: 'market-btc',
            eventType: 'oracle_submission',
            actorAddress: 'GORACLE123',
            outcome: true,
            confidenceScore: 0.92,
            proofDataHash: 'abc123hash',
            ledger: 500,
            txHash: 'tx-submit-1',
            payload: eventValue
          })
        },
        { upsert: true }
      );
    });

    it('silently ignores duplicate oracle_submission events (idempotency)', async () => {
      // Simulate MongoDB duplicate key — upsert with $setOnInsert means no write on duplicate
      MockResolutionEvent.updateOne.mockResolvedValue({ upsertedCount: 0, matchedCount: 1 });

      const eventValue = {
        marketId: 'market-btc',
        oracle: 'GORACLE123',
        outcome: true,
        confidenceScore: 0.92,
        proofDataHash: 'abc123hash',
        timestamp: 1700000000
      };
      const metadata = { ledger: 500, txHash: 'tx-submit-1' };

      // Process the same event twice — should not throw
      await indexer.handleResolutionSubmitted(eventValue, metadata);
      await indexer.handleResolutionSubmitted(eventValue, metadata);

      expect(MockResolutionEvent.updateOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleResolutionDisputed', () => {
    it('upserts a resolution_disputed ResolutionEvent with correct field mapping', async () => {
      MockResolutionEvent.updateOne.mockResolvedValue({ upsertedCount: 1 });

      const eventValue = {
        marketId: 'market-btc',
        disputer: 'GDISPUTER456',
        disputeReason: 'Incorrect price feed used',
        timestamp: 1700001000
      };
      const metadata = { ledger: 510, txHash: 'tx-dispute-1' };

      await indexer.handleResolutionDisputed(eventValue, metadata);

      expect(MockResolutionEvent.updateOne).toHaveBeenCalledWith(
        { txHash: 'tx-dispute-1', eventType: 'resolution_disputed' },
        {
          $setOnInsert: expect.objectContaining({
            marketId: 'market-btc',
            eventType: 'resolution_disputed',
            actorAddress: 'GDISPUTER456',
            disputeReason: 'Incorrect price feed used',
            ledger: 510,
            txHash: 'tx-dispute-1',
            payload: eventValue
          })
        },
        { upsert: true }
      );
    });
  });

  describe('handleResolutionFinalized', () => {
    it('upserts a resolution_finalized ResolutionEvent and updates the Market document', async () => {
      MockResolutionEvent.updateOne.mockResolvedValue({ upsertedCount: 1 });
      MockMarket.findOneAndUpdate.mockResolvedValue({ marketId: 'market-btc' });

      const eventValue = {
        marketId: 'market-btc',
        timestamp: 1700002000
      };
      const metadata = { ledger: 520, txHash: 'tx-final-1' };

      await indexer.handleResolutionFinalized(eventValue, metadata);

      expect(MockResolutionEvent.updateOne).toHaveBeenCalledWith(
        { txHash: 'tx-final-1', eventType: 'resolution_finalized' },
        {
          $setOnInsert: expect.objectContaining({
            marketId: 'market-btc',
            eventType: 'resolution_finalized',
            ledger: 520,
            txHash: 'tx-final-1',
            payload: eventValue
          })
        },
        { upsert: true }
      );

      expect(MockMarket.findOneAndUpdate).toHaveBeenCalledWith(
        { marketId: 'market-btc' },
        expect.objectContaining({
          resolutionFinalizationTxHash: 'tx-final-1',
          resolutionFinalizationTimestamp: expect.any(Date)
        })
      );
    });

    it('commits the ResolutionEvent even when the Market update fails', async () => {
      MockResolutionEvent.updateOne.mockResolvedValue({ upsertedCount: 1 });
      MockMarket.findOneAndUpdate.mockRejectedValue(new Error('DB timeout'));

      const logger = require('../../src/config/logger');

      const eventValue = { marketId: 'market-btc', timestamp: 1700002000 };
      const metadata = { ledger: 520, txHash: 'tx-final-2' };

      // Should not throw even though Market update fails
      await expect(
        indexer.handleResolutionFinalized(eventValue, metadata)
      ).resolves.toBeUndefined();

      // ResolutionEvent write still happened
      expect(MockResolutionEvent.updateOne).toHaveBeenCalledTimes(1);
      // Error was logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update market'),
        expect.any(Error)
      );
    });
  });
});

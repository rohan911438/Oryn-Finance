const mongoose = require('mongoose');
const { Market, Position, User, MarketEvent } = require('../../src/models');
const atomicSettlementService = require('../../src/services/atomicSettlementService');
const sorobanService = require('../../src/services/sorobanService');
const stellarService = require('../../src/services/stellarService');

jest.mock('../../src/services/sorobanService');
jest.mock('../../src/services/stellarService');

describe('AtomicSettlementService', () => {
  beforeAll(async () => {
    // Setup mongoose memory server if necessary or just mock the session
    // We will mock mongoose session
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should settle a market atomically and update all positions', async () => {
    const mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn()
    };
    
    mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

    const mockMarket = {
      marketId: 'market1',
      status: 'active',
      save: jest.fn().mockResolvedValue(true)
    };

    const mockPosition = {
      marketId: 'market1',
      status: 'active',
      userWalletAddress: 'user1',
      tokenType: 'yes',
      realizedPnL: 50,
      settle: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };

    const mockUser = {
      walletAddress: 'user1',
      statistics: {
        totalPredictions: 0,
        successfulPredictions: 0
      },
      addProfitLoss: jest.fn(),
      recomputeReputationFromStats: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };

    // Mock chaining for Mongoose queries
    const mockMarketQuery = { session: jest.fn().mockResolvedValue(mockMarket) };
    const mockPositionQuery = { session: jest.fn().mockResolvedValue([mockPosition]) };
    const mockUserQuery = { session: jest.fn().mockResolvedValue(mockUser) };
    const mockEventQuery = {
      session: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(null)
        })
      })
    };

    Market.findOne = jest.fn().mockReturnValue(mockMarketQuery);
    Position.find = jest.fn().mockReturnValue(mockPositionQuery);
    User.findOne = jest.fn().mockReturnValue(mockUserQuery);
    MarketEvent.findOne = jest.fn().mockReturnValue(mockEventQuery);

    sorobanService.resolveMarket = jest.fn().mockResolvedValue({ transactionHash: 'tx123' });

    MarketEvent.prototype.save = jest.fn().mockResolvedValue(true);

    const result = await atomicSettlementService.settleMarket('market1', 'yes', 'admin1', 'oracle');

    expect(mockSession.startTransaction).toHaveBeenCalled();
    expect(mockPosition.settle).toHaveBeenCalledWith('yes', 1.0);
    expect(mockPosition.save).toHaveBeenCalledWith({ session: mockSession });
    expect(mockUser.addProfitLoss).toHaveBeenCalledWith(50);
    expect(mockUser.save).toHaveBeenCalledWith({ session: mockSession });
    expect(mockSession.commitTransaction).toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalled();
    
    expect(result.status).toBe('resolved');
    expect(result.resolvedOutcome).toBe('yes');
    expect(result.resolvedBy).toBe('admin1');
  });

  it('should rollback transaction on partial failure', async () => {
    const mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn()
    };
    
    mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

    const mockMarket = {
      marketId: 'market2',
      status: 'active',
      save: jest.fn().mockResolvedValue(true)
    };

    const mockMarketQuery = { session: jest.fn().mockResolvedValue(mockMarket) };
    Market.findOne = jest.fn().mockReturnValue(mockMarketQuery);

    // Force an error when fetching positions to simulate failure during settlement
    const mockPositionQuery = { session: jest.fn().mockRejectedValue(new Error('DB connection failed')) };
    Position.find = jest.fn().mockReturnValue(mockPositionQuery);
    
    const mockEventQuery = {
      session: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(null)
        })
      })
    };
    MarketEvent.findOne = jest.fn().mockReturnValue(mockEventQuery);
    MarketEvent.prototype.save = jest.fn().mockResolvedValue(true);
    
    sorobanService.resolveMarket = jest.fn().mockResolvedValue({ transactionHash: 'tx456' });

    await expect(atomicSettlementService.settleMarket('market2', 'no', 'admin1'))
      .rejects.toThrow('DB connection failed');

    expect(mockSession.abortTransaction).toHaveBeenCalled();
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalled();
  });
});

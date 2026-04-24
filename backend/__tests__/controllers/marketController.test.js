const mockLean = jest.fn();
const mockMarketModel = jest.fn().mockImplementation(function Market(data) {
  return {
    ...data,
    metadata: data.metadata || {},
    save: jest.fn().mockResolvedValue(this)
  };
});
mockMarketModel.find = jest.fn(() => ({
  sort: jest.fn(() => ({
    skip: jest.fn(() => ({
      limit: jest.fn(() => ({
        lean: mockLean
      }))
    }))
  }))
}));
mockMarketModel.findOne = jest.fn();
mockMarketModel.countDocuments = jest.fn();
mockMarketModel.aggregate = jest.fn();

const mockTradeModel = { find: jest.fn() };
const mockPositionModel = { aggregate: jest.fn(), findOne: jest.fn(), find: jest.fn() };
const mockUserModel = { findOne: jest.fn() };

jest.mock('../../src/models', () => ({
  Market: mockMarketModel,
  User: mockUserModel,
  Trade: mockTradeModel,
  Position: mockPositionModel
}));

jest.mock('../../src/services/stellarService', () => ({
  createMarketAssets: jest.fn()
}));

jest.mock('../../src/services/sorobanService', () => ({
  getAMMReserves: jest.fn(),
  createMarket: jest.fn()
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  market: jest.fn()
}));

const stellarService = require('../../src/services/stellarService');
const sorobanService = require('../../src/services/sorobanService');
const MarketController = require('../../src/controllers/marketController');

describe('MarketController', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {}, user: { walletAddress: 'gcreator', userData: { level: 'user' } } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockLean.mockResolvedValue([]);
    mockMarketModel.countDocuments.mockResolvedValue(0);
    mockTradeModel.find.mockReturnValue({
      sort: jest.fn(() => ({
        limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) }))
      }))
    });
    mockPositionModel.aggregate.mockResolvedValue([]);
    mockPositionModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    mockUserModel.findOne.mockResolvedValue(null);
    sorobanService.getAMMReserves.mockResolvedValue({ result: null });
  });

  it('returns a market by id with related data', async () => {
    req.params = { id: 'btc-1' };
    mockMarketModel.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ marketId: 'btc-1', statistics: { priceHistory: [] } }) });
    mockTradeModel.find.mockReturnValueOnce({
      sort: jest.fn(() => ({ limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([{ tradeId: 'trade-1' }]) })) }))
    });
    mockPositionModel.aggregate.mockResolvedValueOnce([{ _id: 'yes', totalShares: 10 }]);

    await MarketController.getMarketById(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ marketId: 'btc-1', recentTrades: [{ tradeId: 'trade-1' }] })
    }));
  });

  it('returns trending markets', async () => {
    mockMarketModel.find.mockReturnValueOnce({
      sort: jest.fn(() => ({
        limit: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue([{ marketId: 'trend-1' }])
        }))
      }))
    });

    await MarketController.getTrendingMarkets(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { markets: [{ marketId: 'trend-1' }], timeframe: '24h' }
    });
  });

  it('updates allowed fields only', async () => {
    req.params = { id: 'btc-1' };
    req.body = { question: 'Updated', status: 'resolved' };
    const market = { creatorWalletAddress: 'gcreator', status: 'draft', totalTrades: 0, save: jest.fn().mockResolvedValue(true) };
    mockMarketModel.findOne.mockResolvedValue(market);

    await MarketController.updateMarket(req, res);

    expect(market.question).toBe('Updated');
    expect(market.status).toBe('draft');
  });

  it('aggregates market stats', async () => {
    mockMarketModel.aggregate
      .mockResolvedValueOnce([{ totalMarkets: 2, activeMarkets: 1 }])
      .mockResolvedValueOnce([{ _id: 'crypto', count: 1 }]);

    await MarketController.getMarketStats(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { overall: { totalMarkets: 2, activeMarkets: 1 }, byCategory: [{ _id: 'crypto', count: 1 }] } });
  });
});

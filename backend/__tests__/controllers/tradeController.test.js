const mockTradeModel = jest.fn().mockImplementation(function Trade(data) {
  return {
    ...data,
    save: jest.fn().mockResolvedValue(this)
  };
});
mockTradeModel.find = jest.fn();
mockTradeModel.findOne = jest.fn();
mockTradeModel.countDocuments = jest.fn();
mockTradeModel.updateOne = jest.fn();

const mockMarketModel = { findOne: jest.fn() };
const mockUserModel = { findOne: jest.fn() };
const mockPositionModel = jest.fn().mockImplementation(function Position(data) {
  return { ...data, addTrade: jest.fn(), save: jest.fn().mockResolvedValue(this) };
});
mockPositionModel.findOne = jest.fn();

jest.mock('../../src/models', () => ({
  Trade: mockTradeModel,
  Market: mockMarketModel,
  User: mockUserModel,
  Position: mockPositionModel
}));

jest.mock('../../src/services/stellarService', () => ({
  adminKeypair: {}
}));

jest.mock('../../src/services/sorobanService', () => ({
  calculateTradePrice: jest.fn(),
  executeTrade: jest.fn()
}));

jest.mock('../../src/config/logger', () => ({
  trade: jest.fn(),
  error: jest.fn()
}));

const sorobanService = require('../../src/services/sorobanService');
const TradeController = require('../../src/controllers/tradeController');

describe('TradeController', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {}, user: { walletAddress: 'gtrader' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockTradeModel.find.mockReturnValue({
      sort: jest.fn(() => ({
        skip: jest.fn(() => ({
          limit: jest.fn(() => ({
            populate: jest.fn(() => ({
              lean: jest.fn().mockResolvedValue([{ tradeId: 'trade-1', calculatePnL: jest.fn().mockReturnValue(12) }])
            })),
            lean: jest.fn().mockResolvedValue([{ tradeId: 'trade-1', calculatePnL: jest.fn().mockReturnValue(12) }])
          }))
        })),
        limit: jest.fn(() => ({
          populate: jest.fn(() => ({
            lean: jest.fn().mockResolvedValue([{ tradeId: 'trade-1', calculatePnL: jest.fn().mockReturnValue(12) }])
          })),
          lean: jest.fn().mockResolvedValue([{ tradeId: 'trade-1', calculatePnL: jest.fn().mockReturnValue(12) }])
        })),
        lean: jest.fn().mockResolvedValue([{ tradeId: 'pending-1' }])
      }))
    });
    mockTradeModel.countDocuments.mockResolvedValue(1);
    mockTradeModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ tradeId: 'trade-1', userWalletAddress: 'gtrader' }) });
    mockMarketModel.findOne.mockResolvedValue({
      marketId: 'btc-1',
      status: 'active',
      expiresAt: new Date(Date.now() + 3600000),
      currentYesPrice: 0.6,
      currentNoPrice: 0.4,
      platformFee: 0.01,
      metadata: { contractAddress: 'CONTRACT_1' },
      updatePrices: jest.fn(),
      addTrade: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    });
    mockPositionModel.findOne.mockResolvedValue(null);
    mockUserModel.findOne.mockResolvedValue(null);
    sorobanService.calculateTradePrice.mockResolvedValue({ price: 0.63, priceImpact: 0.02, fees: 1 });
    sorobanService.executeTrade.mockResolvedValue({ hash: 'tx-1' });
  });

  it('returns trade history for the authenticated user', async () => {
    await TradeController.getTradeHistory(req, res);

    expect(mockTradeModel.find).toHaveBeenCalledWith(expect.objectContaining({ userWalletAddress: 'gtrader', status: 'confirmed' }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns a trade by id', async () => {
    req.params = { tradeId: 'trade-1' };

    await TradeController.getTradeById(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { tradeId: 'trade-1', userWalletAddress: 'gtrader' } });
  });

  it('calculates a trade quote', async () => {
    req.body = { marketId: 'btc-1', tokenType: 'yes', tradeType: 'buy', amount: 5 };

    await TradeController.calculateTradePrice(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns pending trades', async () => {
    await TradeController.getPendingTrades(req, res);

    expect(mockTradeModel.find).toHaveBeenCalledWith(expect.objectContaining({ userWalletAddress: 'gtrader', status: 'pending' }));
  });

  it('returns recent trades across all markets', async () => {
    await TradeController.getRecentTrades(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { trades: expect.any(Array) } }));
  });
});

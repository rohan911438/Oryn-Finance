const mockUserModel = jest.fn().mockImplementation(function User(data) {
  return {
    ...data,
    toObject: jest.fn(() => ({ ...data })),
    save: jest.fn().mockResolvedValue(this)
  };
});
mockUserModel.findOne = jest.fn();
mockUserModel.findOneAndUpdate = jest.fn();

const mockTradeModel = { countDocuments: jest.fn(), aggregate: jest.fn() };
const mockPositionModel = { countDocuments: jest.fn(), find: jest.fn(), aggregate: jest.fn() };
const mockMarketModel = { find: jest.fn(), countDocuments: jest.fn() };

jest.mock('../../src/models', () => ({
  User: mockUserModel,
  Trade: mockTradeModel,
  Position: mockPositionModel,
  Market: mockMarketModel
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

const UserController = require('../../src/controllers/userController');

describe('UserController', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {}, user: { walletAddress: 'guser' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockTradeModel.countDocuments.mockResolvedValue(3);
    mockPositionModel.countDocuments.mockResolvedValue(2);
    mockTradeModel.aggregate.mockResolvedValue([{ total: 150 }]);
    mockPositionModel.aggregate.mockResolvedValue([{ totalPositions: 1, activePositions: 1, totalRealizedPnL: 10, totalUnrealizedPnL: 5 }]);
    mockMarketModel.countDocuments.mockResolvedValue(1);
    mockMarketModel.find.mockReturnValue({
      sort: jest.fn(() => ({
        skip: jest.fn(() => ({
          limit: jest.fn(() => ({
            lean: jest.fn().mockResolvedValue([{ marketId: 'market-1' }])
          }))
        }))
      }))
    });
    mockPositionModel.find.mockReturnValue({
      populate: jest.fn(() => ({
        sort: jest.fn(() => ({
          skip: jest.fn(() => ({
            limit: jest.fn(() => ({
              lean: jest.fn().mockResolvedValue([{ marketId: 'market-1', tokenType: 'yes', averageEntryPrice: 0.4, availableShares: 10 }])
            }))
          }))
        }))
      }))
    });
  });

  it('returns an existing user profile with computed statistics', async () => {
    mockUserModel.findOne.mockResolvedValueOnce({
      toObject: () => ({ walletAddress: 'guser', statistics: { winRate: 0.5 } }),
      statistics: { winRate: 0.5 },
      achievements: {}
    });

    await UserController.getUserProfile(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('updates the user profile', async () => {
    req.body = { username: 'TraderOne', bio: 'hello' };
    mockUserModel.findOne.mockResolvedValueOnce(null);
    mockUserModel.findOneAndUpdate.mockResolvedValue({ walletAddress: 'guser', username: 'traderone' });

    await UserController.updateUserProfile(req, res);

    expect(mockUserModel.findOneAndUpdate).toHaveBeenCalled();
  });

  it('returns user positions', async () => {
    await UserController.getUserPositions(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns a public profile by wallet address', async () => {
    req.params = { walletAddress: 'gpublic' };
    mockUserModel.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({ walletAddress: 'gpublic', username: 'public-user', statistics: {}, achievements: {} })
    });

    await UserController.getUserByAddress(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns aggregated user stats', async () => {
    mockTradeModel.aggregate.mockResolvedValueOnce([{ totalTrades: 4, totalVolume: 150, totalFees: 2 }]);
    mockPositionModel.aggregate.mockResolvedValueOnce([{ totalPositions: 1, activePositions: 1, totalRealizedPnL: 10, totalUnrealizedPnL: 5 }]);
    await UserController.getUserStats(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ netPnL: 15, roi: 10 }) }));
  });
});

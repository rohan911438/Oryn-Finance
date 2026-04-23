jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../src/config/logger', () => ({ oracle: jest.fn(), error: jest.fn() }));
jest.mock('../../src/models', () => ({ Market: {} }));

const axios = require('axios');
const oracleService = require('../../src/services/oracleService');

describe('OracleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    oracleService.setWeights({});
  });

  it('merges custom weights', () => {
    oracleService.setWeights({ coingecko: 0.8 });
    expect(oracleService.getWeights()).toEqual(expect.objectContaining({ coingecko: 0.8, 'news-api': 0.25 }));
  });

  it('aggregates weighted results', () => {
    const result = oracleService.aggregateResults([
      { source: 'coingecko', outcome: 'yes', confidence: 1, data: {} },
      { source: 'sports-api', outcome: 'yes', confidence: 0.9, data: {} },
      { source: 'news-api', outcome: 'no', confidence: 0.2, data: {} }
    ]);
    expect(['yes', 'no']).toContain(result.outcome);
    expect(result).toHaveProperty('confidence');
  });

  it('resolves crypto prices', async () => {
    axios.get.mockResolvedValueOnce({ data: { bitcoin: { usd: 65000 } } });
    await expect(oracleService.resolveCrypto({ oracleConfig: { symbol: 'bitcoin', targetPrice: 60000, condition: 'above' } })).resolves.toEqual(expect.objectContaining({ outcome: 'yes' }));
  });

  it('resolves sports outcomes', async () => {
    await expect(oracleService.resolveSports({ oracleConfig: { gameId: 'game-1', team: 'Team A', condition: 'win' } })).resolves.toEqual(expect.objectContaining({ outcome: 'yes' }));
  });

  it('resolves news sentiment', async () => {
    axios.get.mockResolvedValueOnce({ data: { articles: [{ title: 'Great success', description: 'good rise' }] } });
    await expect(oracleService.resolveNews({ oracleConfig: { keywords: ['oryn'], sentiment: 'positive', sources: [] } })).resolves.toEqual(expect.objectContaining({ outcome: 'yes' }));
  });
});

const mockFriendbotCall = jest.fn();
const mockServer = {
  friendbot: jest.fn(() => ({ call: mockFriendbotCall })),
  loadAccount: jest.fn(),
  submitTransaction: jest.fn(),
  orderbook: jest.fn(),
  trades: jest.fn(),
  transactions: jest.fn(),
  payments: jest.fn(),
  ledgers: jest.fn()
};

const mockBuild = jest.fn();
const mockTxBuilder = {
  addOperation: jest.fn().mockReturnThis(),
  setTimeout: jest.fn().mockReturnThis(),
  build: mockBuild
};

const mockNativeAsset = {
  isNative: () => true
};

jest.mock('stellar-sdk', () => ({
  Horizon: {
    Server: jest.fn(() => mockServer)
  },
  Networks: {
    TESTNET: 'TESTNET_PASSPHRASE',
    PUBLIC: 'PUBLIC_PASSPHRASE'
  },
  Keypair: {
    fromSecret: jest.fn((secret) => ({
      publicKey: () => `PUB-${secret}`,
      secret: () => secret
    })),
    fromPublicKey: jest.fn((publicKey) => ({ publicKey: () => publicKey })),
    random: jest.fn(() => ({
      publicKey: () => 'GRANDOM',
      secret: () => 'SRANDOM'
    }))
  },
  Asset: Object.assign(
    jest.fn((code, issuer) => ({
      code,
      issuer,
      isNative: () => false
    })),
    {
      native: jest.fn(() => mockNativeAsset)
    }
  ),
  TransactionBuilder: jest.fn(() => mockTxBuilder),
  Operation: {
    changeTrust: jest.fn((config) => ({ type: 'changeTrust', ...config })),
    payment: jest.fn((config) => ({ type: 'payment', ...config })),
    manageSellOffer: jest.fn((config) => ({ type: 'offer', ...config })),
    liquidityPoolDeposit: jest.fn((config) => ({ type: 'deposit', ...config })),
    createClaimableBalance: jest.fn((config) => ({ type: 'claimable', ...config })),
    claimClaimableBalance: jest.fn((config) => ({ type: 'claim', ...config }))
  },
  getLiquidityPoolId: jest.fn(() => Buffer.from('pool-id')),
  BASE_FEE: 100
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  stellar: jest.fn()
}));

describe('StellarService', () => {
  let stellarService;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.ADMIN_SECRET_KEY = 'SADMIN';
    process.env.STELLAR_NETWORK = 'testnet';

    mockServer.friendbot.mockReturnValue({ call: mockFriendbotCall });
    mockFriendbotCall.mockResolvedValue({ ok: true });
    mockServer.loadAccount.mockResolvedValue({
      id: 'GACCOUNT',
      sequence: '123',
      balances: [
        { asset_type: 'native', balance: '50.5000000' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER', balance: '12.0000000', limit: '1000.0000000' }
      ],
      signers: [],
      flags: {},
      thresholds: {}
    });
    mockServer.submitTransaction.mockResolvedValue({ hash: 'tx-hash' });
    mockServer.orderbook.mockReturnValue({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          bids: [{ price: '0.42', amount: '10' }],
          asks: [{ price: '0.55', amount: '5' }]
        })
      })
    });
    mockServer.trades.mockReturnValue({
      forAssetPair: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue({
              records: [{
                id: 'trade-1',
                price: { n: '3', d: '2' },
                amount: '4',
                ledger_close_time: '2026-01-01T00:00:00.000Z',
                trade_type: 'orderbook',
                account: 'GACCOUNT'
              }]
            })
          })
        })
      })
    });
    mockServer.transactions.mockReturnValue({
      forAccount: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            cursor: jest.fn().mockReturnValue({
              call: jest.fn().mockResolvedValue({
                records: [{
                  id: 'tx1',
                  hash: 'hash1',
                  type: 'payment',
                  created_at: '2026-01-01T00:00:00.000Z',
                  fee_paid: '100',
                  successful: true,
                  memo: 'memo',
                  operation_count: 1,
                  paging_token: 'cursor-1'
                }]
              })
            }),
            call: jest.fn().mockResolvedValue({
              records: [{
                id: 'tx1',
                hash: 'hash1',
                type: 'payment',
                created_at: '2026-01-01T00:00:00.000Z',
                fee_paid: '100',
                successful: true,
                memo: 'memo',
                operation_count: 1,
                paging_token: 'cursor-1'
              }]
            })
          })
        })
      })
    });
    mockServer.payments.mockReturnValue({
      forAccount: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue({
              records: [{
                id: 'payment-1',
                type: 'payment',
                from: 'GA',
                to: 'GB',
                asset_type: 'native',
                amount: '12.5',
                created_at: '2026-01-01T00:00:00.000Z',
                transaction_hash: 'hash1'
              }]
            })
          })
        })
      })
    });
    mockServer.ledgers.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [{
              sequence: 123,
              hash: 'ledger-hash',
              closed_at: '2026-01-01T00:00:00.000Z',
              transaction_count: 2,
              operation_count: 4
            }]
          })
        })
      })
    });
    mockBuild.mockReturnValue({
      sign: jest.fn(),
      hash: () => 'tx-hash'
    });

    const StellarSdk = require('stellar-sdk');
    StellarSdk.Keypair.fromPublicKey.mockImplementation((publicKey) => {
      if (publicKey === 'INVALID') {
        throw new Error('invalid key');
      }
      return { publicKey: () => publicKey };
    });

    stellarService = require('../../src/services/stellarService');
  });

  it('creates and funds a testnet account', async () => {
    const account = await stellarService.createAccount();

    expect(account).toEqual({
      publicKey: 'GRANDOM',
      secretKey: 'SRANDOM'
    });
    expect(mockServer.friendbot).toHaveBeenCalledWith('GRANDOM');
    expect(mockFriendbotCall).toHaveBeenCalled();
  });

  it('maps account balances into API-friendly values', async () => {
    const info = await stellarService.getAccountInfo('GACCOUNT');

    expect(info.balances).toEqual([
      { asset: 'XLM', balance: 50.5, limit: null },
      { asset: 'USDC:GISSUER', balance: 12, limit: 1000 }
    ]);
  });

  it('returns native and issued-asset balances', async () => {
    await expect(stellarService.getAccountBalance('GACCOUNT')).resolves.toBe(50.5);
    await expect(stellarService.getAccountBalance('GACCOUNT', 'USDC', 'GISSUER')).resolves.toBe(12);
  });

  it('creates market assets from the admin issuer', async () => {
    const assets = await stellarService.createMarketAssets('market-123');

    expect(assets.yesAsset.code).toMatch(/^YES/);
    expect(assets.noAsset.code).toMatch(/^NO/);
    expect(assets.issuerKeypair.publicKey()).toBe('PUB-SADMIN');
  });

  it('sorts pool assets deterministically', () => {
    const assetA = { code: 'ZED', issuer: 'GZ', isNative: () => false };
    const assetB = { code: 'ABC', issuer: 'GA', isNative: () => false };

    expect(stellarService.sortAssetsForPool(assetA, assetB, 1, 2)).toEqual([assetB, assetA, 2, 1]);
  });

  it('derives market prices from the best ask first', async () => {
    await expect(stellarService.getAssetPrice({ code: 'YES', issuer: 'GISSUER', isNative: () => false })).resolves.toBe(0.55);
  });

  it('maps trade history and payment history into plain objects', async () => {
    const trades = await stellarService.getTrades({ code: 'YES', issuer: 'GISSUER', isNative: () => false });
    const transactions = await stellarService.getTransactionHistory('GACCOUNT', 10, 'cursor-0');
    const payments = await stellarService.getPayments('GACCOUNT');

    expect(trades[0]).toEqual(expect.objectContaining({ id: 'trade-1', price: 1.5, amount: 4 }));
    expect(transactions.records[0]).toEqual(expect.objectContaining({ id: 'tx1', hash: 'hash1', successful: true }));
    expect(transactions.nextCursor).toBe('cursor-1');
    expect(payments[0]).toEqual(expect.objectContaining({ id: 'payment-1', asset: 'XLM', amount: 12.5 }));
  });

  it('validates addresses and reports network status', async () => {
    expect(await stellarService.validateAddress('GVALID')).toBe(true);
    expect(await stellarService.validateAddress('INVALID')).toBe(false);

    const status = await stellarService.getNetworkStatus();
    expect(status).toEqual(expect.objectContaining({
      network: 'testnet',
      isConnected: true
    }));
  });
});

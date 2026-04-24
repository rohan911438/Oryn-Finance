jest.mock('../../src/config/logger', () => ({
  websocket: jest.fn(),
  error: jest.fn()
}));

const websocketHandler = require('../../src/services/websocketHandler');

describe('WebSocketHandler', () => {
  let io;
  let socket;
  let roomEmitter;
  let directEmitter;

  beforeEach(() => {
    jest.clearAllMocks();
    websocketHandler.io = null;
    websocketHandler.connectedUsers = new Map();
    websocketHandler.pendingUpdates = new Map();
    websocketHandler.marketRooms = new Map();
    websocketHandler.lastUpdateTime = new Map();

    roomEmitter = { emit: jest.fn() };
    directEmitter = { emit: jest.fn() };

    io = {
      on: jest.fn(),
      emit: jest.fn(),
      to: jest.fn((room) => room === 'socket123' ? directEmitter : roomEmitter),
      sockets: {
        adapter: {
          rooms: new Map([['market_btc', new Set(['socket123'])]])
        }
      }
    };

    socket = {
      id: 'socket123',
      on: jest.fn(),
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() }))
    };
  });

  it('registers connection handlers during initialization', () => {
    websocketHandler.initialize(io);

    expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));
    expect(websocketHandler.io).toBe(io);
  });

  it('authenticates a socket and tracks the connected user', () => {
    websocketHandler.handleAuthentication(socket, { walletAddress: 'GUSER' });

    expect(websocketHandler.connectedUsers.get('socket123')).toEqual(expect.objectContaining({
      walletAddress: 'guser'
    }));
    expect(socket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({ success: true }));
  });

  it('subscribes and unsubscribes sockets from market rooms', () => {
    websocketHandler.handleMarketSubscription(socket, { marketId: 'btc' });
    expect(socket.join).toHaveBeenCalledWith('market_btc');
    expect(websocketHandler.marketRooms.get('btc').has('socket123')).toBe(true);

    websocketHandler.handleMarketUnsubscription(socket, { marketId: 'btc' });
    expect(socket.leave).toHaveBeenCalledWith('market_btc');
    expect(websocketHandler.marketRooms.has('btc')).toBe(false);
  });

  it('broadcasts market updates to the market room', () => {
    websocketHandler.io = io;

    websocketHandler.broadcastMarketUpdate('btc', { type: 'price', price: 0.61 });

    expect(io.to).toHaveBeenCalledWith('market_btc');
    expect(roomEmitter.emit).toHaveBeenCalledWith('market_update', expect.objectContaining({
      marketId: 'btc',
      data: { type: 'price', price: 0.61 }
    }));
  });

  it('queues market updates when throttled', () => {
    websocketHandler.io = io;
    websocketHandler.lastUpdateTime.set('btc', Date.now());

    websocketHandler.broadcastMarketUpdate('btc', { type: 'price', price: 0.62 });

    expect(websocketHandler.pendingUpdates.get('btc')).toEqual([{ type: 'price', price: 0.62 }]);
  });

  it('broadcasts trades and direct user notifications', () => {
    websocketHandler.io = io;
    websocketHandler.connectedUsers.set('socket123', { walletAddress: 'guser' });

    websocketHandler.broadcastTrade('btc', { tradeId: 'trade-1', amount: 10 });
    websocketHandler.sendUserNotification('GUSER', { type: 'settlement' });

    expect(roomEmitter.emit).toHaveBeenCalledWith('new_trade', expect.objectContaining({ tradeId: 'trade-1' }));
    expect(directEmitter.emit).toHaveBeenCalledWith('notification', expect.objectContaining({ type: 'settlement' }));
  });

  it('reports socket statistics and subscribers', () => {
    websocketHandler.io = io;
    websocketHandler.connectedUsers.set('socket123', { walletAddress: 'guser' });

    expect(websocketHandler.getConnectedUsersCount()).toBe(1);
    expect(websocketHandler.getMarketSubscribers('btc')).toEqual(['socket123']);
    expect(websocketHandler.getWebSocketStats()).toEqual({
      connectedUsers: 1,
      totalRooms: 1,
      authenticatedUsers: 1
    });
  });

  it('cleans up user membership on disconnect', () => {
    websocketHandler.connectedUsers.set('socket123', { walletAddress: 'guser' });
    websocketHandler.marketRooms.set('btc', new Set(['socket123']));

    websocketHandler.handleDisconnection(socket);

    expect(websocketHandler.connectedUsers.has('socket123')).toBe(false);
    expect(websocketHandler.marketRooms.has('btc')).toBe(false);
  });
});

const logger = require('../config/logger');

const UPDATE_THROTTLE_MS = 100;
const MAX_PAYLOAD_SIZE = 1024;
const BATCH_SIZE = 50;

// Room that clients join to receive cross-market dashboard updates
const GLOBAL_SUBSCRIBERS_ROOM = 'global_subscribers';

class WebSocketHandler {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
    this.pendingUpdates = new Map();
    this.marketRooms = new Map();
    this.lastUpdateTime = new Map();
    this.lastSequence = 0;
    // Per-market batch timeouts to avoid a single timeout racing across markets
    this.batchTimeouts = new Map();
    this.priceCache = new Map();
    this.heartbeatInterval = null;
  }

  initialize(io) {
    this.io = io;

    io.on('connection', (socket) => {
      logger.websocket('Client connected', { socketId: socket.id });

      socket.on('authenticate', (data) => {
        this.handleAuthentication(socket, data);
      });

      socket.on('subscribe_market', (data) => {
        this.handleMarketSubscription(socket, data);
      });

      socket.on('unsubscribe_market', (data) => {
        this.handleMarketUnsubscription(socket, data);
      });

      // Let clients opt in to cross-market dashboard updates
      socket.on('subscribe_global', () => {
        socket.join(GLOBAL_SUBSCRIBERS_ROOM);
        socket.emit('subscribed_global', { message: 'Subscribed to global market updates' });
      });

      socket.on('unsubscribe_global', () => {
        socket.leave(GLOBAL_SUBSCRIBERS_ROOM);
      });

      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      socket.on('sync_prices', async (data) => {
        try {
          const { marketIds } = data;
          const syncData = {};
          for (const marketId of marketIds) {
            const cachedPrice = this.priceCache.get(marketId);
            if (cachedPrice) {
              syncData[marketId] = cachedPrice;
            }
          }
          socket.emit('prices_synced', {
            timestamp: new Date().toISOString(),
            serverTime: Date.now(),
            prices: syncData
          });
        } catch (error) {
          logger.error('Error syncing prices:', error);
          socket.emit('sync_error', { message: 'Failed to sync prices' });
        }
      });

      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });

      socket.on('typing', (data) => {
        socket.to(`market_${data.marketId}`).emit('user_typing', {
          user: socket.userData?.walletAddress,
          isTyping: data.isTyping
        });
      });
    });

    this.startHeartbeat();

    logger.websocket('WebSocket server initialized');
  }

  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.io) return;
      // Send heartbeat only to each socket individually so each client
      // receives its own connection health ping rather than a broadcast
      // that carries aggregate server state to every client.
      this.io.sockets.sockets.forEach((socket) => {
        socket.emit('heartbeat', { timestamp: Date.now() });
      });
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  updatePriceCache(marketId, priceData) {
    this.priceCache.set(marketId, {
      ...priceData,
      timestamp: new Date().toISOString(),
      serverTime: Date.now()
    });

    if (this.priceCache.size > 100) {
      const oldestKey = this.priceCache.keys().next().value;
      this.priceCache.delete(oldestKey);
    }
  }

  handleAuthentication(socket, data) {
    try {
      const { walletAddress } = data;

      socket.userData = {
        walletAddress: walletAddress?.toLowerCase(),
        authenticatedAt: new Date()
      };

      this.connectedUsers.set(socket.id, socket.userData);

      socket.emit('authenticated', {
        success: true,
        walletAddress: socket.userData.walletAddress
      });

      logger.websocket('Client authenticated', {
        socketId: socket.id,
        walletAddress: socket.userData.walletAddress
      });
    } catch (error) {
      logger.error('WebSocket authentication failed:', error);
      socket.emit('authentication_error', {
        success: false,
        message: 'Authentication failed'
      });
    }
  }

  handleMarketSubscription(socket, data) {
    const { marketId } = data;

    if (!marketId) {
      socket.emit('subscription_error', { message: 'Market ID required' });
      return;
    }

    const roomName = `market_${marketId}`;
    socket.join(roomName);

    if (!this.marketRooms.has(marketId)) {
      this.marketRooms.set(marketId, new Set());
    }
    this.marketRooms.get(marketId).add(socket.id);

    socket.emit('subscribed', {
      marketId,
      message: `Subscribed to market ${marketId}`
    });

    logger.websocket('Client subscribed to market', {
      socketId: socket.id,
      marketId,
      user: socket.userData?.walletAddress
    });
  }

  handleMarketUnsubscription(socket, data) {
    const { marketId } = data;

    if (!marketId) {
      socket.emit('subscription_error', { message: 'Market ID required' });
      return;
    }

    const roomName = `market_${marketId}`;
    socket.leave(roomName);

    if (this.marketRooms.has(marketId)) {
      this.marketRooms.get(marketId).delete(socket.id);
      if (this.marketRooms.get(marketId).size === 0) {
        this.marketRooms.delete(marketId);
        this.pendingUpdates.delete(marketId);
        this.lastUpdateTime.delete(marketId);
        this._clearBatchTimeout(marketId);
      }
    }

    socket.emit('unsubscribed', {
      marketId,
      message: `Unsubscribed from market ${marketId}`
    });

    logger.websocket('Client unsubscribed from market', {
      socketId: socket.id,
      marketId,
      user: socket.userData?.walletAddress
    });
  }

  handleDisconnection(socket) {
    for (const [marketId, sockets] of this.marketRooms.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          this.marketRooms.delete(marketId);
          this.pendingUpdates.delete(marketId);
          this.lastUpdateTime.delete(marketId);
          this._clearBatchTimeout(marketId);
        }
      }
    }

    const userData = this.connectedUsers.get(socket.id);
    this.connectedUsers.delete(socket.id);

    logger.websocket('Client disconnected', {
      socketId: socket.id,
      user: userData?.walletAddress
    });
  }

  _clearBatchTimeout(marketId) {
    const t = this.batchTimeouts.get(marketId);
    if (t) {
      clearTimeout(t);
      this.batchTimeouts.delete(marketId);
    }
  }

  broadcastMarketUpdate(marketId, updateData) {
    if (!this.io) return;

    const roomName = `market_${marketId}`;
    const now = Date.now();
    const lastUpdate = this.lastUpdateTime.get(marketId) || 0;

    const isCriticalUpdate = updateData.type === 'trade_executed' || updateData.type === 'market_resolved';

    if (!isCriticalUpdate && now - lastUpdate < UPDATE_THROTTLE_MS) {
      if (!this.pendingUpdates.has(marketId)) {
        this.pendingUpdates.set(marketId, []);
      }
      const pending = this.pendingUpdates.get(marketId);
      const optimizedData = this.optimizePayload(updateData);

      const existingIndex = pending.findIndex(update => update.type === updateData.type);
      if (existingIndex >= 0) {
        pending[existingIndex] = optimizedData;
      } else if (pending.length < BATCH_SIZE) {
        pending.push(optimizedData);
      }

      // Use a per-market timeout so multiple markets don't overwrite each other
      if (!this.batchTimeouts.has(marketId)) {
        const t = setTimeout(() => {
          this.flushPendingUpdates(marketId);
        }, UPDATE_THROTTLE_MS);
        this.batchTimeouts.set(marketId, t);
      }
      return;
    }

    this.lastUpdateTime.set(marketId, now);

    const sequenceNumber = (this.lastSequence || 0) + 1;
    this.lastSequence = sequenceNumber;

    const optimizedData = this.optimizePayload(updateData);
    const payload = {
      marketId,
      timestamp: new Date().toISOString(),
      sequence: sequenceNumber,
      data: optimizedData,
      serverTime: now
    };

    this.io.to(roomName).emit('market_update', payload);

    // Only send the lightweight summary to clients who explicitly opted in to global updates
    this.io.to(GLOBAL_SUBSCRIBERS_ROOM).emit('global_market_update', {
      marketId,
      type: updateData.type,
      timestamp: payload.timestamp,
      sequence: sequenceNumber
    });

    logger.websocket('Market update broadcast', {
      marketId,
      roomName,
      updateType: updateData.type,
      sequence: sequenceNumber,
      subscribersCount: this.getMarketSubscribers(marketId).length
    });
  }

  flushPendingUpdates(marketId) {
    this._clearBatchTimeout(marketId);

    if (!this.pendingUpdates.has(marketId)) return;

    const pending = this.pendingUpdates.get(marketId);
    if (pending.length === 0) return;

    const roomName = `market_${marketId}`;
    const now = Date.now();
    const sequenceNumber = (this.lastSequence || 0) + 1;
    this.lastSequence = sequenceNumber;

    const batchPayload = {
      marketId,
      timestamp: new Date().toISOString(),
      sequence: sequenceNumber,
      type: 'batch_update',
      data: pending,
      serverTime: now
    };

    this.io.to(roomName).emit('market_update', batchPayload);

    this.pendingUpdates.set(marketId, []);
    this.lastUpdateTime.set(marketId, now);

    logger.websocket('Batch update flushed', {
      marketId,
      updatesCount: pending.length,
      sequence: sequenceNumber
    });
  }

  optimizePayload(updateData) {
    const optimized = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (JSON.stringify(value).length <= MAX_PAYLOAD_SIZE) {
        optimized[key] = value;
      }
    }
    return optimized;
  }

  broadcastTrade(marketId, tradeData) {
    if (!this.io) return;

    const roomName = `market_${marketId}`;
    this.io.to(roomName).emit('new_trade', {
      marketId,
      timestamp: new Date(),
      ...tradeData
    });

    logger.websocket('Trade broadcast', {
      marketId,
      tradeId: tradeData.tradeId,
      amount: tradeData.amount
    });
  }

  sendUserNotification(walletAddress, notification) {
    if (!this.io) return;

    const userSockets = Array.from(this.connectedUsers.entries())
      .filter(([_, userData]) => userData.walletAddress === walletAddress.toLowerCase())
      .map(([socketId]) => socketId);

    userSockets.forEach(socketId => {
      this.io.to(socketId).emit('notification', {
        timestamp: new Date(),
        ...notification
      });
    });

    logger.websocket('User notification sent', {
      walletAddress,
      socketsCount: userSockets.length,
      type: notification.type
    });
  }

  broadcastAnnouncement(announcement) {
    if (!this.io) return;

    this.io.emit('announcement', {
      timestamp: new Date(),
      ...announcement
    });

    logger.websocket('Platform announcement broadcast', {
      type: announcement.type,
      message: announcement.message
    });
  }

  broadcastLeaderboardUpdate(leaderboardData) {
    if (!this.io) return;

    this.io.emit('leaderboard_update', {
      timestamp: new Date(),
      ...leaderboardData
    });

    logger.websocket('Leaderboard update broadcast');
  }

  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  getMarketSubscribers(marketId) {
    if (!this.io) return [];

    const roomName = `market_${marketId}`;
    const room = this.io.sockets.adapter.rooms.get(roomName);

    return room ? Array.from(room) : [];
  }

  getWebSocketStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      totalRooms: this.io?.sockets.adapter.rooms.size || 0,
      authenticatedUsers: Array.from(this.connectedUsers.values())
        .filter(userData => userData.walletAddress).length
    };
  }
}

module.exports = new WebSocketHandler();

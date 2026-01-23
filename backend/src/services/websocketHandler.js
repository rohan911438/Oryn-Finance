const logger = require('../config/logger');

class WebSocketHandler {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
  }

  initialize(io) {
    this.io = io;
    
    io.on('connection', (socket) => {
      logger.websocket('Client connected', { socketId: socket.id });
      
      // Handle user authentication
      socket.on('authenticate', (data) => {
        this.handleAuthentication(socket, data);
      });
      
      // Handle market subscription
      socket.on('subscribe_market', (data) => {
        this.handleMarketSubscription(socket, data);
      });
      
      // Handle unsubscribe
      socket.on('unsubscribe_market', (data) => {
        this.handleMarketUnsubscription(socket, data);
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });
      
      // Handle user typing in chat (if implemented)
      socket.on('typing', (data) => {
        socket.to(`market_${data.marketId}`).emit('user_typing', {
          user: socket.userData?.walletAddress,
          isTyping: data.isTyping
        });
      });
    });
    
    logger.websocket('WebSocket server initialized');
  }

  handleAuthentication(socket, data) {
    try {
      const { token, walletAddress } = data;
      
      // In a real implementation, verify the JWT token here
      // For now, just store the user data
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
    const userData = this.connectedUsers.get(socket.id);
    this.connectedUsers.delete(socket.id);
    
    logger.websocket('Client disconnected', {
      socketId: socket.id,
      user: userData?.walletAddress
    });
  }

  // Broadcast market price update
  broadcastMarketUpdate(marketId, updateData) {
    if (!this.io) return;
    
    const roomName = `market_${marketId}`;
    this.io.to(roomName).emit('market_update', {
      marketId,
      timestamp: new Date(),
      ...updateData
    });
    
    logger.websocket('Market update broadcast', {
      marketId,
      roomName,
      updateType: updateData.type
    });
  }

  // Broadcast new trade
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

  // Send user-specific notification
  sendUserNotification(walletAddress, notification) {
    if (!this.io) return;
    
    // Find all sockets for this user
    const userSockets = Array.from(this.connectedUsers.entries())
      .filter(([_, userData]) => userData.walletAddress === walletAddress.toLowerCase())
      .map(([socketId, _]) => socketId);
    
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

  // Broadcast platform-wide announcement
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

  // Broadcast leaderboard update
  broadcastLeaderboardUpdate(leaderboardData) {
    if (!this.io) return;
    
    this.io.emit('leaderboard_update', {
      timestamp: new Date(),
      ...leaderboardData
    });
    
    logger.websocket('Leaderboard update broadcast');
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Get connected users by market
  getMarketSubscribers(marketId) {
    if (!this.io) return [];
    
    const roomName = `market_${marketId}`;
    const room = this.io.sockets.adapter.rooms.get(roomName);
    
    return room ? Array.from(room) : [];
  }

  // Get platform statistics
  getWebSocketStats() {
    const stats = {
      connectedUsers: this.connectedUsers.size,
      totalRooms: this.io?.sockets.adapter.rooms.size || 0,
      authenticatedUsers: Array.from(this.connectedUsers.values())
        .filter(userData => userData.walletAddress).length
    };
    
    return stats;
  }
}

module.exports = new WebSocketHandler();
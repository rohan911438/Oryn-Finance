import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useWallet } from './WalletContext';

interface MarketUpdate {
  marketId: string;
  timestamp: string;
  sequence: number;
  data: any;
  serverTime: number;
}

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  subscribeToMarket: (marketId: string) => void;
  unsubscribeFromMarket: (marketId: string) => void;
  subscribedMarkets: Set<string>;
  lastUpdate: MarketUpdate | null;
  connectionQuality: 'good' | 'poor' | 'disconnected';
  syncPrices: (marketIds: string[]) => Promise<any>;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
}

const WS_URL = import.meta.env?.VITE_WS_URL || 'http://localhost:5001';
const RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL = 30000;
const SYNC_INTERVAL = 60000; // Fallback sync every minute

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { publicKey, isConnected: walletConnected } = useWallet();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [subscribedMarkets, setSubscribedMarkets] = useState<Set<string>>(new Set());
  const [lastUpdate, setLastUpdate] = useState<MarketUpdate | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'poor' | 'disconnected'>('disconnected');
  
  const reconnectAttempts = useRef(0);
  const heartbeatTimeout = useRef<NodeJS.Timeout>();
  const syncInterval = useRef<NodeJS.Timeout>();
  const lastHeartbeat = useRef<number>(0);
  const sequenceNumbers = useRef<Map<string, number>>(new Map());

  // Initialize WebSocket connection
  useEffect(() => {
    const newSocket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setConnectionQuality('good');
      reconnectAttempts.current = 0;
      
      // Authenticate if wallet is connected
      if (walletConnected && publicKey) {
        newSocket.emit('authenticate', {
          walletAddress: publicKey,
          timestamp: Date.now()
        });
      }
      
      startHeartbeatMonitoring();
      startFallbackSync();
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setIsConnected(false);
      setConnectionQuality('disconnected');
      stopHeartbeatMonitoring();
      stopFallbackSync();
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      reconnectAttempts.current++;
      setConnectionQuality(reconnectAttempts.current > 2 ? 'poor' : 'good');
    });

    // Authentication response
    newSocket.on('authenticated', (data) => {
      console.log('WebSocket authenticated:', data);
    });

    // Market updates
    newSocket.on('market_update', (update: MarketUpdate) => {
      handleMarketUpdate(update);
    });

    // Batch updates
    newSocket.on('batch_update', (batchUpdate) => {
      if (batchUpdate.data && Array.isArray(batchUpdate.data)) {
        batchUpdate.data.forEach((update: any) => {
          handleMarketUpdate({
            marketId: batchUpdate.marketId,
            timestamp: batchUpdate.timestamp,
            sequence: batchUpdate.sequence,
            data: update,
            serverTime: batchUpdate.serverTime
          });
        });
      }
    });

    // Heartbeat monitoring
    newSocket.on('heartbeat', (data) => {
      lastHeartbeat.current = Date.now();
      setConnectionQuality('good');
    });

    newSocket.on('pong', (data) => {
      const latency = Date.now() - data.timestamp;
      setConnectionQuality(latency < 1000 ? 'good' : 'poor');
    });

    // Price sync response
    newSocket.on('prices_synced', (data) => {
      console.log('Prices synced:', data);
      // Emit custom event for components to listen to
      window.dispatchEvent(new CustomEvent('pricesSynced', { detail: data }));
    });

    setSocket(newSocket);

    return () => {
      stopHeartbeatMonitoring();
      stopFallbackSync();
      newSocket.disconnect();
    };
  }, [walletConnected, publicKey]);

  const handleMarketUpdate = (update: MarketUpdate) => {
    // Check sequence number to prevent out-of-order updates
    const lastSequence = sequenceNumbers.current.get(update.marketId) || 0;
    if (update.sequence <= lastSequence) {
      console.warn('Out of order update received:', update.sequence, 'last:', lastSequence);
      return;
    }
    
    sequenceNumbers.current.set(update.marketId, update.sequence);
    setLastUpdate(update);
    
    // Emit custom event for components to listen to
    window.dispatchEvent(new CustomEvent('marketUpdate', { detail: update }));
  };

  const startHeartbeatMonitoring = () => {
    heartbeatTimeout.current = setInterval(() => {
      if (socket && isConnected) {
        socket.emit('ping');
        
        // Check if we've received a heartbeat recently
        const timeSinceLastHeartbeat = Date.now() - lastHeartbeat.current;
        if (timeSinceLastHeartbeat > HEARTBEAT_INTERVAL * 2) {
          setConnectionQuality('poor');
        }
      }
    }, HEARTBEAT_INTERVAL);
  };

  const stopHeartbeatMonitoring = () => {
    if (heartbeatTimeout.current) {
      clearInterval(heartbeatTimeout.current);
    }
  };

  const startFallbackSync = () => {
    syncInterval.current = setInterval(() => {
      if (subscribedMarkets.size > 0 && connectionQuality !== 'good') {
        console.log('Performing fallback price sync');
        syncPrices(Array.from(subscribedMarkets));
      }
    }, SYNC_INTERVAL);
  };

  const stopFallbackSync = () => {
    if (syncInterval.current) {
      clearInterval(syncInterval.current);
    }
  };

  const subscribeToMarket = (marketId: string) => {
    if (socket && isConnected) {
      socket.emit('subscribe_market', { marketId });
      setSubscribedMarkets(prev => new Set([...prev, marketId]));
    }
  };

  const unsubscribeFromMarket = (marketId: string) => {
    if (socket && isConnected) {
      socket.emit('unsubscribe_market', { marketId });
      setSubscribedMarkets(prev => {
        const newSet = new Set(prev);
        newSet.delete(marketId);
        return newSet;
      });
    }
  };

  const syncPrices = async (marketIds: string[]): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!socket || !isConnected) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Sync timeout'));
      }, 5000);

      const handleSync = (data: any) => {
        clearTimeout(timeout);
        socket.off('prices_synced', handleSync);
        socket.off('sync_error', handleError);
        resolve(data);
      };

      const handleError = (error: any) => {
        clearTimeout(timeout);
        socket.off('prices_synced', handleSync);
        socket.off('sync_error', handleError);
        reject(new Error(error.message || 'Sync failed'));
      };

      socket.on('prices_synced', handleSync);
      socket.on('sync_error', handleError);
      socket.emit('sync_prices', { marketIds });
    });
  };

  const value: WebSocketContextType = {
    socket,
    isConnected,
    subscribeToMarket,
    unsubscribeFromMarket,
    subscribedMarkets,
    lastUpdate,
    connectionQuality,
    syncPrices
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// Hook for market-specific updates
export function useMarketUpdates(marketId: string) {
  const { subscribeToMarket, unsubscribeFromMarket, connectionQuality, syncPrices } = useWebSocket();
  const [marketData, setMarketData] = useState<any>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);

  useEffect(() => {
    if (marketId) {
      subscribeToMarket(marketId);
      
      const handleUpdate = (event: CustomEvent) => {
        const update = event.detail as MarketUpdate;
        if (update.marketId === marketId) {
          setMarketData(update.data);
          setLastUpdateTime(update.serverTime);
        }
      };

      window.addEventListener('marketUpdate', handleUpdate as EventListener);

      return () => {
        unsubscribeFromMarket(marketId);
        window.removeEventListener('marketUpdate', handleUpdate as EventListener);
      };
    }
  }, [marketId, subscribeToMarket, unsubscribeFromMarket]);

  // Fallback polling when connection is poor
  useEffect(() => {
    if (connectionQuality === 'poor' && marketId) {
      const fallbackInterval = setInterval(async () => {
        try {
          await syncPrices([marketId]);
        } catch (error) {
          console.error('Fallback sync failed:', error);
        }
      }, 10000); // Every 10 seconds when connection is poor

      return () => clearInterval(fallbackInterval);
    }
  }, [connectionQuality, marketId, syncPrices]);

  return {
    marketData,
    lastUpdateTime,
    connectionQuality
  };
}
import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { apiService } from '@/services/apiService';

interface PriceData {
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  priceChange24h: number;
  lastTradeTime: string;
  timestamp: string;
}

interface UseRealTimePricesOptions {
  marketId?: string;
  fallbackInterval?: number; // milliseconds
  enableFallback?: boolean;
}

export function useRealTimePrices(options: UseRealTimePricesOptions = {}) {
  const {
    marketId,
    fallbackInterval = 30000, // 30 seconds default
    enableFallback = true
  } = options;

  const { connectionQuality, syncPrices, isConnected } = useWebSocket();
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  
  const fallbackTimeoutRef = useRef<NodeJS.Timeout>();
  const syncInProgressRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);

  // Fetch prices from API (fallback method)
  const fetchPricesFromAPI = useCallback(async (marketIds?: string[]) => {
    if (syncInProgressRef.current) return;
    
    try {
      syncInProgressRef.current = true;
      setError(null);
      
      let priceData: Record<string, PriceData> = {};
      
      if (marketIds && marketIds.length > 0) {
        // Fetch specific markets
        const promises = marketIds.map(async (id) => {
          try {
            const market = await apiService.markets.getMarket(id);
            return {
              id,
              data: {
                yesPrice: market.yesPrice || 0.5,
                noPrice: market.noPrice || 0.5,
                volume24h: market.volume24h || 0,
                priceChange24h: market.priceChange24h || 0,
                lastTradeTime: market.lastTradeTime || new Date().toISOString(),
                timestamp: new Date().toISOString()
              }
            };
          } catch (err) {
            console.error(`Failed to fetch market ${id}:`, err);
            return null;
          }
        });
        
        const results = await Promise.all(promises);
        results.forEach(result => {
          if (result) {
            priceData[result.id] = result.data;
          }
        });
      } else {
        // Fetch all markets
        const markets = await apiService.markets.getMarkets({ limit: 100 });
        markets.forEach((market: any) => {
          priceData[market.id] = {
            yesPrice: market.yesPrice || 0.5,
            noPrice: market.noPrice || 0.5,
            volume24h: market.volume24h || 0,
            priceChange24h: market.priceChange24h || 0,
            lastTradeTime: market.lastTradeTime || new Date().toISOString(),
            timestamp: new Date().toISOString()
          };
        });
      }
      
      setPrices(prev => ({ ...prev, ...priceData }));
      setLastSyncTime(Date.now());
      retryCountRef.current = 0;
      
    } catch (err) {
      console.error('Failed to fetch prices from API:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
      retryCountRef.current++;
    } finally {
      syncInProgressRef.current = false;
      setLoading(false);
    }
  }, []);

  // WebSocket price sync
  const syncPricesViaWebSocket = useCallback(async (marketIds: string[]) => {
    if (!isConnected || syncInProgressRef.current) return;
    
    try {
      syncInProgressRef.current = true;
      const syncData = await syncPrices(marketIds);
      
      if (syncData && syncData.prices) {
        setPrices(prev => ({ ...prev, ...syncData.prices }));
        setLastSyncTime(Date.now());
        setError(null);
        retryCountRef.current = 0;
      }
    } catch (err) {
      console.error('WebSocket price sync failed:', err);
      // Fall back to API if WebSocket sync fails
      if (enableFallback) {
        await fetchPricesFromAPI(marketIds);
      }
    } finally {
      syncInProgressRef.current = false;
    }
  }, [isConnected, syncPrices, enableFallback, fetchPricesFromAPI]);

  // Handle real-time price updates from WebSocket
  useEffect(() => {
    const handlePriceUpdate = (event: CustomEvent) => {
      const update = event.detail;
      
      if (update.type === 'price_update' || update.type === 'trade_executed') {
        const { marketId: updatedMarketId, data } = update;
        
        if (data && (updatedMarketId === marketId || !marketId)) {
          setPrices(prev => ({
            ...prev,
            [updatedMarketId]: {
              yesPrice: data.yesPrice || prev[updatedMarketId]?.yesPrice || 0.5,
              noPrice: data.noPrice || prev[updatedMarketId]?.noPrice || 0.5,
              volume24h: data.volume24h || prev[updatedMarketId]?.volume24h || 0,
              priceChange24h: data.priceChange24h || prev[updatedMarketId]?.priceChange24h || 0,
              lastTradeTime: data.lastTradeTime || new Date().toISOString(),
              timestamp: new Date().toISOString()
            }
          }));
          setLastSyncTime(Date.now());
        }
      }
    };

    const handlePricesSync = (event: CustomEvent) => {
      const syncData = event.detail;
      if (syncData && syncData.prices) {
        setPrices(prev => ({ ...prev, ...syncData.prices }));
        setLastSyncTime(Date.now());
      }
    };

    window.addEventListener('marketUpdate', handlePriceUpdate as EventListener);
    window.addEventListener('pricesSynced', handlePricesSync as EventListener);

    return () => {
      window.removeEventListener('marketUpdate', handlePriceUpdate as EventListener);
      window.removeEventListener('pricesSynced', handlePricesSync as EventListener);
    };
  }, [marketId]);

  // Fallback polling when connection is poor or disconnected
  useEffect(() => {
    if (!enableFallback) return;

    const shouldUseFallback = 
      connectionQuality === 'poor' || 
      connectionQuality === 'disconnected' ||
      (Date.now() - lastSyncTime > fallbackInterval * 2);

    if (shouldUseFallback) {
      const startFallbackPolling = () => {
        const poll = async () => {
          const marketIds = marketId ? [marketId] : Object.keys(prices);
          
          if (isConnected && connectionQuality !== 'disconnected') {
            // Try WebSocket sync first
            await syncPricesViaWebSocket(marketIds);
          } else {
            // Use API fallback
            await fetchPricesFromAPI(marketIds);
          }
        };

        // Initial poll
        poll();

        // Set up interval with exponential backoff on errors
        const interval = Math.min(
          fallbackInterval * Math.pow(1.5, retryCountRef.current),
          60000 // Max 1 minute
        );

        fallbackTimeoutRef.current = setTimeout(() => {
          startFallbackPolling();
        }, interval);
      };

      startFallbackPolling();
    }

    return () => {
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }
    };
  }, [
    connectionQuality,
    lastSyncTime,
    fallbackInterval,
    enableFallback,
    marketId,
    prices,
    isConnected,
    syncPricesViaWebSocket,
    fetchPricesFromAPI
  ]);

  // Initial data load
  useEffect(() => {
    const initialLoad = async () => {
      if (marketId) {
        await fetchPricesFromAPI([marketId]);
      } else {
        await fetchPricesFromAPI();
      }
    };

    initialLoad();
  }, [marketId, fetchPricesFromAPI]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    setLoading(true);
    const marketIds = marketId ? [marketId] : Object.keys(prices);
    
    if (isConnected && connectionQuality === 'good') {
      await syncPricesViaWebSocket(marketIds);
    } else {
      await fetchPricesFromAPI(marketIds);
    }
  }, [marketId, prices, isConnected, connectionQuality, syncPricesViaWebSocket, fetchPricesFromAPI]);

  // Get price for specific market
  const getPrice = useCallback((marketId: string): PriceData | null => {
    return prices[marketId] || null;
  }, [prices]);

  // Get connection status info
  const getConnectionInfo = useCallback(() => {
    return {
      quality: connectionQuality,
      isConnected,
      lastSyncTime,
      timeSinceLastSync: Date.now() - lastSyncTime,
      retryCount: retryCountRef.current
    };
  }, [connectionQuality, isConnected, lastSyncTime]);

  return {
    prices,
    loading,
    error,
    refresh,
    getPrice,
    getConnectionInfo,
    lastSyncTime
  };
}
import { useState, useEffect } from 'react';
import { apiService } from '@/services/apiService';

// Hook for backend connectivity status
export const useBackendStatus = () => {
  const [status, setStatus] = useState<{
    isConnected: boolean;
    isLoading: boolean;
    latency?: number;
    error?: string;
  }>({
    isConnected: false,
    isLoading: true,
  });

  const checkConnection = async () => {
    setStatus(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await apiService.health.testConnection();
      setStatus({
        isConnected: result.isConnected,
        isLoading: false,
        latency: result.latency,
        error: result.error,
      });
    } catch (error) {
      setStatus({
        isConnected: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      });
    }
  };

  useEffect(() => {
    checkConnection();
    
    // Check connection every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return { ...status, refetch: checkConnection };
};

// Hook for backend health status
export const useBackendHealth = () => {
  const [health, setHealth] = useState<{
    data: any | null;
    isLoading: boolean;
    error?: string;
  }>({
    data: null,
    isLoading: true,
  });

  const fetchHealth = async () => {
    setHealth(prev => ({ ...prev, isLoading: true }));
    
    try {
      const data = await apiService.health.getHealth();
      setHealth({
        data,
        isLoading: false,
      });
    } catch (error) {
      setHealth({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch health',
      });
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return { ...health, refetch: fetchHealth };
};

// Hook for contract integration status
export const useContractStatus = () => {
  const [contracts, setContracts] = useState<{
    data: any | null;
    isLoading: boolean;
    error?: string;
  }>({
    data: null,
    isLoading: true,
  });

  const fetchContracts = async () => {
    setContracts(prev => ({ ...prev, isLoading: true }));
    
    try {
      const data = await apiService.health.getContractsHealth();
      setContracts({
        data,
        isLoading: false,
      });
    } catch (error) {
      setContracts({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch contract status',
      });
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  return { ...contracts, refetch: fetchContracts };
};

// Hook for network information
export const useNetworkInfo = () => {
  const [network, setNetwork] = useState<{
    data: any | null;
    isLoading: boolean;
    error?: string;
  }>({
    data: null,
    isLoading: true,
  });

  const fetchNetwork = async () => {
    setNetwork(prev => ({ ...prev, isLoading: true }));
    
    try {
      const data = await apiService.network.getNetworkInfo();
      setNetwork({
        data,
        isLoading: false,
      });
    } catch (error) {
      setNetwork({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch network info',
      });
    }
  };

  useEffect(() => {
    fetchNetwork();
  }, []);

  return { ...network, refetch: fetchNetwork };
};
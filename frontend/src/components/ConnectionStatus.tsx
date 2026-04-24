import React from 'react';
import { Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ConnectionStatus() {
  const { isConnected, connectionQuality, syncPrices, subscribedMarkets } = useWebSocket();

  const getStatusIcon = () => {
    if (!isConnected) {
      return <WifiOff className="w-4 h-4 text-red-500" />;
    }
    
    switch (connectionQuality) {
      case 'good':
        return <Wifi className="w-4 h-4 text-green-500" />;
      case 'poor':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <WifiOff className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    if (!isConnected) return 'Disconnected';
    
    switch (connectionQuality) {
      case 'good':
        return 'Connected';
      case 'poor':
        return 'Poor Connection';
      default:
        return 'Disconnected';
    }
  };

  const getStatusColor = () => {
    if (!isConnected) return 'text-red-500';
    
    switch (connectionQuality) {
      case 'good':
        return 'text-green-500';
      case 'poor':
        return 'text-yellow-500';
      default:
        return 'text-red-500';
    }
  };

  const handleManualSync = async () => {
    try {
      await syncPrices(Array.from(subscribedMarkets));
    } catch (error) {
      console.error('Manual sync failed:', error);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            {getStatusIcon()}
            <span className={`text-xs font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p>Real-time connection status</p>
            {connectionQuality === 'poor' && (
              <p className="text-yellow-400">Using fallback polling</p>
            )}
            {!isConnected && (
              <p className="text-red-400">Prices may be delayed</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
      
      {(connectionQuality === 'poor' || !isConnected) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualSync}
              className="h-6 w-6 p-0"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Sync prices manually</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';

interface XLMPrice {
  price: number;
  change24h: number;
}

export function WalletBalance() {
  const { isConnected, xlmBalance, address } = useWallet();
  const [xlmPrice, setXlmPrice] = useState<XLMPrice | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch XLM price from CoinGecko API
  const fetchXLMPrice = async () => {
    try {
      setLoading(true);
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd&include_24hr_change=true');
      const data = await response.json();
      
      if (data.stellar) {
        setXlmPrice({
          price: data.stellar.usd,
          change24h: data.stellar.usd_24h_change || 0
        });
      }
    } catch (error) {
      console.error('Failed to fetch XLM price:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      fetchXLMPrice();
      // Refresh price every 60 seconds
      const interval = setInterval(fetchXLMPrice, 60000);
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  if (!isConnected) {
    return null;
  }

  const xlmAmount = parseFloat(xlmBalance) || 0;
  const usdValue = xlmPrice ? xlmAmount * xlmPrice.price : 0;
  const isPositiveChange = xlmPrice && xlmPrice.change24h >= 0;

  return (
    <div className="glass-card p-3 rounded-xl border border-white/10 min-w-[180px]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-medium text-white/70">Balance</h3>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-white/50" />}
      </div>
      
      <div className="space-y-1">
        {/* XLM Balance */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white">
            {xlmAmount.toLocaleString(undefined, { 
              minimumFractionDigits: 2,
              maximumFractionDigits: 2 
            })} XLM
          </span>
          {xlmPrice && (
            <div className="text-right">
              <div className="text-xs font-medium text-white">
                ${usdValue.toFixed(2)}
              </div>
              <div className={`text-xs flex items-center gap-1 ${
                isPositiveChange ? 'text-green-400' : 'text-red-400'
              }`}>
                {isPositiveChange ? <TrendingUp className="w-2 h-2" /> : <TrendingDown className="w-2 h-2" />}
                {Math.abs(xlmPrice.change24h).toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        {/* XLM Price - Compact */}
        {xlmPrice && (
          <div className="pt-1 border-t border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">XLM</span>
              <span className="text-white/80">${xlmPrice.price.toFixed(4)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
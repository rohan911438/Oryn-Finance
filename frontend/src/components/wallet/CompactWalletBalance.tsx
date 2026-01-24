import React from 'react';
import { useWallet } from '@/contexts/WalletContext';

export function CompactWalletBalance() {
  const { isConnected, xlmBalance } = useWallet();

  if (!isConnected) {
    return null;
  }

  const xlmAmount = parseFloat(xlmBalance) || 0;

  return (
    <div className="lg:hidden glass-card px-3 py-2 rounded-lg border border-white/10">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-white/70">XLM</span>
        <span className="text-sm font-bold text-white">
          {xlmAmount.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
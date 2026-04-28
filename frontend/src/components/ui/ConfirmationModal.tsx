import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, AlertCircle, AlertTriangle } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  tradeDetails: {
    type: 'buy' | 'sell';
    position: 'YES' | 'NO';
    amount: string;
    price: number;
    tokensReceived: string;
    priceImpact: string;
    fee: string;
    slippage: string;
  };
}

export interface PartialFillResult {
  isPartial: boolean;
  filledAmount: number;
  remainingAmount: number;
  fillRatio: number;
  requestedAmount: number;
}

interface PartialFillBannerProps {
  result: PartialFillResult;
  tokenType: 'YES' | 'NO';
}

export function PartialFillBanner({ result, tokenType }: PartialFillBannerProps) {
  const fillPct = (result.fillRatio * 100).toFixed(1);
  return (
    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
        <p className="text-xs font-semibold text-warning">Partial Fill — Insufficient Liquidity</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center p-2 rounded bg-white/5">
          <p className="text-white/50 mb-0.5">Requested</p>
          <p className="font-bold">{result.requestedAmount.toFixed(4)}</p>
        </div>
        <div className="text-center p-2 rounded bg-success/10 border border-success/20">
          <p className="text-success/70 mb-0.5">Filled</p>
          <p className="font-bold text-success">{result.filledAmount.toFixed(4)}</p>
        </div>
        <div className="text-center p-2 rounded bg-warning/10 border border-warning/20">
          <p className="text-warning/70 mb-0.5">Remaining</p>
          <p className="font-bold text-warning">{result.remainingAmount.toFixed(4)}</p>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-white/50">
          <span>Fill progress</span>
          <span>{fillPct}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-warning to-success transition-all duration-500"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
      <p className="text-[10px] text-white/40">
        {result.remainingAmount.toFixed(4)} {tokenType} tokens remain unfilled. Add liquidity or retry later.
      </p>
    </div>
  );
}

export function TradeConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  tradeDetails,
}: ConfirmationModalProps) {
  const {
    type,
    position,
    amount,
    price,
    tokensReceived,
    priceImpact,
    fee,
    slippage,
  } = tradeDetails;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] glass-card border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            Confirm {type === 'buy' ? 'Buy' : 'Sell'} Order
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Please review your trade details before confirming.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-4">
          <div className="flex justify-between items-end p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <div>
              <span className="text-[10px] font-bold text-white/40 uppercase block mb-1">
                You {type === 'buy' ? 'Pay' : 'Sell'}
              </span>
              <span className="text-2xl font-bold">{amount} USDC</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-white/40 uppercase block mb-1">
                {type === 'buy' ? 'Receiving' : 'To Receive'}
              </span>
              <span className="text-lg font-bold text-primary">
                {tokensReceived} {position}
              </span>
            </div>
          </div>

          <div className="space-y-3 px-1">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Price per token</span>
              <span className="font-medium">{Math.round(price * 100)}¢</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Execution Fee</span>
              <span className="font-medium">{fee} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Price Impact</span>
              <span className={parseFloat(priceImpact) > 1 ? 'text-warning' : 'text-success'}>
                {priceImpact}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Max Slippage</span>
              <span className="font-medium">{slippage}%</span>
            </div>
          </div>

          {parseFloat(priceImpact) > 2 && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning/90">
                High price impact detected. You may receive significantly fewer tokens than expected.
              </p>
            </div>
          )}

          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex gap-2 items-start">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300/80">
              Large orders may be partially filled if liquidity is insufficient. Any unfilled portion will not be charged.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="border-white/10 hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="btn-primary-gradient flex-1"
          >
            {isLoading ? "Confirming..." : `Confirm ${type === 'buy' ? 'Buy' : 'Sell'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

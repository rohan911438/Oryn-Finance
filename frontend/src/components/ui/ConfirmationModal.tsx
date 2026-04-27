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
import { Info, AlertCircle } from "lucide-react";

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

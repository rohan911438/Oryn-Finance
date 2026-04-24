import React, { useState, useEffect } from 'react';
import { AlertTriangle, Settings, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SlippageProtectionProps {
  slippageTolerance: number;
  onSlippageChange: (slippage: number) => void;
  expectedOutput: number;
  minimumOutput: number;
  priceImpact: number;
  isHighImpact?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  showWarning?: boolean;
}

const PRESET_SLIPPAGES = [0.1, 0.5, 1.0, 3.0];

export function SlippageProtection({
  slippageTolerance,
  onSlippageChange,
  expectedOutput,
  minimumOutput,
  priceImpact,
  isHighImpact = false,
  onConfirm,
  onCancel,
  showWarning = false
}: SlippageProtectionProps) {
  const [customSlippage, setCustomSlippage] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    if (!PRESET_SLIPPAGES.includes(slippageTolerance)) {
      setIsCustom(true);
      setCustomSlippage(slippageTolerance.toString());
    }
  }, [slippageTolerance]);

  const handlePresetSlippage = (slippage: number) => {
    setIsCustom(false);
    setCustomSlippage('');
    onSlippageChange(slippage);
  };

  const handleCustomSlippage = (value: string) => {
    setCustomSlippage(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 50) {
      onSlippageChange(numValue);
    }
  };

  const getImpactColor = (impact: number) => {
    if (impact < 1) return 'text-green-500';
    if (impact < 3) return 'text-yellow-500';
    if (impact < 5) return 'text-orange-500';
    return 'text-red-500';
  };

  const getImpactLabel = (impact: number) => {
    if (impact < 1) return 'Low';
    if (impact < 3) return 'Medium';
    if (impact < 5) return 'High';
    return 'Very High';
  };

  return (
    <div className="space-y-4">
      {/* Slippage Settings */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Slippage Tolerance</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <Settings className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Slippage Tolerance</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Your transaction will revert if the price changes unfavorably by more than this percentage.
                </p>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                {PRESET_SLIPPAGES.map((preset) => (
                  <Button
                    key={preset}
                    variant={!isCustom && slippageTolerance === preset ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePresetSlippage(preset)}
                    className="text-xs"
                  >
                    {preset}%
                  </Button>
                ))}
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">Custom</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    placeholder="0.50"
                    value={customSlippage}
                    onChange={(e) => {
                      setIsCustom(true);
                      handleCustomSlippage(e.target.value);
                    }}
                    className="text-xs"
                    min="0"
                    max="50"
                    step="0.1"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                {parseFloat(customSlippage) > 5 && (
                  <p className="text-xs text-yellow-500">
                    High slippage tolerance may result in unfavorable trades
                  </p>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Trade Summary */}
      <div className="space-y-2 p-3 rounded-lg bg-muted/20 border">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Expected Output:</span>
          <span className="font-medium">{expectedOutput.toFixed(4)} tokens</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Minimum Output:</span>
          <span className="font-medium">{minimumOutput.toFixed(4)} tokens</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Price Impact:</span>
          <span className={`font-medium ${getImpactColor(priceImpact)}`}>
            {priceImpact.toFixed(2)}% ({getImpactLabel(priceImpact)})
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Slippage Tolerance:</span>
          <span className="font-medium">{slippageTolerance}%</span>
        </div>
      </div>

      {/* High Impact Warning */}
      {(isHighImpact || priceImpact > 3) && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-yellow-200">
            <strong>High Price Impact Warning:</strong> This trade will significantly affect the market price. 
            You may receive fewer tokens than expected due to slippage.
          </AlertDescription>
        </Alert>
      )}

      {/* Very High Impact Warning */}
      {priceImpact > 10 && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-200">
            <strong>Extreme Price Impact:</strong> This trade has very high price impact ({priceImpact.toFixed(1)}%). 
            Consider splitting into smaller trades or waiting for better liquidity.
          </AlertDescription>
        </Alert>
      )}

      {/* Confirmation Buttons */}
      {showWarning && (onConfirm || onCancel) && (
        <div className="flex gap-2 pt-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
          )}
          {onConfirm && (
            <Button 
              onClick={onConfirm} 
              className="flex-1"
              variant={priceImpact > 10 ? "destructive" : "default"}
            >
              {priceImpact > 10 ? 'Trade Anyway' : 'Confirm Trade'}
            </Button>
          )}
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
        <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-200">
          Slippage tolerance protects you from price movements during transaction execution. 
          Higher tolerance increases success rate but may result in worse prices.
        </p>
      </div>
    </div>
  );
}
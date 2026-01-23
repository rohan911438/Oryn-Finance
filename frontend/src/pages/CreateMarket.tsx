import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, AlertCircle, Info, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useWallet } from '@/contexts/WalletContext';
import { toast } from 'sonner';

const categories = ['Crypto', 'Sports', 'Politics', 'Entertainment'];

export default function CreateMarket() {
  const { isConnected, connect } = useWallet();
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('');
  const [resolutionSource, setResolutionSource] = useState('');
  const [endDate, setEndDate] = useState<Date>();
  const [initialLiquidity, setInitialLiquidity] = useState('100');
  const [feePercentage, setFeePercentage] = useState([2]);
  const [isCreating, setIsCreating] = useState(false);

  const estimatedCost = (parseFloat(initialLiquidity) || 0) + 0.01;
  const charCount = question.length;
  const maxChars = 200;

  const handleCreate = async () => {
    if (!isConnected) {
      connect();
      return;
    }

    if (!question || !category || !resolutionSource || !endDate || !initialLiquidity) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    await new Promise(resolve => setTimeout(resolve, 2500));
    setIsCreating(false);
    toast.success('Market created successfully!', {
      description: 'Your market is now live and tradeable',
    });
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Create a Market</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Launch your own prediction market and earn fees on every trade. Anyone can participate once your market goes live.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Form */}
          <div className="lg:col-span-3 space-y-6">
            <div className="glass-card p-6 space-y-6">
              {/* Question */}
              <div className="space-y-2">
                <Label htmlFor="question">Market Question *</Label>
                <Textarea
                  id="question"
                  placeholder="Will Bitcoin exceed $150,000 by December 31, 2025?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value.slice(0, maxChars))}
                  className="input-dark min-h-[100px]"
                />
                <p className={`text-xs ${charCount > maxChars - 20 ? 'text-warning' : 'text-muted-foreground'}`}>
                  {charCount}/{maxChars} characters
                </p>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="input-dark">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Resolution Source */}
              <div className="space-y-2">
                <Label htmlFor="resolution">Resolution Source & Criteria *</Label>
                <Textarea
                  id="resolution"
                  placeholder="This market will resolve to YES if the official Bitcoin price on CoinGecko exceeds $150,000 at any point before the expiration date..."
                  value={resolutionSource}
                  onChange={(e) => setResolutionSource(e.target.value)}
                  className="input-dark min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  Be specific about what data source and conditions will determine the outcome
                </p>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>Market End Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal input-dark"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-card border-border">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Initial Liquidity */}
              <div className="space-y-2">
                <Label htmlFor="liquidity">Initial Liquidity (USDC) *</Label>
                <Input
                  id="liquidity"
                  type="number"
                  placeholder="100"
                  value={initialLiquidity}
                  onChange={(e) => setInitialLiquidity(e.target.value)}
                  className="input-dark"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 50 USDC. Higher liquidity = better trading experience
                </p>
              </div>

              {/* Fee Percentage */}
              <div className="space-y-4">
                <div className="flex justify-between">
                  <Label>Trading Fee</Label>
                  <span className="text-sm font-medium">{feePercentage[0]}%</span>
                </div>
                <Slider
                  value={feePercentage}
                  onValueChange={setFeePercentage}
                  max={5}
                  min={0.5}
                  step={0.5}
                  className="py-4"
                />
                <p className="text-xs text-muted-foreground">
                  You earn this fee on every trade. Higher fees = more earnings but less trading volume
                </p>
              </div>
            </div>
          </div>

          {/* Preview & Summary */}
          <div className="lg:col-span-2 space-y-6">
            {/* Preview Card */}
            <div className="glass-card p-6">
              <h3 className="font-semibold mb-4">Market Preview</h3>
              <div className="market-card">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-1 rounded text-xs ${category ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {category || 'Category'}
                  </span>
                </div>
                <p className="font-medium mb-4 line-clamp-3">
                  {question || 'Your market question will appear here...'}
                </p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-3 rounded-lg bg-success/10 text-center">
                    <div className="text-xs text-muted-foreground">YES</div>
                    <div className="text-lg font-bold text-success">50¢</div>
                  </div>
                  <div className="p-3 rounded-lg bg-destructive/10 text-center">
                    <div className="text-xs text-muted-foreground">NO</div>
                    <div className="text-lg font-bold text-destructive">50¢</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Ends: {endDate ? format(endDate, 'PP') : 'Not set'}
                </div>
              </div>
            </div>

            {/* Cost Summary */}
            <div className="glass-card p-6">
              <h3 className="font-semibold mb-4">Estimated Costs</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Initial Liquidity</span>
                  <span>${parseFloat(initialLiquidity) || 0} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Network Fee</span>
                  <span>~$0.01 XLM</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="gradient-text">${estimatedCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 flex gap-3">
              <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning">Important</p>
                <p className="text-muted-foreground mt-1">
                  Once created, markets cannot be edited. Make sure all information is accurate before proceeding.
                </p>
              </div>
            </div>

            {/* Create Button */}
            <Button 
              className="w-full btn-primary-gradient py-6 text-lg"
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating Market...
                </>
              ) : !isConnected ? (
                'Connect Wallet to Create'
              ) : (
                'Create Market'
              )}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

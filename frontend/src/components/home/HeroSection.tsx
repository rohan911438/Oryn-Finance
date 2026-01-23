import { Link } from 'react-router-dom';
import { Wallet, ArrowRight, Zap, Shield, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/contexts/WalletContext';
import { platformStats } from '@/data/mockData';

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

const stats = [
  { label: 'Total Volume', value: formatNumber(platformStats.totalVolume), prefix: '' },
  { label: 'Active Markets', value: platformStats.activeMarkets.toString(), prefix: '' },
  { label: 'Total Users', value: formatNumber(platformStats.totalUsers), prefix: '' },
];

const features = [
  { icon: Zap, title: 'Lightning Fast', description: 'Sub-second finality on Stellar' },
  { icon: Shield, title: 'Secure', description: 'Decentralized & trustless' },
  { icon: Globe, title: 'Global', description: 'Trade from anywhere' },
];

export function HeroSection() {
  const { isConnected, connect, isConnecting } = useWallet();

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-hero-gradient" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[120px] animate-pulse delay-1000" />
      
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm text-primary">Built on Stellar Network</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 animate-slide-up">
            <span className="gradient-text">Decentralized</span>
            <br />
            <span className="text-foreground">Prediction Markets</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up delay-100">
            Bet on real-world events with lightning-fast settlements and near-zero fees. 
            Trade YES/NO tokens on crypto, sports, politics, and more.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-slide-up delay-200">
            <Link to="/markets">
              <Button size="lg" className="btn-primary-gradient text-lg px-8 py-6 h-auto group">
                Launch App
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            {!isConnected && (
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg px-8 py-6 h-auto border-border hover:bg-muted"
                onClick={connect}
                disabled={isConnecting}
              >
                <Wallet className="w-5 h-5 mr-2" />
                Connect Wallet
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 animate-slide-up delay-300">
            {stats.map((stat, index) => (
              <div key={stat.label} className="stat-card">
                <div className="text-3xl md:text-4xl font-bold gradient-text mb-2">
                  {stat.prefix}{stat.value}
                </div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up delay-400">
            {features.map((feature) => (
              <div key={feature.title} className="flex items-center justify-center gap-3 text-muted-foreground">
                <feature.icon className="w-5 h-5 text-primary" />
                <div className="text-left">
                  <div className="font-medium text-foreground">{feature.title}</div>
                  <div className="text-sm">{feature.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}

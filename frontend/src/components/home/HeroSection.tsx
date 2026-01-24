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
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-transparent">
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto text-center">
          {/* Headline - Matching Image (Large, Uppercase, Tracking-tight) */}
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-black mb-6 text-white tracking-tighter uppercase leading-[0.9]">
            PLAN. PROTECT. PASS.
          </h1>

          {/* Subheadline - Matching Image (Italicized, Seamlessly on Stellar) */}
          <p className="text-3xl md:text-5xl lg:text-6xl italic text-white mb-12 font-light tracking-tight">
            Seamlessly on <span className="font-medium not-italic">Stellar.</span>
          </p>

          {/* Descriptive Text - Matching Image Style */}
          <div className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto mb-16 space-y-2 font-medium">
            <p>No courts. No delays. Just instant,</p>
            <p>on-chain prediction markets.</p>
          </div>

          {/* CTA Button - Matching Image Style (Black, rounded, white text) */}
          <div className="flex justify-center mb-24">
            {!isConnected ? (
              <button 
                className="bg-black text-white rounded-full px-10 py-4 text-xl font-bold hover:bg-black/80 transition-all border border-white/10 shadow-2xl"
                onClick={connect}
                disabled={isConnecting}
              >
                Connect Wallet
              </button>
            ) : (
              <Link to="/markets">
                <button 
                  className="bg-black text-white rounded-full px-10 py-4 text-xl font-bold hover:bg-black/80 transition-all border border-white/10 shadow-2xl"
                >
                  Explore Markets
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

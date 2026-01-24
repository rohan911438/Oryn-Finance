import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Zap, Shield, Globe, Wallet, CheckCircle2 } from 'lucide-react';

export default function About() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-24 relative z-10">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto text-center mb-32">
          <h1 className="text-6xl md:text-9xl font-black mb-8 text-white tracking-tighter uppercase leading-[0.9] about-animate">
            The Future <br />
            <span className="text-white/40">of Prediction.</span>
          </h1>
          <p className="text-xl md:text-2xl text-neutral-400 font-medium max-w-2xl mx-auto leading-relaxed">
            Oryn Finance is a decentralized protocol building transparent, efficient information markets on the Stellar network.
          </p>
        </div>

        {/* Workflow Section */}
        <div className="mb-32">
          <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-12 border-l-4 border-primary pl-6">
            How the Protocol Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: 'Create', desc: 'Deploy a new market by defining a verifiable question and depositing initial liquidity.' },
              { title: 'Trade', desc: 'Participants buy YES or NO tokens. Prices reflect the aggregate probability of the outcome.' },
              { title: 'Resolve', desc: 'Decentralized oracles verify the result, and winners claim their payouts instantly.' }
            ].map((item, i) => (
              <div key={item.title} className="p-8 rounded-[2rem] bg-[#0a0a0a] border border-white/5 hover:border-white/10 transition-all group">
                <span className="text-4xl font-black text-white/10 group-hover:text-primary transition-colors">0{i + 1}</span>
                <h3 className="text-xl font-black text-white mt-4 mb-4 uppercase italic">{item.title}</h3>
                <p className="text-neutral-500 font-medium leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Gateway Section */}
        <div className="mb-32 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">
              Seamless <br />
              <span className="text-white/40">USDC Gateway.</span>
            </h2>
            <p className="text-lg text-neutral-400 font-medium leading-relaxed">
              We utilize Stellar's native USDC support to provide a fast and low-cost payment gateway. No need for complex wrapping or expensive bridges.
            </p>
            <ul className="space-y-4">
              {[
                'Direct Wallet-to-Wallet Transactions',
                'Sub-cent Transaction Fees',
                'Instant Liquidity via Stellar DEX',
                'Native Asset Security'
              ].map((text) => (
                <li key={text} className="flex items-center gap-3 text-white font-black text-sm uppercase tracking-wider">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-primary" />
                  </div>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-1 rounded-[2.5rem] bg-gradient-to-br from-primary/20 to-transparent">
            <div className="bg-black rounded-[2.4rem] p-12 overflow-hidden relative group">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity blur-3xl" />
              <div className="relative z-10 text-center">
                <div className="w-24 h-24 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-8 shadow-2xl">
                  <Wallet className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-2xl font-black text-white uppercase mb-4 tracking-tight">Connect Freighter</h3>
                <p className="text-neutral-500 text-sm font-medium mb-8">Start trading with your Stellar wallet in seconds.</p>
                <div className="px-8 py-4 rounded-xl bg-white text-black font-black uppercase tracking-tighter hover:bg-white/90 transition-all cursor-pointer">
                  Launch App
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Instructions */}
        <div className="p-12 md:p-20 rounded-[3rem] bg-[#0a0a0a] border border-white/5 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-8 italic">Getting Started is Easy.</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="space-y-4">
                <h4 className="text-white font-black uppercase text-sm tracking-widest">1. Install Wallet</h4>
                <p className="text-neutral-500 text-sm font-medium">Download and set up the Freighter wallet for Stellar.</p>
              </div>
              <div className="space-y-4">
                <h4 className="text-white font-black uppercase text-sm tracking-widest">2. Fund with USDC</h4>
                <p className="text-neutral-500 text-sm font-medium">Add some USDC to your wallet to start making predictions.</p>
              </div>
              <div className="space-y-4">
                <h4 className="text-white font-black uppercase text-sm tracking-widest">3. Pick a Market</h4>
                <p className="text-neutral-500 text-sm font-medium">Browse active markets and choose an outcome you believe in.</p>
              </div>
              <div className="space-y-4">
                <h4 className="text-white font-black uppercase text-sm tracking-widest">4. Win & Claim</h4>
                <p className="text-neutral-500 text-sm font-medium">Once resolved, claim your winnings directly to your wallet.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

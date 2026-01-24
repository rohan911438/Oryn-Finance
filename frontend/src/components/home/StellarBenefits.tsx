import { Zap, DollarSign, Shield, Clock } from 'lucide-react';

const benefits = [
  {
    icon: Zap,
    title: 'Sub-Second Finality',
    description: 'Trades confirm in under 5 seconds. No waiting, no uncertainty.',
    stat: '<5s',
  },
  {
    icon: DollarSign,
    title: 'Near-Zero Fees',
    description: 'Transaction costs are a fraction of a cent. Keep more of your profits.',
    stat: '<$0.01',
  },
  {
    icon: Shield,
    title: 'Native USDC',
    description: 'Trade with real USDC issued directly on Stellar. No wrapping required.',
    stat: 'USDC',
  },
  {
    icon: Clock,
    title: '24/7 Uptime',
    description: 'Stellar network runs continuously. Trade anytime, anywhere.',
    stat: '99.9%',
  },
];

export function StellarBenefits() {
  return (
    <section className="py-32 relative overflow-hidden bg-transparent">
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6 transition-all hover:bg-white/10 cursor-default">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Powered by Stellar</span>
          </div>
          <h2 className="text-5xl md:text-7xl font-black mb-8 text-white tracking-tighter uppercase leading-[0.9]">
            The Speed <br />
            <span className="text-white/40">You Deserve.</span>
          </h2>
          <p className="text-xl text-neutral-400 font-medium max-w-xl">
            Stellar provides sub-second finality and near-zero fees, making it the ultimate infrastructure for liquid prediction markets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {benefits.map((benefit, index) => (
            <div 
              key={benefit.title}
              className="group relative p-8 rounded-[2rem] bg-[#0a0a0a] border border-white/5 transition-all duration-500 hover:border-white/10 hover:bg-[#0f0f0f] shadow-2xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-8 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                <benefit.icon className="w-7 h-7 text-white" />
              </div>
              <div className="text-4xl font-black text-white mb-4 tracking-tighter uppercase">
                {benefit.stat}
              </div>
              <h3 className="text-sm font-black text-white/40 uppercase tracking-widest mb-4">
                {benefit.title}
              </h3>
              <p className="text-sm text-neutral-500 font-medium leading-relaxed group-hover:text-neutral-400 transition-colors">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

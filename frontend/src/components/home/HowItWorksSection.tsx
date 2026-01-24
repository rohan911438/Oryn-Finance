import { PlusCircle, LineChart, Trophy } from 'lucide-react';

const steps = [
  {
    icon: PlusCircle,
    title: 'Create Markets',
    description: 'Anyone can create prediction markets by depositing initial liquidity. Set your question, resolution criteria, and expiration date.',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    icon: LineChart,
    title: 'Trade Predictions',
    description: 'Buy YES or NO tokens based on your predictions. Prices automatically adjust based on market sentiment and trading activity.',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
  {
    icon: Trophy,
    title: 'Earn Rewards',
    description: 'When markets resolve, winners claim their rewards automatically. Correct predictions pay out at $1 per token.',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
  },
];

export function HowItWorksSection() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-20">
          <div className="max-w-2xl">
            <h2 className="text-5xl md:text-6xl font-black mb-6 text-white tracking-tighter uppercase">
              The Protocol <br />
              <span className="text-white/40">Workflow.</span>
            </h2>
            <p className="text-lg text-neutral-400 font-medium">
              Oryn Finance automates prediction market settlement through decentralized oracles and Stellar's smart contracts.
            </p>
          </div>
          <div className="flex items-center gap-4 text-white/20 font-black text-8xl hidden lg:flex select-none">
            01 <div className="w-12 h-[2px] bg-white/10" /> 03
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div key={step.title} className="group">
              <div className="relative p-10 h-full rounded-[2.5rem] bg-[#0a0a0a] border border-white/5 transition-all duration-500 hover:border-white/10 hover:bg-[#0f0f0f] flex flex-col justify-between overflow-hidden">
                {/* Accent Background */}
                <div className={cn(
                  "absolute -bottom-20 -right-20 w-64 h-64 blur-[100px] opacity-10 transition-opacity group-hover:opacity-20",
                  index === 0 ? "bg-primary" : index === 1 ? "bg-blue-500" : "bg-purple-500"
                )} />

                <div>
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center mb-10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-2xl",
                    index === 0 ? "bg-primary/20 text-primary border border-primary/30" : 
                    index === 1 ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : 
                    "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  )}>
                    <step.icon className="w-8 h-8" />
                  </div>
                  
                  <h3 className="text-3xl font-black text-white mb-6 tracking-tight uppercase leading-none">
                    {step.title}
                  </h3>
                  <p className="text-neutral-400 font-medium leading-relaxed mb-8">
                    {step.description}
                  </p>
                </div>

                <div className="pt-8 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Step {index + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:translate-x-2">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

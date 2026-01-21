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
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <span className="text-sm text-primary">Powered by Stellar</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why Build on Stellar?
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            The perfect blockchain for prediction markets. Fast, cheap, and reliable.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => (
            <div 
              key={benefit.title}
              className="glass-card-hover p-6 text-center animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <benefit.icon className="w-6 h-6 text-primary" />
              </div>
              <div className="text-2xl font-bold gradient-text mb-2">{benefit.stat}</div>
              <h3 className="font-semibold mb-2">{benefit.title}</h3>
              <p className="text-sm text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

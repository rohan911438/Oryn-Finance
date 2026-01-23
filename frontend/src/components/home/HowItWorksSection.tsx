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
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Trade on real-world outcomes in three simple steps. No complex derivatives, no middlemen.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connection Lines */}
          <div className="hidden md:block absolute top-1/2 left-1/4 right-1/4 h-px bg-gradient-to-r from-primary via-success to-warning -translate-y-1/2" />

          {steps.map((step, index) => (
            <div key={step.title} className="relative">
              <div className="glass-card p-8 text-center h-full glow-effect">
                {/* Step Number */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </div>

                {/* Icon */}
                <div className={`w-16 h-16 rounded-2xl ${step.bgColor} flex items-center justify-center mx-auto mb-6`}>
                  <step.icon className={`w-8 h-8 ${step.color}`} />
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

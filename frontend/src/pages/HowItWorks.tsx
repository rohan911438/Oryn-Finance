import { Link } from 'react-router-dom';
import { PlusCircle, LineChart, Trophy, ArrowRight, CheckCircle2, Zap, Shield, DollarSign } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';

const steps = [
  {
    number: '01',
    icon: PlusCircle,
    title: 'Market Creation',
    description: 'Anyone can create a prediction market by depositing initial liquidity (minimum 50 USDC). Define your question, set resolution criteria, and choose an expiration date.',
    details: [
      'Write a clear, verifiable question',
      'Specify how the market will be resolved',
      'Deposit liquidity to enable trading',
      'Set your trading fee (0.5% - 5%)',
    ],
    color: 'primary',
  },
  {
    number: '02',
    icon: LineChart,
    title: 'Trading Mechanics',
    description: 'YES and NO tokens are minted at creation. Users trade on outcomes using Stellar\'s built-in DEX. Prices adjust automatically based on supply and demand.',
    details: [
      'Buy YES if you think it will happen',
      'Buy NO if you think it won\'t',
      'Prices range from 1¢ to 99¢',
      'Higher price = higher probability',
    ],
    color: 'success',
  },
  {
    number: '03',
    icon: Trophy,
    title: 'Resolution & Rewards',
    description: 'When the market expires, oracles verify the real-world outcome. Winning tokens pay out $1 each, losing tokens become worthless.',
    details: [
      'Oracles verify the outcome',
      'Winners claim $1 per token',
      'Automatic payout on Stellar',
      'Instant settlement, no delays',
    ],
    color: 'warning',
  },
];

const features = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Trades confirm in under 5 seconds on Stellar',
  },
  {
    icon: DollarSign,
    title: 'Near-Zero Fees',
    description: 'Network fees are less than $0.01 per transaction',
  },
  {
    icon: Shield,
    title: 'Fully Decentralized',
    description: 'No custodians, no intermediaries, trustless execution',
  },
];

export default function HowItWorks() {
  return (
    <Layout>
      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-primary/5 to-transparent" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              How <span className="gradient-text">Oryn Finance</span> Works
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Trade on real-world outcomes in three simple steps. No complex derivatives, no middlemen, just pure prediction markets.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/markets">
                <Button className="btn-primary-gradient">
                  Start Trading
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/create">
                <Button variant="outline">Create a Market</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="space-y-20">
            {steps.map((step, index) => (
              <div 
                key={step.number}
                className={`flex flex-col ${index % 2 === 1 ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 items-center`}
              >
                {/* Content */}
                <div className="flex-1 space-y-6">
                  <div className="flex items-center gap-4">
                    <span className="text-6xl font-bold text-muted-foreground/20">{step.number}</span>
                    <div className={`w-14 h-14 rounded-2xl bg-${step.color}/10 flex items-center justify-center`}>
                      <step.icon className={`w-7 h-7 text-${step.color}`} />
                    </div>
                  </div>
                  <h2 className="text-3xl font-bold">{step.title}</h2>
                  <p className="text-lg text-muted-foreground">{step.description}</p>
                  <ul className="space-y-3">
                    {step.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <CheckCircle2 className={`w-5 h-5 text-${step.color}`} />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Illustration */}
                <div className="flex-1">
                  <div className="glass-card p-8 aspect-square flex items-center justify-center">
                    <div className={`w-32 h-32 rounded-full bg-${step.color}/10 flex items-center justify-center animate-float`}>
                      <step.icon className={`w-16 h-16 text-${step.color}`} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Why Choose Oryn Finance?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div key={feature.title} className="glass-card-hover p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <feature.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Start Trading?</h2>
            <p className="text-muted-foreground mb-8">
              Join thousands of traders making predictions on the future
            </p>
            <Link to="/markets">
              <Button size="lg" className="btn-primary-gradient">
                Explore Markets
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}

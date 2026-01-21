import { Link } from 'react-router-dom';
import { Zap, Shield, Globe, DollarSign, Users, CheckCircle2, ArrowRight } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const stellarBenefits = [
  { icon: Zap, title: 'Sub-Second Finality', description: 'Trades confirm in under 5 seconds' },
  { icon: DollarSign, title: 'Fees Under $0.01', description: 'Near-zero transaction costs' },
  { icon: Shield, title: 'Native USDC', description: 'No wrapping or bridging needed' },
  { icon: Globe, title: 'Global Access', description: 'Trade from anywhere, 24/7' },
];

const team = [
  { name: 'Alex Chen', role: 'CEO & Co-Founder', image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex' },
  { name: 'Sarah Kim', role: 'CTO & Co-Founder', image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah' },
  { name: 'Marcus Johnson', role: 'Head of Product', image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=marcus' },
  { name: 'Elena Rodriguez', role: 'Lead Engineer', image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=elena' },
];

const roadmap = [
  { phase: 'Phase 1', title: 'Beta Launch', status: 'completed', items: ['Core trading functionality', 'Freighter wallet integration', 'Basic market creation'] },
  { phase: 'Phase 2', title: 'Oracle Integration', status: 'current', items: ['Chainlink price feeds', 'API3 data sources', 'Automated resolution'] },
  { phase: 'Phase 3', title: 'Mobile App', status: 'upcoming', items: ['iOS and Android apps', 'Push notifications', 'Biometric authentication'] },
  { phase: 'Phase 4', title: 'DAO Governance', status: 'upcoming', items: ['ORYN token launch', 'Community proposals', 'Decentralized treasury'] },
];

export default function About() {
  return (
    <Layout>
      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-primary/5 to-transparent" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">About Us</Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Building the Future of{' '}
              <span className="gradient-text">Prediction Markets</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Oryn Finance is on a mission to bring transparent, decentralized prediction markets to everyone. 
              We believe in the power of collective intelligence to forecast the future.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Our Mission</h2>
              <p className="text-lg text-muted-foreground mb-6">
                We're building infrastructure for information markets that help the world make better decisions. 
                By aggregating diverse opinions into real-time probability estimates, prediction markets 
                surface collective wisdom more efficiently than any other mechanism.
              </p>
              <p className="text-lg text-muted-foreground mb-6">
                Traditional prediction markets are slow, expensive, and inaccessible to most people. 
                We're changing that by leveraging Stellar's speed and low costs to create markets 
                anyone can participate in, anywhere in the world.
              </p>
              <ul className="space-y-3">
                {['Transparent price discovery', 'Instant global access', 'Fair and open markets', 'Community-driven governance'].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass-card p-8">
              <div className="aspect-video bg-gradient-to-br from-primary/20 to-secondary/20 rounded-lg flex items-center justify-center">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center animate-float">
                  <span className="text-4xl font-bold text-primary-foreground">O</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Stellar */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why We Built on Stellar</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Stellar provides the perfect foundation for prediction markets with its speed, 
              low costs, and native USDC support.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stellarBenefits.map((benefit) => (
              <div key={benefit.title} className="glass-card-hover p-6 text-center">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <benefit.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Meet Our Team</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A passionate group of builders, traders, and blockchain enthusiasts working to 
              democratize prediction markets.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {team.map((member) => (
              <div key={member.name} className="glass-card p-6 text-center">
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-24 h-24 rounded-full mx-auto mb-4 bg-muted"
                />
                <h3 className="font-semibold">{member.name}</h3>
                <p className="text-sm text-muted-foreground">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Roadmap</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our journey to building the most accessible prediction market platform
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {roadmap.map((phase, index) => (
              <div 
                key={phase.phase} 
                className={`glass-card p-6 ${phase.status === 'current' ? 'gradient-border' : ''}`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-medium text-muted-foreground">{phase.phase}</span>
                  {phase.status === 'completed' && (
                    <Badge className="bg-success/20 text-success border-0">Complete</Badge>
                  )}
                  {phase.status === 'current' && (
                    <Badge className="bg-primary/20 text-primary border-0">In Progress</Badge>
                  )}
                </div>
                <h3 className="text-xl font-semibold mb-4">{phase.title}</h3>
                <ul className="space-y-2">
                  {phase.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className={`w-4 h-4 mt-0.5 ${phase.status === 'completed' ? 'text-success' : 'text-muted-foreground/50'}`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Join the Revolution</h2>
            <p className="text-muted-foreground mb-8">
              Be part of the future of prediction markets. Start trading today.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link to="/markets">
                <Button size="lg" className="btn-primary-gradient">
                  Explore Markets
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <a href="https://discord.gg/orynfinance" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline">
                  <Users className="w-5 h-5 mr-2" />
                  Join Discord
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

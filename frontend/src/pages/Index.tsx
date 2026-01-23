import { Layout } from '@/components/layout/Layout';
import { HeroSection } from '@/components/home/HeroSection';
import { FeaturedMarkets } from '@/components/home/FeaturedMarkets';
import { HowItWorksSection } from '@/components/home/HowItWorksSection';
import { StellarBenefits } from '@/components/home/StellarBenefits';

const Index = () => {
  return (
    <Layout>
      <HeroSection />
      <FeaturedMarkets />
      <HowItWorksSection />
      <StellarBenefits />
    </Layout>
  );
};

export default Index;

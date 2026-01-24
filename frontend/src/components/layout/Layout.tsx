import { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { Particles } from '@/components/magicui/particles';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <Particles
        className="absolute inset-0 -z-1"
        quantity={100}
        ease={80}
        color="#ffffff"
        refresh
      />
      <Navbar />
      <main className="flex-1 pt-24 relative z-10">
        {children}
      </main>
      <Footer />
    </div>
  );
}

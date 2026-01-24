import { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import StarsCanvas from '@/components/background/StarsCanvas';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <>
      {/* 3D Stars Background - Behind everything */}
      <StarsCanvas />

      <div className="min-h-screen flex flex-col bg-black/0 relative overflow-hidden">
        {/* Page Content */}
        <Navbar />
        <main className="flex-1 relative z-10 pt-24">
          {children}
        </main>
        <Footer />
      </div>
    </>
  );
}

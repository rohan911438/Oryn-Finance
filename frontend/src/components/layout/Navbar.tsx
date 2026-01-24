import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { WalletSelector } from '@/components/WalletSelector';

const navItems = [
  { name: 'Home', path: '/' },
  { name: 'Markets', path: '/markets' },
  { name: 'Create', path: '/create' },
  { name: 'About', path: '/about' },
  { name: 'Leaderboard', path: '/leaderboard' },
];

export function Navbar() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-4xl rounded-full border border-white/10 bg-black/20 backdrop-blur-xl shadow-lg overflow-hidden transition-all duration-300">
        <div className="flex items-center justify-between px-6 py-3 w-full relative z-10">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#FF8C00] via-[#5F9EA0] to-[#7a57db] bg-clip-text text-transparent">Oryn Finance</h1>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium transition-colors hover:text-primary ${location.pathname === item.path ? 'text-primary' : 'text-neutral-400'
                  }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Wallet Section */}
          <div className="hidden md:flex gap-2 items-center">
            <WalletSelector />
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl animate-fade-in">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-6 border-b border-white/10">
              <span className="text-xl font-bold">Menu</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex flex-col gap-6 p-8 items-center justify-center flex-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-2xl font-bold ${location.pathname === item.path ? 'text-primary' : 'text-neutral-400'
                    }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
              <div className="mt-8">
                <WalletSelector />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

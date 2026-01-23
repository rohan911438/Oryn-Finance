import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wallet, ChevronDown, Menu, X, Loader2 } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const navItems = [
  { name: 'Markets', path: '/markets' },
  { name: 'Leaderboard', path: '/leaderboard' },
  { name: 'Create Market', path: '/create' },
  { name: 'How It Works', path: '/how-it-works' },
];

export function Navbar() {
  const location = useLocation();
  const { isConnected, address, xlmBalance, usdcBalance, connect, disconnect, isConnecting } = useWallet();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const handleConnect = async () => {
    setWalletModalOpen(true);
    await connect();
    setWalletModalOpen(false);
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">O</span>
              </div>
              <span className="text-xl font-bold gradient-text">Oryn Finance</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`nav-link py-2 text-sm font-medium ${
                    location.pathname === item.path ? 'active' : ''
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>

            {/* Wallet Section */}
            <div className="hidden md:flex items-center gap-4">
              {isConnected ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2 bg-muted/50 border-border hover:bg-muted">
                      <Wallet className="w-4 h-4 text-primary" />
                      <span className="text-sm">{address}</span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                    <div className="px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-2">Balances</p>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-sm">XLM</span>
                          <span className="text-sm font-medium">{xlmBalance}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">USDC</span>
                          <span className="text-sm font-medium">{usdcBalance}</span>
                        </div>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/portfolio" className="cursor-pointer">
                        Portfolio
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={disconnect} className="text-destructive cursor-pointer">
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button onClick={handleConnect} className="btn-primary-gradient gap-2">
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </Button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-border animate-slide-up">
            <div className="container mx-auto px-4 py-4 space-y-4">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`block py-2 text-sm font-medium ${
                    location.pathname === item.path ? 'text-primary' : 'text-muted-foreground'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
              <div className="pt-4 border-t border-border">
                {isConnected ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">XLM</span>
                      <span>{xlmBalance}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">USDC</span>
                      <span>{usdcBalance}</span>
                    </div>
                    <Button variant="destructive" className="w-full" onClick={disconnect}>
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleConnect} className="w-full btn-primary-gradient gap-2">
                    <Wallet className="w-4 h-4" />
                    Connect Wallet
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Wallet Connection Modal */}
      <Dialog open={walletModalOpen} onOpenChange={setWalletModalOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Connecting to Freighter</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-6 animate-pulse-glow">
              <Wallet className="w-10 h-10 text-primary-foreground" />
            </div>
            {isConnecting && (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground text-center">
                  Please approve the connection request in your Freighter wallet...
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

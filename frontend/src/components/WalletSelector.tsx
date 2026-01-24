import { Link } from 'react-router-dom';
import { Wallet, ChevronDown } from 'lucide-react';
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
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export function WalletSelector() {
    const { isConnected, address, xlmBalance, usdcBalance, connect, disconnect, isConnecting } = useWallet();
    const [walletModalOpen, setWalletModalOpen] = useState(false);

    const handleConnect = async () => {
        setWalletModalOpen(true);
        await connect();
        setWalletModalOpen(false);
    };

    return (
        <>
            <div className="flex items-center gap-4">
                {isConnected ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2 bg-black/80 border-border/20 text-white hover:bg-black hover:text-white hover:border-border/40 backdrop-blur-md transition-all shadow-[0_0_15px_rgba(122,87,219,0.3)] hover:shadow-[0_0_20px_rgba(122,87,219,0.5)]">
                                <Wallet className="w-4 h-4 text-[#FF8C00]" />
                                <span className="text-sm font-medium bg-gradient-to-r from-[#FF8C00] via-[#5F9EA0] to-[#7a57db] bg-clip-text text-transparent">{address}</span>
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-black/90 border-white/10 text-white backdrop-blur-xl">
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
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem asChild className="focus:bg-white/10 focus:text-white cursor-pointer">
                                <Link to="/portfolio">
                                    Portfolio
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem onClick={disconnect} className="text-red-400 focus:text-red-300 focus:bg-white/10 cursor-pointer">
                                Disconnect
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Button onClick={handleConnect} className="relative group overflow-hidden bg-black text-white hover:bg-black/90 transition-all duration-300 shadow-[0_0_20px_rgba(255,140,0,0.4)] hover:shadow-[0_0_30px_rgba(255,140,0,0.6)] border border-white/10 rounded-full px-6">
                        <span className="absolute inset-0 rounded-full p-[1px] bg-gradient-to-r from-[#FF8C00] via-[#5F9EA0] to-[#7a57db] opacity-70 group-hover:opacity-100 transition-opacity">
                            <div className="w-full h-full bg-black rounded-full" />
                        </span>
                        <span className="relative flex items-center gap-2 font-medium z-10">
                            <Wallet className="w-4 h-4 text-[#FF8C00]" />
                            Connect Wallet
                        </span>
                    </Button>
                )}
            </div>

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

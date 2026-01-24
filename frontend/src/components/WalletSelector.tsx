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
import { Badge } from '@/components/ui/badge';
import { WalletSelectionModal } from './WalletSelectionModal';
import { useState } from 'react';

export function WalletSelector() {
    const { 
        isConnected, 
        address, 
        xlmBalance, 
        usdcBalance, 
        disconnect, 
        connectedWallet,
        network,
        switchNetwork
    } = useWallet();
    const [walletModalOpen, setWalletModalOpen] = useState(false);

    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    };

    const getWalletDisplayName = (walletType: string | null): string => {
        switch (walletType) {
            case 'rabet': return 'Rabet';
            case 'freighter': return 'Freighter';
            case 'albedo': return 'Albedo';
            default: return 'Wallet';
        }
    };

    return (
        <>
            <div className="flex items-center gap-4">
                {isConnected ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2 bg-black/80 border-border/20 text-white hover:bg-black hover:text-white hover:border-border/40 backdrop-blur-md transition-all shadow-[0_0_15px_rgba(122,87,219,0.3)] hover:shadow-[0_0_20px_rgba(122,87,219,0.5)]">
                                <Wallet className="w-4 h-4 text-[#FF8C00]" />
                                <div className="flex flex-col items-start">
                                    <span className="text-xs text-muted-foreground">{getWalletDisplayName(connectedWallet)}</span>
                                    <span className="text-sm font-medium bg-gradient-to-r from-[#FF8C00] via-[#5F9EA0] to-[#7a57db] bg-clip-text text-transparent">
                                        {formatAddress(address!)}
                                    </span>
                                </div>
                                <Badge variant={network === 'mainnet' ? 'default' : 'secondary'} className="text-xs">
                                    {network}
                                </Badge>
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72 bg-black/90 border-white/10 text-white backdrop-blur-xl">
                            <div className="px-3 py-3">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs text-muted-foreground">Connected via {getWalletDisplayName(connectedWallet)}</p>
                                    <Badge variant={network === 'mainnet' ? 'default' : 'secondary'} className="text-xs">
                                        {network}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mb-3 font-mono break-all">{address}</p>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center p-2 rounded bg-white/5">
                                        <span className="text-sm">XLM</span>
                                        <span className="text-sm font-medium text-[#FF8C00]">{xlmBalance}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-2 rounded bg-white/5">
                                        <span className="text-sm">USDC</span>
                                        <span className="text-sm font-medium text-[#5F9EA0]">{usdcBalance}</span>
                                    </div>
                                </div>
                            </div>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem asChild className="focus:bg-white/10 focus:text-white cursor-pointer">
                                <Link to="/portfolio">
                                    <Wallet className="w-4 h-4 mr-2" />
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
                    <Button 
                        onClick={() => setWalletModalOpen(true)} 
                        className="relative group overflow-hidden bg-black text-white hover:bg-black/90 transition-all duration-300 shadow-[0_0_20px_rgba(255,140,0,0.4)] hover:shadow-[0_0_30px_rgba(255,140,0,0.6)] border border-white/10 rounded-full px-6"
                    >
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

            <WalletSelectionModal 
                open={walletModalOpen} 
                onOpenChange={setWalletModalOpen}
            />
        </>
    );
}

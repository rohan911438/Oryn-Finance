import React from "react";
import { cn } from "@/lib/utils";
import {
    Rocket,
    ShieldCheck,
    Zap,
    Globe,
    Coins,
    Lock,
} from "lucide-react";
import { Globe as Globe3D } from "./globe";

// 1. Lightning Fast Settlement Graphic
const LightningGraphic = () => (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 border border-white/10 p-4 items-center justify-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-grid-white/[0.05]" />
        <div className="relative z-10 p-4 bg-black/40 border border-yellow-500/20 rounded-lg backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-yellow-500 font-mono text-xs">STATUS: SETTLED</span>
            </div>
            <div className="mt-2 h-1 w-48 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 w-full animate-progress" style={{ animationDuration: '2s' }} />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-neutral-400 font-mono">
                <span>0s</span>
                <span>3.5s</span>
            </div>
        </div>
        <Zap className="absolute -bottom-4 -right-4 w-24 h-24 text-yellow-500/10 rotate-12" />
    </div>
);

// 2. Ultra-Low Fees Graphic
const LowFeesGraphic = () => (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 border border-white/10 p-4 items-center justify-center relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4">
            <div className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full border border-green-500/30">
                -99.9% Cost
            </div>
        </div>
        <div className="text-center">
            <span className="text-4xl font-bold text-white tracking-tighter">
                $0.000<span className="text-neutral-600">01</span>
            </span>
            <p className="text-xs text-neutral-400 mt-1 uppercase tracking-widest">Fee per trade</p>
        </div>
    </div>
);

// 3. Global Access (Globe)
const GlobalAccessGraphic = () => (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-black border border-white/10 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
            <Globe3D className="w-full h-full scale-[2]" />
        </div>
    </div>
);

// 4. Secure & Transparent
const SecureCodeGraphic = () => (
    <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-900 to-neutral-800 border border-white/10 p-6 relative overflow-hidden font-mono text-xs">
        <div className="absolute top-2 right-2 flex gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500/20" />
            <div className="w-2 h-2 rounded-full bg-yellow-500/20" />
            <div className="w-2 h-2 rounded-full bg-green-500/20" />
        </div>
        <div className="space-y-1 text-neutral-400">
            <p><span className="text-pink-500">fn</span> <span className="text-blue-400">verifyOutcome</span>(market_id) {"{"}</p>
            <p className="pl-4"><span className="text-purple-400">let</span> proof = <span className="text-yellow-400">Oracle</span>::get_data();</p>
            <p className="pl-4"><span className="text-purple-400">if</span> proof.is_valid() {"{"}</p>
            <p className="pl-8 text-green-400">// Smart Contract Resolution</p>
            <p className="pl-8">Market::resolve(market_id);</p>
            <p className="pl-4">{"}"}</p>
            <p>{"}"}</p>
        </div>
        <Lock className="absolute bottom-4 right-4 w-12 h-12 text-blue-500/10" />
    </div>
);

export const BentoGridItem = ({
    className,
    title,
    description,
    header,
    icon,
}: {
    className?: string;
    title?: string | React.ReactNode;
    description?: string | React.ReactNode;
    header?: React.ReactNode;
    icon?: React.ReactNode;
}) => {
    return (
        <div
            className={cn(
                "row-span-1 rounded-xl group/bento hover:shadow-xl transition duration-200 shadow-input shadow-none p-4 bg-gradient-to-br from-[#0e0c15] to-[#0e0c15] border border-white/10 justify-between flex flex-col space-y-4",
                className
            )}
        >
            {header}
            <div className="group-hover/bento:translate-x-2 transition duration-200">
                {icon}
                <div className="font-sans font-bold text-neutral-200 mb-2 mt-2">
                    {title}
                </div>
                <div className="font-sans font-normal text-neutral-400 text-xs">
                    {description}
                </div>
            </div>
        </div>
    );
};

export default function BentoGrid({
    className,
}: {
    className?: string;
}) {
    const items = [
        {
            title: "Lightning Fast Settlement",
            description: "Trades settle in 3-5 seconds on the Stellar network.",
            header: <LightningGraphic />,
            icon: <Zap className="h-4 w-4 text-yellow-500" />,
            className: "md:col-span-2",
        },
        {
            title: "Ultra-Low Fees",
            description: "Transactions cost a fraction of a cent (0.00001 XLM).",
            header: <LowFeesGraphic />,
            icon: <Coins className="h-4 w-4 text-green-500" />,
            className: "md:col-span-1",
        },
        {
            title: "Global Access",
            description: "Trade from anywhere in the world with a non-custodial wallet.",
            header: <GlobalAccessGraphic />,
            icon: <Globe className="h-4 w-4 text-blue-500" />,
            className: "md:col-span-1",
        },
        {
            title: "Secure & Transparent",
            description: "Powered by Soroban smart contracts for immutable logic.",
            header: <SecureCodeGraphic />,
            icon: <ShieldCheck className="h-4 w-4 text-purple-500" />,
            className: "md:col-span-2",
        },
    ];

    return (
        <div
            className={cn(
                "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto ",
                className
            )}
        >
            {items.map((item, i) => (
                <BentoGridItem
                    key={i}
                    title={item.title}
                    description={item.description}
                    header={item.header}
                    icon={item.icon}
                    className={item.className}
                />
            ))}
        </div>
    );
}

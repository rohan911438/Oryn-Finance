import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const SlidingText = () => {
    const container = useRef(null);
    const { scrollYProgress } = useScroll({
        target: container,
        offset: ["start end", "end start"]
    });

    const x1 = useTransform(scrollYProgress, [0, 1], [0, -500]);
    const x2 = useTransform(scrollYProgress, [0, 1], [-500, 0]);

    return (
        <div ref={container} className="relative overflow-hidden py-24 pointer-events-none select-none">
            <motion.div style={{ x: x1 }} className="flex whitespace-nowrap">
                {[...Array(4)].map((_, i) => (
                    <p key={i} className="text-[9vw] font-black uppercase tracking-tighter mr-20 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-orange-500 opacity-50">
                        ORYN FINANCE • PREDICTION • MARKETS •
                    </p>
                ))}
            </motion.div>
            <motion.div style={{ x: x2 }} className="flex whitespace-nowrap mt-[-6vw]">
                {[...Array(4)].map((_, i) => (
                    <p key={i} className="text-[9vw] font-black uppercase tracking-tighter mr-20 bg-clip-text text-transparent bg-gradient-to-r from-orange-500 via-purple-500 to-blue-500">
                        TRADING • LIQUIDITY • STELLAR •
                    </p>
                ))}
            </motion.div>
            <div className="absolute inset-0 bg-gradient-to-b from-[#030412] via-transparent to-[#030412] z-10" />
        </div>
    );
};

export default SlidingText;

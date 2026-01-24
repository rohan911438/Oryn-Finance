import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedShinyText } from "./magicui/animated-shiny-text";

const HeroText = () => {
  const words = ["Finance", "Investment", "Wealth", "Growth"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="space-y-4">
        {/* Animated Shiny Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className={cn(
            "group inline-flex rounded-full border border-white/10 bg-white/5 text-base text-white transition-all ease-in hover:cursor-pointer hover:bg-white/10"
          )}
        >
          <AnimatedShinyText className="inline-flex items-center justify-center px-4 py-1 transition ease-out hover:text-neutral-300 hover:duration-300">
            <span>✨ Introducing Oryn Finance</span>
            <ArrowRight className="ml-1 w-3 h-3 transition-transform duration-300 ease-in-out group-hover:translate-x-0.5" />
          </AnimatedShinyText>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight"
        >
          Oryn Finance – Prediction <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-lavender to-purple-400">
            Markets on Stellar
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-lg md:text-xl text-neutral-400 max-w-2xl leading-relaxed"
        >
          Fast, low-fee, transparent prediction markets
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="flex flex-col sm:flex-row gap-4 pt-4"
      >
        <a href="/markets">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-4 text-white font-semibold rounded-lg bg-gradient-to-r from-lavender to-purple-600 hover:from-purple-600 hover:to-lavender transition-all duration-300 shadow-lg shadow-purple-500/50 w-full sm:w-auto"
          >
            Launch App
          </motion.button>
        </a>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-4 text-white font-semibold rounded-lg border-2 border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-300"
        >
          Connect Freighter
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

export default HeroText;


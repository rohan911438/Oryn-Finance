import { motion } from "framer-motion";
import { FlipWords } from "./FlipWords";

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


import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import React from 'react';

const ParrallaxBackground = () => {
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    damping: 50,
    stiffness: 100,
  });

  const skyY = useTransform(smoothProgress, [0, 1], ["0%", "15%"]);
  const mountain3Y = useTransform(smoothProgress, [0, 1], ["0%", "30%"]);
  const planetsX = useTransform(smoothProgress, [0, 1], ["0%", "-10%"]);
  const mountain2Y = useTransform(smoothProgress, [0, 1], ["0%", "20%"]);
  const mountain1Y = useTransform(smoothProgress, [0, 1], ["0%", "0%"]);

  return (
    <div className="absolute inset-0 overflow-hidden w-full h-full">
      <div className="relative w-full h-full">
        {/* Background Sky */}
        <motion.div
          className="absolute inset-0 w-full h-full"
          style={{ y: skyY }}
        >
          <img
            src="/assets/sky.jpg"
            alt="Sky"
            className="w-full h-full object-cover object-center"
          />
        </motion.div>

        {/* Planet Layer */}
        <motion.div
          className="absolute inset-0 w-full h-full"
          style={{ x: planetsX }}
        >
          <img
            src="/assets/planets.png"
            alt="Planets"
            className="w-full h-full object-cover object-center opacity-80"
          />
        </motion.div>

        {/* Mountain Layers */}
        <motion.div className="absolute inset-0 w-full h-full" style={{ y: mountain3Y }}>
          <img src="/assets/mountain-3.png" className="w-full h-full object-cover object-bottom" alt="mt3" />
        </motion.div>

        <motion.div className="absolute inset-0 w-full h-full" style={{ y: mountain2Y }}>
          <img src="/assets/mountain-2.png" className="w-full h-full object-cover object-bottom" alt="mt2" />
        </motion.div>

        <motion.div className="absolute inset-0 w-full h-full" style={{ y: mountain1Y }}>
          <img src="/assets/mountain-1.png" className="w-full h-full object-cover object-bottom" alt="mt1" />
        </motion.div>

        {/* Atmosphere Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#030412] via-transparent to-transparent opacity-80" />
      </div>
    </div>
  );
};

export default ParrallaxBackground;

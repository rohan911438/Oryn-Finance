import { motion } from "framer-motion";

const Card = ({ style, text, image, containerRef }) => {
  return image && !text ? (
    <motion.div
      className="absolute w-14 h-14 cursor-grab pointer-events-auto flex items-center justify-center rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 shadow-lg p-2"
      style={style}
      whileHover={{ scale: 1.15, backgroundColor: "rgba(255, 255, 255, 0.1)" }}
      drag
      dragConstraints={containerRef}
      dragElastic={0.5}
    >
      <img
        src={image}
        alt="tech logo"
        className="w-full h-full object-contain"
      />
    </motion.div>
  ) : (
    <motion.div
      className="absolute px-5 py-2.5 text-sm font-bold text-center rounded-2xl bg-[#1e1e2e]/80 border border-white/10 backdrop-blur-md text-white shadow-xl cursor-grab pointer-events-auto select-none"
      style={style}
      whileHover={{ scale: 1.1, backgroundColor: "#2e2e4e" }}
      drag
      dragConstraints={containerRef}
      dragElastic={0.5}
    >
      {text}
    </motion.div>
  );
};

export default Card;

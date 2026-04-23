import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

function Navigation() {
  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Markets", href: "/markets" },
    { name: "Create", href: "/create" },
    { name: "Portfolio", href: "/portfolio" },
    { name: "Leaderboard", href: "/leaderboard" },
    { name: "Analytics", href: "/analytics" },
  ];

  return (
    <ul className="flex items-center gap-10 md:gap-14">
      {navLinks.map((link) => (
        <li key={link.name}>
          <a
            className="text-sm font-medium text-neutral-400 hover:text-white transition-all transform hover:scale-110"
            href={link.href}
          >
            {link.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 inset-x-0 z-50 w-full p-6 md:p-10 pointer-events-none">
      <div className="max-w-[1920px] mx-auto flex items-center justify-between pointer-events-auto">
        <a
          href="/"
          className="text-3xl font-bold tracking-tight text-white hover:text-blue-400 transition-colors"
        >
          Oryn
        </a>

        {/* Desktop Nav */}
        <div className="hidden md:block">
          <Navigation />
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden text-white focus:outline-none"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Nav Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="absolute top-0 right-0 h-screen w-full bg-black/95 backdrop-blur-2xl p-12 md:hidden pointer-events-auto"
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-10 right-10 text-white"
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <ul className="flex flex-col items-center justify-center h-full gap-12">
              <li><a href="/" onClick={() => setIsOpen(false)} className="text-4xl font-black text-white uppercase">Home</a></li>
              <li><a href="/markets" onClick={() => setIsOpen(false)} className="text-4xl font-black text-white uppercase">Markets</a></li>
              <li><a href="/create" onClick={() => setIsOpen(false)} className="text-4xl font-black text-white uppercase">Create</a></li>
              <li><a href="/portfolio" onClick={() => setIsOpen(false)} className="text-4xl font-black text-white uppercase">Portfolio</a></li>
              <li><a href="/leaderboard" onClick={() => setIsOpen(false)} className="text-4xl font-black text-white uppercase">Leaderboard</a></li>
              <li><a href="/analytics" onClick={() => setIsOpen(false)} className="text-4xl font-black text-white uppercase">Analytics</a></li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;

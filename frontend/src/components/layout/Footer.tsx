import { Link } from 'react-router-dom';
import { Twitter, Github, FileText, MessageCircle } from 'lucide-react';

const socialLinks = [
  { name: 'Twitter', icon: Twitter, url: 'https://twitter.com/orynfinance' },
  { name: 'Discord', icon: MessageCircle, url: 'https://discord.gg/orynfinance' },
  { name: 'GitHub', icon: Github, url: 'https://github.com/orynfinance' },
  { name: 'Docs', icon: FileText, url: 'https://docs.orynfinance.com' },
];

export function Footer() {
  return (
    <footer className="relative z-10 w-full py-16 px-4 md:px-12 mt-auto bg-black">
      <div className="container mx-auto">
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/5 to-transparent mb-16" />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-16">
          <div>
            <Link to="/" className="flex items-center gap-3 mb-8 group">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-2xl transition-transform group-hover:scale-105">
                <span className="text-black font-black text-xl">O</span>
              </div>
              <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">Oryn Finance</h1>
            </Link>
            <p className="text-xl text-neutral-500 font-medium max-w-md leading-relaxed mb-8">
              Building the next generation of decentralised prediction markets. Fast, secure, and accessible to everyone, anywhere.
            </p>
            <div className="flex items-center gap-6">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-600 hover:text-white transition-all duration-300 transform hover:scale-110"
                >
                  <social.icon className="w-6 h-6" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12">
            <div className="space-y-6">
              <h4 className="text-xs font-black text-white uppercase tracking-[0.2em]">Protocol</h4>
              <nav className="flex flex-col gap-4">
                <Link to="/markets" className="text-neutral-500 hover:text-white transition-colors font-medium">Markets</Link>
                <Link to="/create" className="text-neutral-500 hover:text-white transition-colors font-medium">Create</Link>
                <Link to="/leaderboard" className="text-neutral-500 hover:text-white transition-colors font-medium">Leaderboard</Link>
              </nav>
            </div>
            <div className="space-y-6">
              <h4 className="text-xs font-black text-white uppercase tracking-[0.2em]">Resources</h4>
              <nav className="flex flex-col gap-4">
                <Link to="/about" className="text-neutral-500 hover:text-white transition-colors font-medium">About</Link>
                <Link to="/faq" className="text-neutral-500 hover:text-white transition-colors font-medium">Workflow</Link>
                <Link to="/terms" className="text-neutral-500 hover:text-white transition-colors font-medium">Privacy</Link>
              </nav>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 gap-6 text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
          <p>© 2025 Oryn Finance. Built on Stellar.</p>
          <div className="flex items-center gap-8">
            <span className="hidden md:inline">Secure & Transparent</span>
            <div className="w-1 h-1 rounded-full bg-white/10" />
            <span className="hidden md:inline">Sub-second Finality</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

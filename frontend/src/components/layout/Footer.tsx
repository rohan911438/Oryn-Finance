import { Link } from 'react-router-dom';
import { Twitter, MessageCircle, Github, FileText, ExternalLink } from 'lucide-react';

const footerLinks = {
  product: [
    { name: 'Markets', path: '/markets' },
    { name: 'Leaderboard', path: '/leaderboard' },
    { name: 'Create Market', path: '/create' },
    { name: 'How It Works', path: '/how-it-works' },
  ],
  resources: [
    { name: 'Documentation', path: '/docs', external: true },
    { name: 'API', path: '/api', external: true },
    { name: 'FAQ', path: '/faq' },
    { name: 'Blog', path: '/blog', external: true },
  ],
  company: [
    { name: 'About', path: '/about' },
    { name: 'Careers', path: '/careers', external: true },
    { name: 'Press', path: '/press', external: true },
    { name: 'Contact', path: '/contact' },
  ],
};

const socialLinks = [
  { name: 'Twitter', icon: Twitter, url: 'https://twitter.com/orynfinance' },
  { name: 'Discord', icon: MessageCircle, url: 'https://discord.gg/orynfinance' },
  { name: 'GitHub', icon: Github, url: 'https://github.com/orynfinance' },
  { name: 'Docs', icon: FileText, url: 'https://docs.orynfinance.com' },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">O</span>
              </div>
              <span className="text-xl font-bold gradient-text">Oryn Finance</span>
            </Link>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              Decentralized prediction markets on Stellar. Trade on real-world events with lightning-fast settlements and near-zero fees.
            </p>
            <div className="flex gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted/80 transition-colors"
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2">
              {footerLinks.product.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2">
              {footerLinks.resources.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    {link.name}
                    {link.external && <ExternalLink className="w-3 h-3" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    {link.name}
                    {link.external && <ExternalLink className="w-3 h-3" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-muted-foreground text-center md:text-left">
              © 2025 Oryn Finance. All rights reserved. Built on Stellar.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
              <Link to="/terms" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link to="/risk" className="hover:text-foreground transition-colors">
                Risk Disclosure
              </Link>
            </div>
          </div>
          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground text-center">
              <strong>Disclaimer:</strong> Prediction markets involve financial risk. All markets on Oryn Finance are for entertainment and informational purposes only. Users are responsible for understanding and complying with their local laws. Please trade responsibly and never risk more than you can afford to lose.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';

export function DemoMarketButton() {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Link to="/market/1">
        <Button className="btn-primary-gradient shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
          <TrendingUp className="w-4 h-4 mr-2" />
          Demo Market
        </Button>
      </Link>
    </div>
  );
}
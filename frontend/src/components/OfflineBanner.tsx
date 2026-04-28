import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-destructive/90 backdrop-blur-sm px-4 py-2 text-white text-sm font-medium shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>You're offline — showing cached data. Trading is disabled until connection is restored.</span>
    </div>
  );
}

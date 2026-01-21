import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  className?: string;
  variant?: 'market' | 'stat' | 'leaderboard';
}

export function SkeletonCard({ className, variant = 'market' }: SkeletonCardProps) {
  if (variant === 'stat') {
    return (
      <div className={cn('stat-card', className)}>
        <div className="skeleton-shimmer h-8 w-24 mx-auto mb-2" />
        <div className="skeleton-shimmer h-4 w-16 mx-auto" />
      </div>
    );
  }

  if (variant === 'leaderboard') {
    return (
      <div className={cn('glass-card p-4 flex items-center gap-4', className)}>
        <div className="skeleton-shimmer h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton-shimmer h-4 w-32" />
          <div className="skeleton-shimmer h-3 w-24" />
        </div>
        <div className="skeleton-shimmer h-6 w-20" />
      </div>
    );
  }

  return (
    <div className={cn('market-card space-y-4', className)}>
      <div className="skeleton-shimmer h-5 w-full" />
      <div className="skeleton-shimmer h-4 w-3/4" />
      <div className="flex justify-between">
        <div className="skeleton-shimmer h-8 w-20" />
        <div className="skeleton-shimmer h-8 w-20" />
      </div>
      <div className="flex justify-between">
        <div className="skeleton-shimmer h-4 w-24" />
        <div className="skeleton-shimmer h-4 w-16" />
      </div>
    </div>
  );
}

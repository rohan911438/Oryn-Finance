import { useState, useEffect, useMemo } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  expiryDate: string;
  className?: string;
  showLabels?: boolean;
}

export function CountdownTimer({ expiryDate, className, showLabels = false }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalSeconds: 0
  });

  useEffect(() => {
    const targetDate = new Date(expiryDate).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const difference = targetDate - now;

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 });
        return;
      }

      const totalSeconds = Math.floor(difference / 1000);
      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, totalSeconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiryDate]);

  const isExpiringSoon = timeLeft.totalSeconds > 0 && timeLeft.totalSeconds < 86400; // Less than 24 hours

  if (timeLeft.totalSeconds <= 0) {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-muted-foreground text-[10px] font-medium", className)}>
        Expired
      </div>
    );
  }

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] font-medium",
      isExpiringSoon ? "bg-warning/10 text-warning border border-warning/20 animate-pulse" : "bg-primary/10 text-primary border border-primary/20",
      className
    )}>
      <Clock className="w-3 h-3" />
      <span>
        {timeLeft.days > 0 && `${timeLeft.days}d `}
        {String(timeLeft.hours).padStart(2, '0')}:
        {String(timeLeft.minutes).padStart(2, '0')}:
        {String(timeLeft.seconds).padStart(2, '0')}
      </span>
      {isExpiringSoon && showLabels && (
        <AlertTriangle className="w-3 h-3 ml-1" />
      )}
    </div>
  );
}

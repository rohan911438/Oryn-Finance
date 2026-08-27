import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCheck, Settings, Sparkles, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWallet } from '@/contexts/WalletContext';
import { notificationService, NotificationAlert } from '@/services/notificationService';

const iconByCategory = {
  transaction: WalletCards,
  treasury: WalletCards,
  risk: AlertTriangle,
  yield: Sparkles,
  portfolio: WalletCards,
  market: Bell,
  governance: Bell,
  system: Bell,
};

export function NotificationBell() {
  const { isConnected, publicKey } = useWallet();
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const recentAlerts = useMemo(() => alerts.slice(0, 5), [alerts]);

  const refresh = async () => {
    if (!isConnected || !publicKey) {
      setAlerts([]);
      setUnreadCount(0);
      return;
    }

    const [history, count] = await Promise.all([
      notificationService.getNotificationHistory(publicKey, { limit: 5 }),
      notificationService.getUnreadAlertCount(publicKey),
    ]);
    setAlerts(history);
    setUnreadCount(count);
  };

  useEffect(() => {
    refresh();
    if (!isConnected || !publicKey) return undefined;
    const interval = window.setInterval(refresh, 30000);
    return () => window.clearInterval(interval);
  }, [isConnected, publicKey]);

  const markAllRead = async () => {
    if (!publicKey) return;
    await notificationService.markAllAlertsAsRead(publicKey);
    await refresh();
  };

  if (!isConnected) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full text-neutral-300 hover:text-white">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 border-white/10 bg-black/90 text-white backdrop-blur-xl">
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel className="px-0">Notifications</DropdownMenuLabel>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-300" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheck className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-300" asChild>
              <Link to="/notifications/preferences" onClick={() => setOpen(false)}>
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <DropdownMenuSeparator className="bg-white/10" />
        <ScrollArea className="h-80">
          {recentAlerts.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-neutral-400">No notifications yet</div>
          ) : (
            recentAlerts.map((alert) => {
              const Icon = iconByCategory[alert.category as keyof typeof iconByCategory] || Bell;
              return (
                <DropdownMenuItem key={alert.id} className="items-start gap-3 p-3 focus:bg-white/10" asChild>
                  <Link to="/notifications" onClick={() => setOpen(false)}>
                    <Icon className={`mt-0.5 h-4 w-4 ${alert.severity === 'critical' ? 'text-red-400' : alert.severity === 'warning' ? 'text-orange-400' : 'text-teal-300'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{alert.title}</span>
                      <span className="line-clamp-2 text-xs text-neutral-400">{alert.message}</span>
                    </span>
                    {!alert.read && <span className="mt-1 h-2 w-2 rounded-full bg-orange-500" />}
                  </Link>
                </DropdownMenuItem>
              );
            })
          )}
        </ScrollArea>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem asChild className="justify-center focus:bg-white/10">
          <Link to="/notifications" onClick={() => setOpen(false)}>View notification center</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

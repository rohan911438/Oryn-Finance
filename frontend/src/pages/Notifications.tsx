import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, Loader2, Trash2 } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MagicCard } from '@/components/magicui/magic-card';
import { useWallet } from '@/contexts/WalletContext';
import { notificationService, NotificationAlert } from '@/services/notificationService';
import { toast } from 'sonner';

const categoryLabels: Record<string, string> = {
  transaction: 'Transaction',
  treasury: 'Treasury',
  risk: 'Risk',
  yield: 'Yield',
  portfolio: 'Portfolio',
  market: 'Market',
  governance: 'Governance',
  system: 'System',
};

export default function Notifications() {
  const { publicKey, isConnected } = useWallet();
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    if (!publicKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [history, count] = await Promise.all([
      notificationService.getNotificationHistory(publicKey, { limit: 100 }),
      notificationService.getUnreadAlertCount(publicKey),
    ]);
    setAlerts(history);
    setUnreadCount(count);
    setLoading(false);
  };

  useEffect(() => {
    loadNotifications();
  }, [publicKey]);

  const markAllRead = async () => {
    if (!publicKey) return;
    await notificationService.markAllAlertsAsRead(publicKey);
    toast.success('All notifications marked as read');
    await loadNotifications();
  };

  const clearAll = async () => {
    if (!publicKey) return;
    await notificationService.clearAllAlerts(publicKey);
    toast.success('Notification history cleared');
    await loadNotifications();
  };

  if (!isConnected) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <h1 className="text-3xl font-bold">Notification Center</h1>
          <p className="mt-3 text-muted-foreground">Connect your wallet to view notification history.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Notification Center</h1>
              <p className="text-muted-foreground">Protocol alerts, trade updates, and yield opportunities in one place.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark read
            </Button>
            <Button variant="outline" onClick={clearAll} disabled={alerts.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>

        <MagicCard className="glass-card p-6" gradientColor="#262626">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <Bell className="mb-4 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No notifications yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Important protocol and account events will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex gap-4 py-4">
                  <div className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full ${alert.severity === 'critical' ? 'bg-red-500/15 text-red-400' : alert.severity === 'warning' ? 'bg-orange-500/15 text-orange-400' : 'bg-teal-500/15 text-teal-300'}`}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{alert.title}</h2>
                      <Badge variant={alert.read ? 'outline' : 'default'}>{alert.read ? 'Read' : 'Unread'}</Badge>
                      <Badge variant="secondary">{categoryLabels[alert.category] || alert.category}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{new Date(alert.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </MagicCard>
      </div>
    </Layout>
  );
}

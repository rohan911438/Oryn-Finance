import { useEffect, useState } from 'react';
import {
  Bell,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  RotateCcw,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { MagicCard } from '@/components/magicui/magic-card';
import { useWallet } from '@/contexts/WalletContext';
import { notificationService } from '@/services/notificationService';
import { toast } from 'sonner';

interface NotificationPreferences {
  portfolioMilestones: boolean;
  transactionStatus: boolean;
  priceAlerts: boolean;
  liquidationWarnings: boolean;
  governanceUpdates: boolean;
  lowBalanceAlerts: boolean;
  marketExpired: boolean;
  dailyDigest: boolean;
}

interface PreferenceCategory {
  id: keyof NotificationPreferences;
  label: string;
  description: string;
  category: 'portfolio' | 'transaction' | 'market' | 'governance';
}

const PREFERENCE_CATEGORIES: PreferenceCategory[] = [
  {
    id: 'portfolioMilestones',
    label: 'Portfolio Milestones',
    description: 'Alerts when reaching profit targets or loss thresholds',
    category: 'portfolio',
  },
  {
    id: 'transactionStatus',
    label: 'Transaction Status',
    description: 'Notifications for transaction confirmations and failures',
    category: 'transaction',
  },
  {
    id: 'priceAlerts',
    label: 'Price Alerts',
    description: 'Alerts when market prices reach specified levels',
    category: 'market',
  },
  {
    id: 'liquidationWarnings',
    label: 'Liquidation Warnings',
    description: 'Critical alerts for positions at risk of liquidation',
    category: 'portfolio',
  },
  {
    id: 'governanceUpdates',
    label: 'Governance Updates',
    description: 'Notifications for voting proposals and governance events',
    category: 'governance',
  },
  {
    id: 'lowBalanceAlerts',
    label: 'Low Balance Alerts',
    description: 'Warnings when account balance falls below threshold',
    category: 'portfolio',
  },
  {
    id: 'marketExpired',
    label: 'Market Expiration',
    description: 'Notifications when prediction markets expire',
    category: 'market',
  },
  {
    id: 'dailyDigest',
    label: 'Daily Digest',
    description: 'Daily summary of portfolio activity and market updates',
    category: 'portfolio',
  },
];

export default function NotificationPreferences() {
  const { publicKey, isConnected } = useWallet();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [originalPreferences, setOriginalPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = async () => {
    if (!publicKey) {
      setError('Please connect your wallet');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const prefs = await notificationService.getPreferences(publicKey);
      setPreferences(prefs);
      setOriginalPreferences(prefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, [publicKey, isConnected]);

  const handleToggle = (key: keyof NotificationPreferences) => {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      [key]: !preferences[key],
    });
  };

  const handleSave = async () => {
    if (!publicKey || !preferences) return;

    try {
      setSaving(true);
      await notificationService.savePreferences(publicKey, preferences);
      setOriginalPreferences(preferences);
      toast.success('Notification preferences saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalPreferences) {
      setPreferences(originalPreferences);
      toast.info('Preferences reset to saved values');
    }
  };

  const hasChanges =
    preferences && originalPreferences
      ? JSON.stringify(preferences) !== JSON.stringify(originalPreferences)
      : false;

  if (!isConnected) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">Notification Preferences</h1>
            <p className="text-muted-foreground">
              Connect your wallet to manage notification preferences
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center justify-center min-h-[600px]">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading preferences...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">Notification Preferences</h1>
            <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-destructive text-sm">{error}</p>
            </div>
            <Button onClick={fetchPreferences} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!preferences) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">Notification Preferences</h1>
            <p className="text-muted-foreground">No preferences available</p>
          </div>
        </div>
      </Layout>
    );
  }

  const portfolioPrefs = PREFERENCE_CATEGORIES.filter((cat) => cat.category === 'portfolio');
  const transactionPrefs = PREFERENCE_CATEGORIES.filter((cat) => cat.category === 'transaction');
  const marketPrefs = PREFERENCE_CATEGORIES.filter((cat) => cat.category === 'market');
  const governancePrefs = PREFERENCE_CATEGORIES.filter((cat) => cat.category === 'governance');

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <Bell className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Notification Preferences</h1>
            <p className="text-muted-foreground">
              Customize how you receive alerts and updates
            </p>
          </div>
        </div>

        <PreferenceSection
          title="Portfolio Events"
          description="Manage alerts about your portfolio activity"
          preferences={portfolioPrefs}
          currentPrefs={preferences}
          onToggle={handleToggle}
        />

        <PreferenceSection
          title="Transaction Alerts"
          description="Get notified about transaction status changes"
          preferences={transactionPrefs}
          currentPrefs={preferences}
          onToggle={handleToggle}
        />

        <PreferenceSection
          title="Market Events"
          description="Receive updates about market activity and expiration"
          preferences={marketPrefs}
          currentPrefs={preferences}
          onToggle={handleToggle}
        />

        <PreferenceSection
          title="Governance"
          description="Stay informed about governance proposals and voting"
          preferences={governancePrefs}
          currentPrefs={preferences}
          onToggle={handleToggle}
        />

        <div className="mt-8 flex gap-4 justify-end">
          <Button
            onClick={handleReset}
            variant="outline"
            disabled={!hasChanges || saving}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>

        <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">About Your Preferences</p>
              <p>
                Your notification settings are saved securely. You can change them anytime.
                Some critical alerts (like liquidation warnings) cannot be disabled for your
                protection.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

interface PreferenceSectionProps {
  title: string;
  description: string;
  preferences: PreferenceCategory[];
  currentPrefs: NotificationPreferences;
  onToggle: (key: keyof NotificationPreferences) => void;
}

function PreferenceSection({
  title,
  description,
  preferences,
  currentPrefs,
  onToggle,
}: PreferenceSectionProps) {
  return (
    <MagicCard className="glass-card p-6 mb-6" gradientColor="#262626">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      <div className="space-y-3">
        {preferences.map((pref) => (
          <PreferenceToggle
            key={pref.id}
            preference={pref}
            enabled={currentPrefs[pref.id]}
            onToggle={onToggle}
          />
        ))}
      </div>
    </MagicCard>
  );
}

interface PreferenceToggleProps {
  preference: PreferenceCategory;
  enabled: boolean;
  onToggle: (key: keyof NotificationPreferences) => void;
}

function PreferenceToggle({ preference, enabled, onToggle }: PreferenceToggleProps) {
  return (
    <button
      onClick={() => onToggle(preference.id)}
      className="w-full flex items-start gap-4 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{preference.label}</p>
        <p className="text-xs text-muted-foreground mt-1">{preference.description}</p>
      </div>
      <div className="flex-shrink-0 mt-1">
        {enabled ? (
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full border-2 border-muted-foreground" />
        )}
      </div>
    </button>
  );
}

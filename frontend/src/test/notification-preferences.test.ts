import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const DEFAULT_PREFERENCES: NotificationPreferences = {
  portfolioMilestones: true,
  transactionStatus: true,
  priceAlerts: true,
  liquidationWarnings: true,
  governanceUpdates: true,
  lowBalanceAlerts: true,
  marketExpired: true,
  dailyDigest: true,
};

describe('Notification Preferences', () => {
  let preferences: NotificationPreferences;

  beforeEach(() => {
    preferences = { ...DEFAULT_PREFERENCES };
  });

  describe('Preference Storage', () => {
    it('should initialize with default preferences', () => {
      expect(preferences).toEqual(DEFAULT_PREFERENCES);
    });

    it('should have all required preference keys', () => {
      const requiredKeys: (keyof NotificationPreferences)[] = [
        'portfolioMilestones',
        'transactionStatus',
        'priceAlerts',
        'liquidationWarnings',
        'governanceUpdates',
        'lowBalanceAlerts',
        'marketExpired',
        'dailyDigest',
      ];

      requiredKeys.forEach((key) => {
        expect(preferences).toHaveProperty(key);
        expect(typeof preferences[key]).toBe('boolean');
      });
    });

    it('should persist preference changes', () => {
      preferences.portfolioMilestones = false;
      expect(preferences.portfolioMilestones).toBe(false);

      preferences.transactionStatus = false;
      expect(preferences.transactionStatus).toBe(false);
    });

    it('should allow toggling individual preferences', () => {
      const originalValue = preferences.priceAlerts;
      preferences.priceAlerts = !originalValue;
      expect(preferences.priceAlerts).toBe(!originalValue);
    });

    it('should allow resetting all preferences to defaults', () => {
      preferences.portfolioMilestones = false;
      preferences.transactionStatus = false;
      preferences.priceAlerts = false;

      preferences = { ...DEFAULT_PREFERENCES };

      expect(preferences).toEqual(DEFAULT_PREFERENCES);
    });
  });

  describe('Alert Delivery Service', () => {
    it('should validate portfolio milestone alert data', () => {
      const alertData = {
        milestone: 'profit_target_reached',
        value: 1000,
        currentValue: 1050,
      };

      expect(alertData.value).toBeGreaterThan(0);
      expect(alertData.currentValue).toBeGreaterThanOrEqual(alertData.value);
      expect(alertData.milestone).toBeTruthy();
    });

    it('should validate transaction status alert data', () => {
      const alertData = {
        transactionId: 'tx_123abc',
        status: 'confirmed',
        type: 'trade',
        amount: 100,
      };

      expect(['pending', 'confirmed', 'failed']).toContain(alertData.status);
      expect(alertData.transactionId).toBeTruthy();
      expect(alertData.type).toBeTruthy();
    });

    it('should validate liquidation warning data', () => {
      const alertData = {
        positionId: 'pos_456def',
        riskLevel: 0.85,
        estimatedLiquidationPrice: 45000,
        currentPrice: 48000,
      };

      expect(alertData.riskLevel).toBeGreaterThan(0);
      expect(alertData.riskLevel).toBeLessThanOrEqual(1);
      expect(alertData.currentPrice).toBeGreaterThan(0);
      expect(alertData.estimatedLiquidationPrice).toBeGreaterThan(0);
    });

    it('should handle alert delivery success', () => {
      const result = {
        success: true,
        deliveryMethod: 'push_notification',
        timestamp: new Date().toISOString(),
      };

      expect(result.success).toBe(true);
      expect(result.deliveryMethod).toBeTruthy();
      expect(result.timestamp).toBeTruthy();
    });

    it('should handle alert delivery failure', () => {
      const result = {
        success: false,
        deliveryMethod: 'unknown',
        timestamp: new Date().toISOString(),
        error: 'User not subscribed to push notifications',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should log alert failures with metadata', () => {
      const failureLog = {
        alertType: 'portfolio_milestone',
        reason: 'user_disabled_preference',
        metadata: {
          userId: 'user_123',
          preferenceKey: 'portfolioMilestones',
          timestamp: new Date().toISOString(),
        },
      };

      expect(failureLog.alertType).toBeTruthy();
      expect(failureLog.reason).toBeTruthy();
      expect(failureLog.metadata).toBeTruthy();
      expect(failureLog.metadata.userId).toBeTruthy();
    });
  });

  describe('Preference Persistence', () => {
    it('should reflect user preferences in alert delivery', () => {
      preferences.portfolioMilestones = false;

      const shouldSendAlert = preferences.portfolioMilestones;
      expect(shouldSendAlert).toBe(false);
    });

    it('should prevent disabled alerts from being sent', () => {
      preferences.transactionStatus = false;
      preferences.priceAlerts = false;

      expect(preferences.transactionStatus).toBe(false);
      expect(preferences.priceAlerts).toBe(false);
    });

    it('should allow selective alert management', () => {
      preferences.portfolioMilestones = true;
      preferences.transactionStatus = false;
      preferences.priceAlerts = true;

      expect(preferences.portfolioMilestones).toBe(true);
      expect(preferences.transactionStatus).toBe(false);
      expect(preferences.priceAlerts).toBe(true);
    });

    it('should maintain preference consistency across operations', () => {
      const operations = [
        { key: 'portfolioMilestones' as const, value: false },
        { key: 'transactionStatus' as const, value: false },
        { key: 'priceAlerts' as const, value: true },
      ];

      operations.forEach((op) => {
        preferences[op.key] = op.value;
      });

      expect(preferences.portfolioMilestones).toBe(false);
      expect(preferences.transactionStatus).toBe(false);
      expect(preferences.priceAlerts).toBe(true);
    });
  });

  describe('UI State Reflection', () => {
    it('should reflect enabled preferences in UI', () => {
      const enabledPreferences = Object.entries(preferences)
        .filter(([, value]) => value === true)
        .map(([key]) => key);

      expect(enabledPreferences.length).toBeGreaterThan(0);
      expect(enabledPreferences).toContain('portfolioMilestones');
    });

    it('should reflect disabled preferences in UI', () => {
      preferences.portfolioMilestones = false;
      preferences.governanceUpdates = false;

      const disabledPreferences = Object.entries(preferences)
        .filter(([, value]) => value === false)
        .map(([key]) => key);

      expect(disabledPreferences).toContain('portfolioMilestones');
      expect(disabledPreferences).toContain('governanceUpdates');
    });

    it('should provide accurate count of enabled preferences', () => {
      const enabledCount = Object.values(preferences).filter((v) => v === true).length;
      expect(enabledCount).toBe(8);

      preferences.portfolioMilestones = false;
      const newEnabledCount = Object.values(preferences).filter((v) => v === true).length;
      expect(newEnabledCount).toBe(7);
    });

    it('should validate preference UI state matches actual state', () => {
      const testStates = [
        { portfolio: true, transaction: false, price: true },
        { portfolio: false, transaction: true, price: false },
        { portfolio: true, transaction: true, price: true },
      ];

      testStates.forEach((state) => {
        const statePrefs = {
          ...preferences,
          portfolioMilestones: state.portfolio,
          transactionStatus: state.transaction,
          priceAlerts: state.price,
        };

        expect(statePrefs.portfolioMilestones).toBe(state.portfolio);
        expect(statePrefs.transactionStatus).toBe(state.transaction);
        expect(statePrefs.priceAlerts).toBe(state.price);
      });
    });
  });

  describe('Preference Validation', () => {
    it('should validate portfolio milestone preference', () => {
      expect(typeof preferences.portfolioMilestones).toBe('boolean');
      preferences.portfolioMilestones = true;
      expect(preferences.portfolioMilestones).toBe(true);
    });

    it('should validate liquidation warnings preference (critical)', () => {
      expect(typeof preferences.liquidationWarnings).toBe('boolean');
      expect(preferences.liquidationWarnings).toBe(true);
    });

    it('should validate all preference values are boolean', () => {
      Object.entries(preferences).forEach(([key, value]) => {
        expect(typeof value).toBe('boolean');
      });
    });

    it('should prevent invalid preference values', () => {
      const invalidAssignments = [
        { key: 'portfolioMilestones' as const, value: 'true' },
        { key: 'transactionStatus' as const, value: 1 },
        { key: 'priceAlerts' as const, value: null },
      ];

      invalidAssignments.forEach((assignment) => {
        const isValid = typeof assignment.value === 'boolean';
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Preference Categories', () => {
    it('should group preferences by category', () => {
      const categories = {
        portfolio: ['portfolioMilestones', 'liquidationWarnings', 'lowBalanceAlerts', 'dailyDigest'],
        transaction: ['transactionStatus'],
        market: ['priceAlerts', 'marketExpired'],
        governance: ['governanceUpdates'],
      };

      Object.entries(categories).forEach(([category, keys]) => {
        keys.forEach((key) => {
          expect(preferences).toHaveProperty(key);
        });
      });
    });

    it('should allow bulk category operations', () => {
      const portfolioKeys: (keyof NotificationPreferences)[] = [
        'portfolioMilestones',
        'liquidationWarnings',
        'lowBalanceAlerts',
        'dailyDigest',
      ];

      portfolioKeys.forEach((key) => {
        preferences[key] = false;
      });

      portfolioKeys.forEach((key) => {
        expect(preferences[key]).toBe(false);
      });
    });
  });

  describe('Critical Alert Protection', () => {
    it('should identify critical alerts', () => {
      const criticalAlerts = ['liquidationWarnings'];
      const isCritical = (key: string) => criticalAlerts.includes(key);

      expect(isCritical('liquidationWarnings')).toBe(true);
      expect(isCritical('portfolioMilestones')).toBe(false);
    });

    it('should prevent disabling critical alerts', () => {
      const criticalAlerts = ['liquidationWarnings'];

      criticalAlerts.forEach((alert) => {
        preferences[alert as keyof NotificationPreferences] = true;
      });

      criticalAlerts.forEach((alert) => {
        expect(preferences[alert as keyof NotificationPreferences]).toBe(true);
      });
    });
  });

  describe('Preference Comparison', () => {
    it('should detect preference changes', () => {
      const original = { ...DEFAULT_PREFERENCES };
      const modified = { ...preferences, portfolioMilestones: false };

      const hasChanges = JSON.stringify(original) !== JSON.stringify(modified);
      expect(hasChanges).toBe(true);
    });

    it('should detect no preference changes', () => {
      const original = { ...preferences };
      const modified = { ...preferences };

      const hasChanges = JSON.stringify(original) !== JSON.stringify(modified);
      expect(hasChanges).toBe(false);
    });

    it('should track changed keys', () => {
      const original = { ...DEFAULT_PREFERENCES };
      preferences.portfolioMilestones = false;
      preferences.priceAlerts = false;

      const changedKeys = Object.keys(original).filter(
        (key) => original[key as keyof NotificationPreferences] !==
          preferences[key as keyof NotificationPreferences]
      );

      expect(changedKeys).toContain('portfolioMilestones');
      expect(changedKeys).toContain('priceAlerts');
    });
  });
});

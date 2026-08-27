import { apiClient } from '@/lib/api-client';

export interface NotificationPreferences {
  portfolioMilestones: boolean;
  transactionStatus: boolean;
  priceAlerts: boolean;
  liquidationWarnings: boolean;
  governanceUpdates: boolean;
  lowBalanceAlerts: boolean;
  marketExpired: boolean;
  dailyDigest: boolean;
  treasuryAlerts: boolean;
  riskAlerts: boolean;
  yieldOpportunityAlerts: boolean;
}

export interface NotificationAlert {
  id: string;
  type: string;
  category: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  readAt?: string | null;
  status?: string;
  metadata?: Record<string, any>;
}

interface AlertDeliveryResult {
  success: boolean;
  deliveryMethod: string;
  timestamp: string;
  error?: string;
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
  treasuryAlerts: true,
  riskAlerts: true,
  yieldOpportunityAlerts: true,
};

export const notificationService = {
  async getPreferences(walletAddress: string): Promise<NotificationPreferences> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.get<NotificationPreferences>(
        `/notifications/preferences/${walletAddress}`
      );
      if (response.success && response.data) {
        return response.data;
      }
      return DEFAULT_PREFERENCES;
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
      return DEFAULT_PREFERENCES;
    }
  },

  async savePreferences(
    walletAddress: string,
    preferences: NotificationPreferences
  ): Promise<NotificationPreferences> {
    apiClient.setAuthToken(walletAddress);
    const response = await apiClient.post<NotificationPreferences>(
      `/notifications/preferences/${walletAddress}`,
      preferences
    );
    if (!response.success) {
      throw new Error(response.message || 'Failed to save notification preferences');
    }
    return response.data || preferences;
  },

  async getAlerts(walletAddress: string, limit: number = 50): Promise<NotificationAlert[]> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.get<NotificationAlert[]>(
        `/notifications/alerts/${walletAddress}?limit=${limit}`
      );
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
      return [];
    }
  },

  async getNotificationHistory(
    walletAddress: string,
    options: { limit?: number; page?: number; unreadOnly?: boolean; category?: string } = {}
  ): Promise<NotificationAlert[]> {
    apiClient.setAuthToken(walletAddress);
    const params = new URLSearchParams();
    params.set('limit', String(options.limit || 50));
    params.set('page', String(options.page || 1));
    if (options.unreadOnly) params.set('unreadOnly', 'true');
    if (options.category) params.set('category', options.category);

    try {
      const response = await apiClient.get<NotificationAlert[]>(
        `/notifications/alerts/${walletAddress}?${params.toString()}`
      );
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch notification history:', error);
      return [];
    }
  },

  async markAlertAsRead(walletAddress: string, alertId: string): Promise<boolean> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.put<{ success: boolean }>(
        `/notifications/alerts/${alertId}/read`,
        {}
      );
      return response.success;
    } catch (error) {
      console.error('Failed to mark alert as read:', error);
      return false;
    }
  },

  async markAllAlertsAsRead(walletAddress: string): Promise<boolean> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.put<{ success: boolean }>(
        `/notifications/alerts/read-all`,
        {}
      );
      return response.success;
    } catch (error) {
      console.error('Failed to mark all alerts as read:', error);
      return false;
    }
  },

  async sendPortfolioMilestoneAlert(
    walletAddress: string,
    data: {
      milestone: string;
      value: number;
      currentValue: number;
    }
  ): Promise<AlertDeliveryResult> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.post<AlertDeliveryResult>(
        `/notifications/send/portfolio-milestone`,
        { walletAddress, ...data }
      );
      if (response.success && response.data) {
        return response.data;
      }
      return {
        success: false,
        deliveryMethod: 'unknown',
        timestamp: new Date().toISOString(),
        error: 'Failed to send portfolio milestone alert',
      };
    } catch (error) {
      console.error('Failed to send portfolio milestone alert:', error);
      return {
        success: false,
        deliveryMethod: 'unknown',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  async sendTransactionStatusAlert(
    walletAddress: string,
    data: {
      transactionId: string;
      status: string;
      type: string;
      amount?: number;
    }
  ): Promise<AlertDeliveryResult> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.post<AlertDeliveryResult>(
        `/notifications/send/transaction-status`,
        { walletAddress, ...data }
      );
      if (response.success && response.data) {
        return response.data;
      }
      return {
        success: false,
        deliveryMethod: 'unknown',
        timestamp: new Date().toISOString(),
        error: 'Failed to send transaction status alert',
      };
    } catch (error) {
      console.error('Failed to send transaction status alert:', error);
      return {
        success: false,
        deliveryMethod: 'unknown',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  async sendLiquidationWarning(
    walletAddress: string,
    data: {
      positionId: string;
      riskLevel: number;
      estimatedLiquidationPrice: number;
      currentPrice: number;
    }
  ): Promise<AlertDeliveryResult> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.post<AlertDeliveryResult>(
        `/notifications/send/liquidation-warning`,
        { walletAddress, ...data }
      );
      if (response.success && response.data) {
        return response.data;
      }
      return {
        success: false,
        deliveryMethod: 'unknown',
        timestamp: new Date().toISOString(),
        error: 'Failed to send liquidation warning',
      };
    } catch (error) {
      console.error('Failed to send liquidation warning:', error);
      return {
        success: false,
        deliveryMethod: 'unknown',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  async sendTreasuryAlert(
    walletAddress: string,
    data: {
      eventType: string;
      amount?: number;
      asset?: string;
      threshold?: number;
      message?: string;
    }
  ): Promise<AlertDeliveryResult> {
    apiClient.setAuthToken(walletAddress);
    const response = await apiClient.post<AlertDeliveryResult>(
      `/notifications/send/treasury-alert`,
      { walletAddress, ...data }
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to send treasury alert');
    }
    return response.data;
  },

  async sendRiskAlert(
    walletAddress: string,
    data: {
      riskType: string;
      score?: number;
      severity?: 'info' | 'warning' | 'critical';
      message?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<AlertDeliveryResult> {
    apiClient.setAuthToken(walletAddress);
    const response = await apiClient.post<AlertDeliveryResult>(
      `/notifications/send/risk-alert`,
      { walletAddress, ...data }
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to send risk alert');
    }
    return response.data;
  },

  async sendYieldOpportunityAlert(
    walletAddress: string,
    data: {
      marketId: string;
      question?: string;
      apy: number;
      riskScore?: number;
      message?: string;
    }
  ): Promise<AlertDeliveryResult> {
    apiClient.setAuthToken(walletAddress);
    const response = await apiClient.post<AlertDeliveryResult>(
      `/notifications/send/yield-opportunity`,
      { walletAddress, ...data }
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to send yield opportunity alert');
    }
    return response.data;
  },

  async logAlertFailure(
    walletAddress: string,
    data: {
      alertType: string;
      reason: string;
      metadata?: Record<string, any>;
    }
  ): Promise<boolean> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.post<{ success: boolean }>(
        `/notifications/log-failure`,
        { walletAddress, ...data }
      );
      return response.success;
    } catch (error) {
      console.error('Failed to log alert failure:', error);
      return false;
    }
  },

  async getUnreadAlertCount(walletAddress: string): Promise<number> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.get<{ count: number }>(
        `/notifications/unread-count/${walletAddress}`
      );
      if (response.success && response.data) {
        return response.data.count;
      }
      return 0;
    } catch (error) {
      console.error('Failed to get unread alert count:', error);
      return 0;
    }
  },

  async deleteAlert(walletAddress: string, alertId: string): Promise<boolean> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.delete<{ success: boolean }>(
        `/notifications/alerts/${alertId}`
      );
      return response.success;
    } catch (error) {
      console.error('Failed to delete alert:', error);
      return false;
    }
  },

  async clearAllAlerts(walletAddress: string): Promise<boolean> {
    apiClient.setAuthToken(walletAddress);
    try {
      const response = await apiClient.delete<{ success: boolean }>(
        `/notifications/alerts`
      );
      return response.success;
    } catch (error) {
      console.error('Failed to clear all alerts:', error);
      return false;
    }
  },
};

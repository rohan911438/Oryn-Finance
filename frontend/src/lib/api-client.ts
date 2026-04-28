import { API_CONFIG, ENDPOINTS, ApiResponse } from './api-config';

// Generic API client with error handling and authentication
class ApiClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseURL = API_CONFIG.BASE_URL;
    this.timeout = API_CONFIG.TIMEOUT;
    this.defaultHeaders = API_CONFIG.HEADERS;
  }

  // Set authentication token
  setAuthToken(token: string) {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Remove authentication token
  removeAuthToken() {
    delete this.defaultHeaders['Authorization'];
  }

  private cacheKey(endpoint: string) {
    return `oryn_cache:${endpoint}`;
  }

  private writeCache(endpoint: string, data: unknown) {
    try {
      localStorage.setItem(this.cacheKey(endpoint), JSON.stringify({ data, ts: Date.now() }));
    } catch { /* storage full — ignore */ }
  }

  private readCache<T>(endpoint: string): ApiResponse<T> | null {
    try {
      const raw = localStorage.getItem(this.cacheKey(endpoint));
      if (!raw) return null;
      const { data } = JSON.parse(raw);
      return { ...(data as ApiResponse<T>), cached: true } as ApiResponse<T> & { cached: boolean };
    } catch {
      return null;
    }
  }

  // Generic request method
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const isGet = !options.method || options.method === 'GET';

    // Serve from cache immediately when offline
    if (!navigator.onLine) {
      if (isGet) {
        const cached = this.readCache<T>(endpoint);
        if (cached) return cached;
      }
      throw new Error('You are offline. Please check your network connection.');
    }

    const url = `${this.baseURL}${endpoint}`;
    const config: RequestInit = {
      ...options,
      headers: { ...this.defaultHeaders, ...options.headers },
      signal: AbortSignal.timeout(this.timeout),
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ApiResponse<T> = await response.json();

      // Cache successful GET responses
      if (isGet && data.success) {
        this.writeCache(endpoint, data);
      }

      return data;
    } catch (error) {
      // Network failure — fall back to cache for GETs
      if (isGet) {
        const cached = this.readCache<T>(endpoint);
        if (cached) return cached;
      }

      console.error(`API Request failed: ${endpoint}`, error);
      if (error instanceof Error) throw new Error(`API Error: ${error.message}`);
      throw new Error('Unknown API error occurred');
    }
  }

  // GET request
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  // POST request
  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // PUT request
  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // DELETE request
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Health check with timeout
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.get(ENDPOINTS.HEALTH);
      return response.success && response.data?.status === 'healthy';
    } catch {
      return false;
    }
  }

  // Test backend connectivity
  async testConnection(): Promise<{
    isConnected: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const response = await this.get(ENDPOINTS.HEALTH);
      const latency = Date.now() - startTime;
      
      return {
        isConnected: response.success,
        latency,
      };
    } catch (error) {
      return {
        isConnected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
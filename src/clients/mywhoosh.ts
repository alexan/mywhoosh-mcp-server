import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BASE_URLS, USER_AGENT } from '../constants.js';

export type BaseUrlKey = keyof typeof BASE_URLS;

export interface MyWhooshRequestOptions extends Omit<RequestInit, 'headers'> {
  baseUrl?: BaseUrlKey;
  headers?: Record<string, string>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  whooshId: string;
}

// status lets callers tell a rejected refresh token (re-login needed) from a transient failure
export class TokenRefreshError extends Error {
  constructor(readonly status: number) {
    super(`MyWhoosh token refresh failed: ${status}`);
  }

  get rejected(): boolean {
    return this.status === 401 || this.status === 403 || this.status === 426;
  }
}

// Seconds since epoch at which a MyWhoosh JWT expires; 0 when it can't be read
export function tokenExpiry(jwt: string): number {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return Number(JSON.parse(atob(payload)).exp) || 0;
  } catch {
    return 0;
  }
}

export class MyWhooshClient {
  private tokens: AuthTokens | null = null;

  constructor(tokens?: AuthTokens) {
    if (tokens) {
      this.tokens = tokens;
    }
  }

  setTokens(tokens: AuthTokens) {
    this.tokens = tokens;
  }

  getWhooshId(): string | null {
    return this.tokens?.whooshId ?? null;
  }

  isAuthenticated(): boolean {
    return this.tokens !== null && !!this.tokens.accessToken;
  }

  async login(username: string, password: string, deviceId: string): Promise<AuthTokens> {
    const response = await fetch(`${BASE_URLS.PUBLIC}/http-service/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({
        Username: username,
        Password: password,
        Platform: 'Android',
        Action: 1001,
        CorrelationId: crypto.randomUUID(),
        DeviceId: deviceId,
        Authorization: '',
      }),
    });

    if (!response.ok) {
      throw new McpError(ErrorCode.InvalidParams, `Login failed: ${response.status}`);
    }

    const data: any = await response.json();
    if (!data.Success) {
      throw new McpError(ErrorCode.InvalidParams, data.Message || 'Login failed');
    }

    this.tokens = {
      accessToken: data.AccessToken,
      refreshToken: data.RefreshToken,
      whooshId: data.WhooshId,
    };

    return this.tokens;
  }

  // Same call the app makes: GET tokens/generate with the refresh token as bearer returns a fresh
  // access token (~15 days) and refresh token (~60 days). The old refresh token is not revoked.
  async refresh(): Promise<AuthTokens> {
    if (!this.tokens?.refreshToken) {
      throw new McpError(ErrorCode.InvalidRequest, 'No MyWhoosh refresh token');
    }

    const response = await fetch(`${BASE_URLS.PUBLIC}/http-service/api/tokens/generate`, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Authorization: `Bearer ${this.tokens.refreshToken}` },
    });

    if (!response.ok) {
      throw new TokenRefreshError(response.status);
    }

    const data: any = await response.json();
    if (!data.AccessToken || !data.RefreshToken) {
      throw new McpError(ErrorCode.InvalidRequest, 'Token refresh returned no tokens');
    }

    this.tokens = {
      accessToken: data.AccessToken,
      refreshToken: data.RefreshToken,
      whooshId: data.WhooshId ?? this.tokens.whooshId,
    };

    return this.tokens;
  }

  async get<T = any>(endpoint: string, options: MyWhooshRequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T = any>(endpoint: string, options: MyWhooshRequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST' });
  }

  async put<T = any>(endpoint: string, options: MyWhooshRequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT' });
  }

  async delete<T = any>(endpoint: string, options: MyWhooshRequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  private async request<T>(
    endpoint: string,
    options: MyWhooshRequestOptions & { method: string }
  ): Promise<T> {
    if (!this.tokens?.accessToken) {
      throw new McpError(ErrorCode.InvalidRequest, 'Not authenticated. Re-authorize the MCP server.');
    }

    const baseUrl = BASE_URLS[options.baseUrl ?? 'MAIN'];
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Authorization: `Bearer ${this.tokens.accessToken}`,
      ...options.headers,
    };

    const { baseUrl: _, headers: __, ...fetchOptions } = options;

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // tokens renew on OAuth refresh (src/index.ts); a 401 here means renewal didn't happen in time
      if (response.status === 401) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `MyWhoosh session expired (401). Re-authorize the MCP server in your client. ${errorText}`
        );
      }
      // MyWhoosh backend bug: uploaded custom workouts get persisted with sportsModeType NaN, and
      // every coaching read/delete touching one fails (https://github.com/isllabres/mywhoosh-mcp-server/issues/1)
      if (errorText.includes('CastError') && errorText.includes('sportsModeType')) {
        throw new McpError(
          ErrorCode.InternalError,
          'MyWhoosh cannot load your custom workouts: at least one is stored with sportsModeType NaN, a known ' +
            'MyWhoosh backend bug that affects every workout uploaded through the API. Listing and deleting custom ' +
            'workouts through the API fail until MyWhoosh fixes it; uploading and scheduling still work. Delete ' +
            'workouts in the MyWhoosh app.'
        );
      }
      throw new McpError(ErrorCode.InternalError, `API request failed: ${response.status} - ${errorText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text() as T;
  }
}

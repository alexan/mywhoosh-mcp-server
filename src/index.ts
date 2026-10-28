import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OAuthProvider, OAuthError, type TokenExchangeCallbackOptions } from '@cloudflare/workers-oauth-provider';
import { MyWhooshClient, TokenRefreshError, tokenExpiry, type AuthTokens } from './clients/mywhoosh.js';
import { SERVER_NAME, APP_VERSION } from './constants.js';
import { authHandler } from './auth.js';
import { tools } from './tools/index.js';

// Env comes from worker-configuration.d.ts (wrangler types)

// MyWhoosh tokens live in the OAuth grant (encrypted props); the password is never stored
type Props = { tokens: AuthTokens };

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const suffix = context ? ` ${JSON.stringify(context)}` : '';
  console.log(`[${level.toUpperCase()}] ${message}${suffix}`);
}

export class MyWhooshMCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: SERVER_NAME, version: APP_VERSION });

  // A fresh client per call, built from this request's grant, so a reused Durable Object
  // never serves one account's data under another's tokens
  private client(): MyWhooshClient {
    const tokens = this.props?.tokens;
    if (!tokens?.accessToken) {
      throw new McpError(ErrorCode.InvalidRequest, 'No MyWhoosh session — re-authorize the MCP server.');
    }
    return new MyWhooshClient(tokens);
  }

  async init() {
    for (const tool of tools) {
      this.server.tool(tool.method, tool.description, tool.parameters.shape, async (args: Record<string, unknown>) => {
        log('info', `Tool invocation: ${tool.method}`);
        try {
          return await tool.handler(args, { client: this.client() });
        } catch (error: any) {
          log('error', `Tool failed: ${tool.method}`, { error: error.message });
          if (error instanceof McpError) throw error;
          throw new McpError(ErrorCode.InternalError, error.message);
        }
      });
    }
  }
}

// Renew the MyWhoosh tokens when ours are refreshed (hourly while a client is active) and the
// MyWhoosh access token has less than this left; each renewal also extends the refresh token to ~60 days
const MYWHOOSH_REFRESH_WINDOW_SECONDS = 3 * 86400;

async function renewMyWhooshTokens(options: TokenExchangeCallbackOptions) {
  if (options.grantType !== 'refresh_token') return;
  const tokens = (options.props as Props).tokens;
  if (tokenExpiry(tokens.accessToken) - Date.now() / 1000 > MYWHOOSH_REFRESH_WINDOW_SECONDS) return;
  try {
    const renewed = await new MyWhooshClient(tokens).refresh();
    log('info', 'Renewed MyWhoosh tokens', { userId: options.userId });
    return { newProps: { tokens: renewed } satisfies Props };
  } catch (e) {
    // a rejected refresh token (e.g. unused for 60 days) means the user has to log in again
    if (e instanceof TokenRefreshError && e.rejected) {
      throw new OAuthError('invalid_grant', { description: 'MyWhoosh session expired, please log in again.' });
    }
    throw e;
  }
}

// OAuth 2.1 only: /authorize serves the MyWhoosh login page; grants carry the MyWhoosh tokens as
// encrypted props; every /mcp request is gated on a provider-validated access token.
export default new OAuthProvider({
  apiRoute: '/mcp',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiHandler: MyWhooshMCP.serve('/mcp') as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultHandler: authHandler as any,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  clientIdMetadataDocumentEnabled: true,
  // no fixed grant lifetime: it lives as long as MyWhoosh renewal succeeds (rolling ~60 days)
  refreshTokenTTL: undefined,
  tokenExchangeCallback: renewMyWhooshTokens,
});

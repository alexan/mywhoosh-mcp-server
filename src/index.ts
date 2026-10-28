import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { MyWhooshClient, type AuthTokens } from './clients/mywhoosh.js';
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
});

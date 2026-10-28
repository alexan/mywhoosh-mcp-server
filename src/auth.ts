import {
  AuthorizationError,
  type AuthRequest,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider';
import { MyWhooshClient } from './clients/mywhoosh.js';
import { SERVER_NAME } from './constants.js';

interface AuthEnv {
  OAUTH_PROVIDER: OAuthHelpers;
  // comma-separated WhooshId allowlist; empty/unset = open to any MyWhoosh account
  OWNER_WHOOSH_IDS?: string;
}

// tools send DeviceId 'mcp-server' too, so the token's deviceId claim matches their requests
const DEVICE_ID = 'mcp-server';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `<style>
  body{font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1a1a1a;background:#fafafa}
  @media(prefers-color-scheme:dark){body{color:#eee;background:#111}input{background:#1d1d1d!important;color:#eee;border-color:#333!important}}
  label{display:block;font-weight:600;margin:1rem 0 .3rem}
  input{width:100%;font-size:1rem;border:1px solid #ccc;border-radius:6px;padding:.6rem;box-sizing:border-box}
  button{margin-top:1.2rem;background:#0a7;color:#fff;border:0;border-radius:6px;padding:.7rem 1.6rem;font-size:1rem;cursor:pointer}
  .err{background:#fee;color:#900;border:1px solid #e99;border-radius:6px;padding:.6rem;margin:1rem 0}
  .ok{background:#efe;color:#060;border:1px solid #9d9;border-radius:6px;padding:.6rem;margin:1rem 0}
  .note{font-size:.85rem;opacity:.7}
</style>`;

function shell(title: string, inner: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${STYLE}</head><body>${inner}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// Real MCP clients redirect to their own callback and show their own page; this one is for
// local testing, where the test client registers http://localhost:8787/cb as its redirect URI.
function callbackPage(url: URL): Response {
  const error = url.searchParams.get('error');
  if (error) {
    const detail = url.searchParams.get('error_description') ?? error;
    return shell('Connection failed', `<h2>Connection failed</h2><div class="err">${esc(detail)}</div>
<p class="note">Go back to your MCP client and start the authorization again.</p>`, 400);
  }
  if (url.searchParams.get('code')) {
    return shell('MyWhoosh connected', `<h2>MyWhoosh connected</h2><div class="ok">Login successful. You can close this tab and return to your MCP client.</div>`);
  }
  return shell('Nothing to show', `<h2>Nothing to show</h2><p class="note">This page is only reached at the end of an authorization.</p>`, 400);
}

function loginPage(clientName: string, action: string, error?: string, email = ''): Response {
  return shell(
    'Connect MyWhoosh',
    `<h2>Connect your MyWhoosh account</h2>
<p><b>${esc(clientName)}</b> wants to access your MyWhoosh data through this MCP server.</p>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<form method="post" action="${esc(action)}">
  <label>MyWhoosh email</label>
  <input type="email" name="email" value="${esc(email)}" autocomplete="username" required ${email ? '' : 'autofocus'}>
  <label>Password</label>
  <input type="password" name="password" autocomplete="current-password" required ${email ? 'autofocus' : ''}>
  <button type="submit">Connect MyWhoosh</button>
</form>
<p class="note" style="margin-top:2rem">Credentials are sent once to this server to log in to MyWhoosh, then discarded — only the resulting MyWhoosh tokens are kept, encrypted, in your authorization grant. They expire after about two weeks; re-authorize the server in your client then.</p>
`
  );
}

const errorMessage = (e: unknown) =>
  (e instanceof AuthorizationError ? e.description : e instanceof Error ? e.message : String(e)).replace(
    /^MCP error -?\d+: /,
    ''
  );

// Every failure is shown on the login page instead of redirecting back to the client, so the
// user always sees what went wrong (deliberately not the RFC 6749 §4.1.2.1 error redirect).
async function handleAuthorize(request: Request, env: AuthEnv): Promise<Response> {
  const u = new URL(request.url);
  const action = u.pathname + u.search; // re-post here so OAuth query params survive
  let clientName = u.searchParams.get('client_id') ?? 'An MCP client';

  let oauthRequest: AuthRequest;
  try {
    oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
    clientName = client?.clientName ?? oauthRequest.clientId;
  } catch (e) {
    return loginPage(clientName, action, `Invalid authorization request: ${errorMessage(e)}`);
  }

  if (request.method !== 'POST') return loginPage(clientName, action);

  let email = '';
  try {
    const form = await request.formData();
    email = String(form.get('email') ?? '');
    const tokens = await new MyWhooshClient().login(
      email,
      String(form.get('password') ?? ''),
      DEVICE_ID
    );
    const allow = (env.OWNER_WHOOSH_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (allow.length && !allow.includes(String(tokens.whooshId))) {
      throw new Error('This server is private — only its owner\'s MyWhoosh account can connect.');
    }
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthRequest,
      userId: String(tokens.whooshId),
      metadata: {},
      scope: oauthRequest.scope,
      props: { tokens },
    });
    return Response.redirect(redirectTo, 302);
  } catch (e) {
    return loginPage(clientName, action, errorMessage(e), email);
  }
}

export const authHandler = {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/authorize') return handleAuthorize(request, env);
    if (pathname === '/cb') return callbackPage(new URL(request.url));
    if (pathname === '/') {
      return new Response(`${SERVER_NAME}: remote MCP server for MyWhoosh. MCP endpoint: /mcp (OAuth).`, {
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    return new Response('Not found', { status: 404 });
  },
};

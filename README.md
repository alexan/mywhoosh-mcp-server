# MyWhoosh MCP Server

[![GitHub stars](https://img.shields.io/github/stars/mywhoosh-community/mywhoosh-mcp-server)](https://github.com/mywhoosh-community/mywhoosh-mcp-server/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mywhoosh-community/mywhoosh-mcp-server)](https://github.com/mywhoosh-community/mywhoosh-mcp-server/network/members)
[![License](https://img.shields.io/github/license/mywhoosh-community/mywhoosh-mcp-server)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/mywhoosh-community/mywhoosh-mcp-server)

![MyWhoosh Logo](./docs/assets/mywhoosh-mcp-logo.png)

A remote Model Context Protocol (MCP) server for MyWhoosh on Cloudflare Workers (free tier). It gives your AI client (Claude, Cursor, ChatGPT, ...) access to the MyWhoosh API: create workouts, manage training sessions, schedule tasks, and more - all through natural language.

**Auth:** MyWhoosh has no public API or OAuth, so the server is its own OAuth 2.1 authorization server (via `@cloudflare/workers-oauth-provider`). Adding it to an MCP client opens a browser page where you enter your MyWhoosh email and password once. The Worker logs in to MyWhoosh, discards your credentials, and stores only the resulting MyWhoosh tokens, encrypted in the OAuth grant. Every `/mcp` request is gated on a provider-issued access token.

## Deploy

1. `npm install`
2. `npx wrangler kv namespace create OAUTH_KV` - paste the id into `wrangler.jsonc`
3. Optional: `npx wrangler secret put OWNER_WHOOSH_IDS` (see below)
4. `npx wrangler deploy`

## Connect a client

```bash
claude mcp add mywhoosh --transport http https://mywhoosh-mcp.<your-subdomain>.workers.dev/mcp
```

Claude Code opens the authorization page in your browser. claude.ai web: Settings -> Connectors -> Add custom connector with the same URL. Cursor: add the URL as a remote (HTTP) MCP server. Stdio-only clients: `mcp-remote` handles the OAuth flow too.

## Locking to your own account

Set the `OWNER_WHOOSH_IDS` secret to your WhooshId (comma-separated allowlist). Logins for any other MyWhoosh account are rejected at the authorize step, so strangers can't use your deployment even with their own valid MyWhoosh credentials. Leave it unset to allow any account.

## Known limitations

Workouts uploaded through the API are stored by MyWhoosh with `sportsModeType: NaN`, a MyWhoosh backend bug
(see [isllabres/mywhoosh-mcp-server#1](https://github.com/isllabres/mywhoosh-mcp-server/issues/1)). Tested on a live account:

| Operation | Tool | Works |
| --- | --- | --- |
| Create / update custom workout | `uploadCustomWorkout` | yes (visible in the app) |
| List custom workouts | `downloadCustomWorkoutsFromS3`, `getCustomWorkoutUpload` | no, fails once a NaN record exists |
| Delete custom workout | `deleteCustomWorkout` | no, delete in the MyWhoosh app |
| Schedule / list / delete calendar tasks | `createTask`, `getDateRangeTaskList`, `deleteTask` | yes |

## Notes

- MyWhoosh access tokens expire after about two weeks. Tool calls then fail with "session expired" - re-authorize the server in your client to log in again.
- Access tokens are bearer credentials: whoever holds a valid one has your data until it expires, so security rests on your MCP client keeping its stored token secret.
- Local dev: `npm run dev`, then point a client at `http://localhost:8787/mcp`.

## Usage

After installation, you can use the MCP server directly in your AI provider. Examples:

- "Create a 30-minute interval workout"
- "Show me my scheduled training sessions"
- "Change my MyWhoosh settings"

## License

ISC License - see [LICENSE](LICENSE) file for details.

## Support

For issues or questions, please create an [Issue](https://github.com/mywhoosh-community/mywhoosh-mcp-server/issues) on GitHub.
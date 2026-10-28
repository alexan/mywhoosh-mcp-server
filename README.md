# MyWhoosh MCP Server

[![License](https://img.shields.io/github/license/alexan/mywhoosh-mcp-server)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/alexan/mywhoosh-mcp-server)

![MyWhoosh Logo](./docs/assets/mywhoosh-mcp-logo.png)

A remote Model Context Protocol (MCP) server for MyWhoosh on Cloudflare Workers (free tier). It gives your AI client (Claude, Cursor, ChatGPT, ...) access to the MyWhoosh API through 44 tools: create and manage custom workouts, schedule training sessions, read player data, events, routes and more - all through natural language.

Fork of [mywhoosh-community/mywhoosh-mcp-server](https://github.com/mywhoosh-community/mywhoosh-mcp-server), which runs locally over stdio with username and password. This fork runs as a remote server with OAuth login instead.

MyWhoosh has no public API. The server uses the same endpoints as the MyWhoosh app; the [MyWhoosh terms](https://mywhoosh.com/?p=30) prohibit reverse engineering and automated data extraction, so use it at your own risk.

## How authentication works

The server is its own OAuth 2.1 authorization server (via `@cloudflare/workers-oauth-provider`):

1. Adding it to an MCP client opens a login page where you enter your MyWhoosh email and password once.
2. The Worker logs in to MyWhoosh, discards your credentials, and stores only the resulting MyWhoosh tokens, encrypted in the OAuth grant (Workers KV).
3. Every `/mcp` request needs an access token issued by the server (valid 1 hour; clients refresh it automatically).
4. MyWhoosh tokens renew automatically: when your client refreshes its token and the MyWhoosh access token (valid ~15 days) has less than 3 days left, the server swaps it via the refresh token (valid ~60 days, extended on every renewal). You only log in again after ~60 days without using the server.

Login errors (wrong password, account not allowed, invalid request) are shown on the login page itself.

## Deploy

Requires a Cloudflare account (`npx wrangler login`).

1. `npm install`
2. `npx wrangler kv namespace create OAUTH_KV` - replace `REPLACE_WITH_KV_ID` in `wrangler.jsonc` with the printed id
3. Optional: `npx wrangler secret put OWNER_WHOOSH_IDS` (see below)
4. `npx wrangler deploy`

## Connect a client

```bash
claude mcp add mywhoosh --transport http https://mywhoosh-mcp.<your-subdomain>.workers.dev/mcp
```

Claude Code opens the login page in your browser. claude.ai web: Settings -> Connectors -> Add custom connector with the same URL. Cursor: add the URL as a remote (HTTP) MCP server. Stdio-only clients: `mcp-remote` handles the OAuth flow too.

## Locking to your own account

Set the `OWNER_WHOOSH_IDS` secret to your WhooshId (comma-separated allowlist). Logins for any other MyWhoosh account are rejected on the login page, so strangers can't use your deployment even with their own valid MyWhoosh credentials. Leave it unset to allow any account.

## Custom workouts

Custom workouts are stored per sport: pass `sport` (`cycling`, `running` or `rowing`, default `cycling`)
to `uploadCustomWorkout`, `downloadCustomWorkoutsFromS3`, `getCustomWorkoutUpload` and `deleteCustomWorkout`.
The request shapes follow what the MyWhoosh app sends (see `.claude/skills/mitm-capture`). Tested on a live account:

| Operation | Tool | Tested |
| --- | --- | --- |
| List custom workouts | `downloadCustomWorkoutsFromS3`, `getCustomWorkoutUpload` | cycling, running, rowing |
| Create / update (same `Id`) | `uploadCustomWorkout` | cycling (visible in the app), running (via the list) |
| Delete | `deleteCustomWorkout` | running, rowing |
| Schedule / list / delete calendar tasks | `createTask`, `getDateRangeTaskList`, `deleteTask` | yes |

## Sports

Besides the custom workout tools, these tools take `sport` too and send it as `sportType`, like the app:
`getBundleInfo`, `getCalculations`, `getChallenges`, `getControllableBots`, `getEvents`, `getGarageItems`,
`getGroupWorkouts`, `getMissions`, `getMissionProgress`, `getPlayerAchievements`, `getPlayerGhostRideData`,
`getPlayerTrophiesJerseys`, `getTreasureHunt`. Without it they return cycling data. `getTreasureHunt` returns
an encoded string (the app receives the same), and `getSeasonPassProgress` is untested because no season pass
was active.

## Usage

Examples:

- "Create a 30-minute interval workout"
- "Create a running workout with 5 x 3 minutes at threshold"
- "Show me my custom rowing workouts"
- "Schedule my sweet spot workout for tomorrow at 7:00"

## Development

- `npm run dev` starts the Worker locally at `http://localhost:8787`; point a client at `http://localhost:8787/mcp`. In the Claude desktop app, `.claude/launch.json` starts it for the browser pane.
- `npm run typecheck` generates the Worker types and runs `tsc`.
- Tools live in `src/tools/` (one file per tool) and are registered in `src/tools/index.ts`; the MyWhoosh HTTP client is `src/clients/mywhoosh.ts`, the login page `src/auth.ts`.
- To find out how an API call really works, record the MyWhoosh app's requests: see the `mitm-capture` skill in `.claude/skills/mitm-capture/SKILL.md`.

## Security notes

- Access and refresh tokens are bearer credentials: whoever holds a valid one has your data, so security rests on your MCP client keeping its stored tokens secret. Grants have no fixed end date; they stay valid as long as MyWhoosh renewal succeeds. Re-authorizing, or deleting the grant from the `OAUTH_KV` namespace, ends one.
- Local secrets go in `.dev.vars` (see `.dev.vars.example`), which is git-ignored; in production use `npx wrangler secret put`.

## License

Apache License 2.0 - see [LICENSE](LICENSE).

## Support

Issues are disabled on this fork. For problems with the tools themselves, use the [upstream issue tracker](https://github.com/mywhoosh-community/mywhoosh-mcp-server/issues).

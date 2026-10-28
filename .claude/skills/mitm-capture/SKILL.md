---
name: mitm-capture
description: Record the requests the MyWhoosh desktop app (macOS) sends, with mitmproxy, to find out how an API call really works. Use when an endpoint fails or behaves differently from the app, or when a new MyWhoosh feature needs to be added to the MCP server.
---

# Capture MyWhoosh app traffic with mitmproxy

Use the official app's own requests as the reference when the MCP server's calls fail or the
right request shape is unknown. Only MyWhoosh hosts are decrypted; all other traffic passes
through unread.

Reading the app's traffic is reverse engineering, which the MyWhoosh terms prohibit
("duplicate, modify, reengineer", https://mywhoosh.com/?p=30). Only do it when the user has
explicitly accepted that.

## Files

| File | Purpose |
| --- | --- |
| `mitm-on.sh` | starts `mitmdump` on port 8080 (MyWhoosh hosts only), trusts its CA in the System keychain, points Wi-Fi at the proxy |
| `mitm-off.sh` | turns the proxy off, removes every mitmproxy CA from the System keychain, stops `mitmdump` |
| `capture.py` | mitmproxy addon: one JSON line per request/response; JWTs become `<JWT exp=…>`, passwords `<masked>`, cookies dropped |

Captures and logs go to `$MITM_OUT_DIR` (default `~/.mitmproxy/captures/`), never into the repo.
`MITM_SERVICE` (default `Wi-Fi`) and `MITM_PORT` (default `8080`) select the network service and port;
`networksetup -listnetworkserviceorder` shows the service behind the active interface.

## Steps

1. `brew install mitmproxy` (once).
2. The user runs `.claude/skills/mitm-capture/mitm-on.sh` in their own terminal. It asks for their
   password (keychain), so Claude never runs it and never changes security settings itself.
3. The user quits MyWhoosh completely (Cmd+Q), restarts it and performs exactly the actions to
   study (for example: open My Workouts per sport, create a workout, delete it).
4. Read the capture, for example:

   ```bash
   python3 -I -c "import json,sys
   for l in open(sys.argv[1]):
       e = json.loads(l)
       print(e['t'], e['method'], e['status'], e['url'][:150])" ~/.mitmproxy/captures/capture.jsonl
   ```

   Filter on the endpoint of interest and print `req_headers`, `req_body` and `res_body`.
   Presigned S3 URLs in responses are short-lived credentials: don't paste them anywhere.
5. The user runs `.claude/skills/mitm-capture/mitm-off.sh` as soon as the capture is done.
   Verify: `networksetup -getsecurewebproxy Wi-Fi` shows `Enabled: No` and
   `security find-certificate -c mitmproxy /Library/Keychains/System.keychain` finds nothing.

## Pitfalls

- **"Server Error – Server is not accessible" in the app:** before login the app sends
  `Authorization: Bearer ` (empty token) over HTTP/2, which mitmproxy rejects
  (`Received header value surrounded by whitespace`). `mitm-on.sh` therefore runs with
  `--set http2=false --set validate_inbound_headers=false`. Debug with
  `--set termlog_verbosity=debug` instead of `-q`.
- **No certificate pinning** was seen (app 6.2.3); if a host fails, look at the debug log first.
- **The app's data folder** (`~/Library/Containers/com.whoosh.whooshgame/Data`) is protected by
  macOS; even `sudo` can't read it from Terminal. Finder or Full Disk Access for Terminal works.
- If something already listens on the port, `mitm-on.sh` reuses it, and `mitm-off.sh` only
  stops a `mitmdump` it started itself.

## Findings so far (MyWhoosh 6.2.3, macOS)

Custom workouts live per sport on `coaching.mywhoosh.com/api/v2`:

| Action | Request |
| --- | --- |
| list | `GET /client/custom-workout-upload/{sport}` → `{data: {userId, workoutZipUrl, workoutCount, sportsModeType}}`; the zip URL is a presigned S3 link valid 600 s |
| create / update | `POST /client/custom-workout-upload` with `{SportsModeType, WorkoutsData: [...]}` (no `UserId`); same `Id` again updates |
| delete | `DELETE /client/custom-workout-upload/{sport}/{workoutId}` |

Sport numbers and workout `Mode`: cycling `0` / `E_Ride`, running `1` / `E_Run`, rowing `3` / `E_Row`.
The app also sends `Environment: "E_Outside"` and `ScheduledDate: ""` per workout and uses the
Unix time in seconds as a new workout's `Id`. Putting the WhooshId where `{sport}` belongs makes
the server answer `Cast to Number failed for value "NaN" … at path "sportsModeType"`.

Token renewal: `GET services.mywhoosh.com/http-service/api/tokens/generate` with the refresh
token as bearer returns a new access and refresh token.

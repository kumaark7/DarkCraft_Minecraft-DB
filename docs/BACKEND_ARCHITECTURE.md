# DarkCraft Backend Architecture

DarkCraft uses one TypeScript process so it remains easy to run and deploy. The React application keeps its existing service interfaces. `VITE_DATA_SOURCE=mock` selects the in-memory demo adapter; `VITE_DATA_SOURCE=real` selects the HTTP/WebSocket adapter.

```text
React pages → hooks → service interfaces → mockAdapter
                                  └──────→ realAdapter → /api/v1 → backend
                                                                  ├─ process manager
                                                                  ├─ authentication store
                                                                  ├─ sandboxed files
                                                                  ├─ backups/imports
                                                                  ├─ schedules
                                                                  └─ JSON state store
```

## Runtime data

- Dashboard metadata is written atomically to `.data/dashboard.json`.
- Minecraft instances are restricted to `MINECRAFT_SERVERS_ROOT`.
- Server processes use `spawn(executable, args, { shell: false })`.
- Console output is held in a bounded in-memory history and streamed by WebSocket.
- A server created by the UI receives `server.properties` and `eula.txt`. Supply an appropriate `server.jar` and explicitly accept the Minecraft EULA before starting it.

## Security guarantees

- `DASHBOARD_READ_ONLY=true` rejects every mutating endpoint with HTTP 403 before state, files, or processes are changed.
- Every dashboard REST endpoint and console WebSocket requires a server-side session; only health and the authentication bootstrap endpoints are public.
- Owner passwords use parameterized scrypt hashes. TOTP counters are persisted to reject replayed authenticator codes.
- Random session tokens are stored only as SHA-256 hashes under ignored `.data/auth/` and expire after one hour.
- Cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, and scoped to `/`; logout removes the server-side session immediately.
- Mutations require an allowed `Origin` and a per-session CSRF token. WebSockets require the same origin, session cookie, and CSRF token.
- Failed authentication is rate-limited with exponential temporary backoff and generic failure messages.
- Server IDs use a strict opaque-identifier format.
- File paths are decoded repeatedly before validation to catch encoded traversal.
- `..`, `.`, backslashes, null bytes, invalid encoding and paths outside the configured root are rejected.
- Existing symbolic-link components are rejected, preventing a symlink escape from a server directory.
- Archive entries are validated before extraction to prevent ZIP Slip.
- Minecraft processes and commands never use a shell.
- The backend binds to `127.0.0.1:8787` by default. Keep it on loopback and terminate TLS at Nginx; configure `DASHBOARD_ALLOWED_ORIGINS` with the public HTTPS origin.

The browser-side checks are defense in depth. The backend is the security boundary and repeats all validation.

## API endpoints

All JSON responses use `{ "data": ... }`; failures use `{ "error": { "code", "message" } }`.

| Area | Read endpoints | Mutation endpoints |
|---|---|---|
| Authentication | `GET /auth/status` | setup start/complete, login, logout |
| System | `GET /health`, `/host/stats`, `/activity`, `/logs` | — |
| Servers | `GET /servers`, `/servers/:id`, `/:id/stats` | create, delete, start, stop, restart, kill, import, export |
| Console | `GET /servers/:id/console`, WebSocket `/console/stream` | send command, clear history |
| Players | `GET /servers/:id/players`, `/banned-ips` | kick, ban, pardon, op, deop, whitelist, IP pardon |
| Files | list, content, download | save, upload, delete, create, rename, move, copy, ZIP, extract |
| Plugins/mods | list | upload, delete, enable/disable |
| Backups | list, download | create, restore, delete |
| Schedules | list | create, update, delete, run now; enabled cron jobs execute automatically |
| Global | notifications, bots, settings | mark read, bot start/stop, settings update |

Every endpoint is rooted at `/api/v1`. Detailed route names mirror the existing service interfaces in `src/services/interfaces.ts` and their implementation in `src/services/realAdapter.ts`.

## Production boundary

This backend intentionally does not download third-party Minecraft server binaries or auto-accept the EULA. Those are trust/legal decisions for the operator. All dashboard features remain wired; a server becomes startable once its selected JAR and accepted EULA are present in its sandboxed directory.

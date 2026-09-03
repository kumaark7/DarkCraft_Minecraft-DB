# DarkCraft Minecraft Server Dashboard

A full-stack Minecraft server management dashboard built with React, TypeScript, Vite, Tailwind CSS, and a lightweight Fastify backend. It manages servers, players, console activity, files, plugins, backups, schedules, bots, notifications, and global settings.

The mock adapter remains the default for UI development. Real mode connects the same service interfaces to the bundled REST/WebSocket backend.

## Tech stack

- React 18
- TypeScript 5
- Vite 7
- React Router
- Tailwind CSS
- Radix UI primitives
- Lucide icons
- Sonner notifications
- Biome
- pnpm
- Fastify and WebSocket
- Atomic JSON persistence
- Scrypt password hashing and TOTP authentication

## Prerequisites

- Node.js 20.19 or newer, or Node.js 22.12 or newer
- Corepack enabled for pnpm

```bash
corepack enable
```

## Installation

```bash
corepack pnpm install
```

## Development

```bash
corepack pnpm dev
```

Run the backend in a second terminal:

```bash
corepack pnpm api:dev
```

Copy `.env.example` to `.env.local` and set `VITE_DATA_SOURCE=real` to connect the frontend through Vite's `/api` proxy.

The development server runs at the URL printed by Vite, normally `http://localhost:5173`.

On first launch, open `/login` to create the owner password and register the displayed QR code or manual key with a standard authenticator application. Subsequent sign-ins accept either the owner password or a fresh six-digit admin authenticator code.

## Validation

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

## Production preview

```bash
corepack pnpm preview
```

## Project structure

```text
src/
  components/    Shared dashboard and UI components
  hooks/         React hooks that consume the service boundary
  layouts/       Desktop and mobile application shell
  mocks/         In-memory Minecraft dashboard data
  pages/         Global pages and server-management tabs
  services/      Service interfaces plus mock and real adapters
  types/         Shared domain models
  utils/         Domain formatting and display helpers
  App.tsx        Router host and global notifications
  main.tsx       Browser entry point
  routes.tsx     Route configuration
  index.css      Tailwind layers, theme tokens, and global styles
```

```text
server/
  auth*.ts       Authentication, TOTP, sessions, CSRF, and secure auth storage
  app.ts         REST/WebSocket routes and domain operations
  processManager.ts  Safe Minecraft process and console lifecycle
  security.ts    Root sandbox, traversal, symlink, and read-only policy
  software*.ts   Official software catalogs, cache, download validation, and installers
  store.ts       Atomic local metadata persistence
```

## Service and mock architecture

The dashboard keeps presentation code separate from data access:

```text
Pages and components
        ↓
      Hooks
        ↓
Service interfaces and exports
        ↓
Selected mock or real adapter
```

`src/services/index.ts` selects the adapter through `VITE_DATA_SOURCE=mock|real`. Pages and hooks do not depend on the backend implementation.

## Backend

The backend is included and covers the complete service interface. It stores runtime metadata under `.data/`, keeps authentication and hashed session data under ignored `.data/auth/`, confines Minecraft files to `MINECRAFT_SERVERS_ROOT`, and supports an enforced `DASHBOARD_READ_ONLY=true` mode.

Minecraft stdout, stderr, commands, and DarkCraft process diagnostics are retained in each server's `.darkcraft/console/` directory. The active append-only log rotates into historical files instead of being truncated on server or dashboard restarts. Configure the active-file size with `DASHBOARD_CONSOLE_LOG_MAX_MB` and the number of retained rotated files with `DASHBOARD_CONSOLE_LOG_RETENTION_FILES`.

Per-server runtime metric history and evidence-backed mod diagnostics are retained beneath each server's `.darkcraft/` directory. Metrics are sampled every 10 seconds, bounded to the latest 24 hours, and downsampled for graph responses. TPS, MSPT, and per-process network values remain unavailable until a reliable collector is configured.

The Create Server wizard retrieves Vanilla, Paper, Purpur, Fabric, Forge, and NeoForge versions from their official metadata services. Metadata is cached under ignored `.data/catalog/`; **Refresh Versions** clears and rebuilds that cache. Server artifacts are downloaded only into the new server's `.data/servers/` directory, checked against published size/checksum data when available, and validated as JAR archives. Forge and NeoForge installers run in server-install mode, while Fabric uses its official executable server launcher. DarkCraft records compatible update availability but never upgrades an existing server automatically.

For production, build with `VITE_DATA_SOURCE=real`, keep the backend bound to `127.0.0.1:8787`, and proxy both HTTP and WebSocket traffic through Nginx. Set `DASHBOARD_ALLOWED_ORIGINS=https://darkcraft.projectdarkhope.xyz` and leave `DASHBOARD_SECURE_COOKIES=true`. Nginx must preserve the `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers and forward WebSocket `Upgrade` and `Connection` headers.

Set `VITE_MINECRAFT_PUBLIC_HOST` in `.env.production.local` to the Minecraft host's player-facing IP or DNS name, without a port (for example `203.0.113.42`). Rebuild the frontend after changing it. Dashboard cards, both Servers views, and Overview use this host when `server-ip` is blank, `0.0.0.0`, or `::`, combined with each server's actual port. Explicit non-wildcard bindings remain unchanged; an unknown wildcard destination displays `N/A`. This presentation setting does not change `server.properties`, bind Minecraft to a public interface, open firewall ports, or assume the dashboard domain also routes Minecraft traffic. The production override stays out of Git.

Production builds emit `dist/` and `dist-server/`. Run the combined service with `corepack pnpm start`. See [docs/BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md) for endpoints, security guarantees and deployment boundaries.

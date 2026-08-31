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
  app.ts         REST/WebSocket routes and domain operations
  processManager.ts  Safe Minecraft process and console lifecycle
  security.ts    Root sandbox, traversal, symlink, and read-only policy
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

The backend is included and covers the complete service interface. It stores runtime metadata under `.data/`, confines Minecraft files to `MINECRAFT_SERVERS_ROOT`, and supports an enforced `DASHBOARD_READ_ONLY=true` mode.

Production builds emit `dist/` and `dist-server/`. Run the combined service with `corepack pnpm start`. See [docs/BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md) for endpoints, security guarantees and deployment boundaries.

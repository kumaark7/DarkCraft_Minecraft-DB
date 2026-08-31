# Minecraft Server Dashboard

A frontend-only Minecraft server management dashboard built with React, TypeScript, Vite, and Tailwind CSS. The application provides a complete mock-driven interface for managing servers, players, console activity, files, plugins, backups, schedules, bots, notifications, and global settings.

The project currently runs entirely against an in-memory mock service adapter. It does not require a Minecraft server, database, authentication provider, or external API.

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

The development server runs at the URL printed by Vite, normally `http://localhost:5173`.

## Validation

```bash
corepack pnpm typecheck
corepack pnpm lint
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
  services/      Service interfaces and the active mock adapter
  types/         Shared domain models
  utils/         Domain formatting and display helpers
  App.tsx        Router host and global notifications
  main.tsx       Browser entry point
  routes.tsx     Route configuration
  index.css      Tailwind layers, theme tokens, and global styles
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
In-memory mock adapter
```

`src/services/index.ts` is the integration boundary. A future backend adapter can implement the existing interfaces and replace the mock exports without moving mock data into pages or rewriting the dashboard UI.

## Backend integration status

Real Minecraft server operations are intentionally not connected yet. The following areas still require backend implementations:

- server lifecycle and status updates
- live console streaming and command execution
- player, operator, whitelist, and ban management
- file browsing, editing, upload, and download
- plugin and mod operations
- backup and restore jobs
- schedule execution
- bots, activity, logs, and notifications
- persistent global and per-server settings

Keep API URLs, credentials, and environment-specific configuration outside the frontend source when adding the real adapter.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Belldandy is a **local-first personal AI assistant** that runs on your device and communicates through WebChat and chat channels. It's a pnpm monorepo using TypeScript with ESM modules.

**Important workspace boundary**: Only develop in `e:\project\Belldandy\Belldandy`. The sibling `moltbot` directory is read-only reference code.

## Commands

```bash
# Install dependencies
corepack pnpm install

# Start Gateway (default port 28889)
corepack pnpm dev:gateway

# Run tests
corepack pnpm test

# Build all packages
corepack pnpm build

# Pairing management (required for first-time clients)
corepack pnpm pairing:approve <CODE>
corepack pnpm pairing:revoke <CLIENT_ID>
```

## Architecture

### Package Structure

```
packages/
├── belldandy-protocol/   # Shared types: WebSocket frames, events, auth
├── belldandy-agent/      # Agent interface + implementations (MockAgent, OpenAIChatAgent)
└── belldandy-core/       # Gateway server, security/pairing store, CLI binaries

apps/
└── web/public/           # WebChat static frontend (vanilla JS)
```

### Data Flow

1. **WebChat** (`apps/web/public/app.js`) connects via WebSocket
2. **Gateway** (`packages/belldandy-core/src/server.ts`) handles WS handshake, auth, and request routing
3. **Pairing check** (`packages/belldandy-core/src/security/store.ts`) blocks unapproved clients
4. **Agent** (`packages/belldandy-agent/src/index.ts`) processes messages and yields streaming responses
5. Gateway broadcasts `chat.delta` and `chat.final` events back to client

### WebSocket Protocol

Defined in `packages/belldandy-protocol/src/index.ts`:

- **Handshake**: `connect.challenge` → `connect` → `hello-ok`
- **Requests**: `req` (method + params) → `res` (ok/error)
- **Events**: `chat.delta`, `chat.final`, `agent.status`, `pairing.required`
- **Auth modes**: `none`, `token`, `password`

### Security Model

Default-deny pairing system in `packages/belldandy-core/src/security/store.ts`:
- Unknown clients receive a pairing code instead of responses
- Approved client IDs stored in `~/.belldandy/allowlist.json`
- Pending codes stored in `~/.belldandy/pairing.json` (1-hour TTL)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BELLDANDY_PORT` | Gateway port (default: 28889) |
| `BELLDANDY_AUTH_MODE` | `none` / `token` / `password` |
| `BELLDANDY_AUTH_TOKEN` | Required when AUTH_MODE=token |
| `BELLDANDY_AUTH_PASSWORD` | Required when AUTH_MODE=password |
| `BELLDANDY_AGENT_PROVIDER` | `mock` / `openai` (default: mock) |
| `BELLDANDY_OPENAI_BASE_URL` | OpenAI-compatible API base URL |
| `BELLDANDY_OPENAI_API_KEY` | API key (env only, never commit) |
| `BELLDANDY_OPENAI_MODEL` | Model name |
| `BELLDANDY_STATE_DIR` | Pairing/allowlist storage (default: ~/.belldandy) |
| `BELLDANDY_WEB_ROOT` | WebChat static files path |

Use `.env.local` for persistent local configuration.

## Key Entry Points

- **Gateway startup**: `packages/belldandy-core/src/bin/gateway.ts`
- **Server implementation**: `packages/belldandy-core/src/server.ts`
- **Agent interface**: `packages/belldandy-agent/src/index.ts` (`BelldandyAgent`)
- **OpenAI provider**: `packages/belldandy-agent/src/openai.ts`
- **Pairing logic**: `packages/belldandy-core/src/security/store.ts`
- **WebChat client**: `apps/web/public/app.js`

## Adding a New Agent Provider

1. Implement `BelldandyAgent` interface (async generator yielding `AgentStreamItem`)
2. Export from `packages/belldandy-agent/src/index.ts`
3. Add env-based selection in `packages/belldandy-core/src/bin/gateway.ts`

## Tech Stack

- Node.js ≥22.12.0, pnpm 10.x
- TypeScript with project references (`tsc -b`)
- Express 5 + ws for HTTP/WebSocket
- Vitest for testing
- tsx for development execution

# payload-better-auth

A Payload CMS plugin that integrates [Better Auth](https://better-auth.com) for seamless user authentication and management.

## Features

- **Better Auth as Single Source of Truth** — All user operations managed through Better Auth
- **SecondaryStorage Pattern** — Pluggable storage with SQLite (dev) or Redis (production)
- **Instant Session Validation** — Payload reads sessions directly from shared storage (no HTTP calls)
- **Automatic Session Invalidation** — Logout in Better Auth immediately invalidates Payload sessions
- **Horizontal Scaling** — Redis adapter supports multiple instances
- **Timestamp-based Coordination** — Automatic reconciliation without race conditions
- **Custom Login UI** — Replaces Payload's default login with Better Auth authentication

## Installation

```bash
pnpm add payload-better-auth better-auth
```

**Requirements:** Node.js 22+ (for native SQLite), Better Auth 1.4.10+, Payload CMS 3.37.0+

## Quick Start

### 1. Create Shared Storage & EventBus

```typescript
// lib/syncAdapter.ts
import { DatabaseSync } from 'node:sqlite'
import { createSqliteStorage } from 'payload-better-auth/storage'

const db = new DatabaseSync('.sync-state.db')
export const storage = createSqliteStorage({ db })

// lib/eventBus.ts
import { DatabaseSync } from 'node:sqlite'
import { createSqlitePollingEventBus } from 'payload-better-auth/eventBus'

const db = new DatabaseSync('.event-bus.db')
export const eventBus = createSqlitePollingEventBus({ db })
```

### 2. Configure Better Auth

```typescript
// lib/auth.ts
import { betterAuth } from 'better-auth'
import { admin, apiKey } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { payloadBetterAuthPlugin } from 'payload-better-auth'
import buildConfig from './payload.config.js'
import { eventBus } from './eventBus'
import { storage } from './syncAdapter'

export const auth = betterAuth({
  database: new Database(process.env.BETTER_AUTH_DB_PATH || './better-auth.db'),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  plugins: [
    admin(),
    apiKey(),
    payloadBetterAuthPlugin({
      payloadConfig: buildConfig,
      token: process.env.RECONCILE_TOKEN,
      storage,   // Shared with Payload plugin
      eventBus,  // Shared with Payload plugin
    }),
  ],
})
```

### 3. Configure Payload

```typescript
// payload.config.ts
import { buildConfig } from 'payload'
import { betterAuthPayloadPlugin } from 'payload-better-auth'
import { eventBus } from './lib/eventBus'
import { storage } from './lib/syncAdapter'

export default buildConfig({
  plugins: [
    betterAuthPayloadPlugin({
      betterAuthClientOptions: {
        externalBaseURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
        internalBaseURL: process.env.INTERNAL_SERVER_URL || 'http://localhost:3000',
      },
      storage,   // Shared with Better Auth plugin
      eventBus,  // Shared with Better Auth plugin
    }),
  ],
  // ... rest of your config
})
```

### 4. Set Environment Variables

```bash
BETTER_AUTH_SECRET=your-secret-min-32-chars
BETTER_AUTH_DB_PATH=./better-auth.db
BA_TO_PAYLOAD_SECRET=your-sync-secret
RECONCILE_TOKEN=your-api-token
PAYLOAD_SECRET=your-payload-secret
DATABASE_URI=file:./payload.db
```

## Production Setup with Redis

For multi-server or geo-distributed deployments, use the Redis storage and EventBus adapters:

```typescript
// lib/syncAdapter.ts
import { createRedisStorage } from 'payload-better-auth/storage'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)
export const storage = createRedisStorage({ redis })

// lib/eventBus.ts
import { createRedisEventBus } from 'payload-better-auth/eventBus'
import Redis from 'ioredis'

// Redis Pub/Sub requires separate connections for publishing and subscribing
const publisher = new Redis(process.env.REDIS_URL)
const subscriber = new Redis(process.env.REDIS_URL)
export const eventBus = createRedisEventBus({ publisher, subscriber })
```

Then pass the **same instances** to both plugins:

```typescript
// In Better Auth config:
payloadBetterAuthPlugin({ 
  storage,
  eventBus,
  payloadConfig: buildConfig,
  token: process.env.RECONCILE_TOKEN,
})

// In Payload config:
betterAuthPayloadPlugin({ 
  storage,
  eventBus,
  betterAuthClientOptions: { ... },
})
```

## Documentation

For detailed configuration options, API endpoints, architecture details, and production considerations, see the **[MANUAL.md](./MANUAL.md)**.

## Development

### Getting Started

```bash
# Install dependencies
pnpm install

# Reset databases and run migrations
pnpm reset

# Start development server
pnpm dev
```

The dev server starts at [http://localhost:3000](http://localhost:3000) with a mail server at port 1080.

### Git Hooks

This project uses [Husky](https://typicode.github.io/husky/) for Git hooks:

- **pre-commit**: Builds the plugin and stages `dist/`, blocks manual version changes
- **pre-push**: Runs lint, typecheck, and tests before pushing
- **commit-msg**: Validates commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

When you're happy with your changes, just commit — the build is handled for you!

### Versioning & Releases

This project uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning. **Do not manually edit the `version` field in `package.json`** — it will be rejected by the pre-commit hook.

Versions are determined automatically from your commit messages:

| Commit Type | Version Bump | Example |
|-------------|--------------|---------|
| `fix:` | Patch (1.0.0 → 1.0.1) | `fix: resolve login redirect bug` |
| `feat:` | Minor (1.0.0 → 1.1.0) | `feat: add OAuth provider support` |
| `feat!:` or `BREAKING CHANGE:` | Major (1.0.0 → 2.0.0) | `feat!: redesign auth API` |

When you push to `main`, the CI will automatically:
1. Analyze commits since the last release
2. Determine the next version
3. Update `package.json` and `CHANGELOG.md`
4. Create a Git tag and GitHub Release

#### Installing Specific Versions

```bash
# Latest
pnpm add github:benjaminpreiss/payload-better-auth

# Specific version
pnpm add github:benjaminpreiss/payload-better-auth#v1.2.0
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server with mail server |
| `pnpm build` | Build the plugin |
| `pnpm reset` | Reset databases and run all migrations |
| `pnpm test` | Run all tests |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm generate:types` | Generate Payload types |

### Project Structure

```
├── src/                    # Plugin source code
│   ├── storage/            # SecondaryStorage implementations (SQLite, Redis)
│   ├── eventBus/           # EventBus implementations (SQLite polling, Redis Pub/Sub)
│   ├── better-auth/        # Better Auth integration & reconcile queue
│   ├── collections/        # Payload collections (Users)
│   ├── components/         # React components (Login UI)
│   ├── payload/            # Payload plugin
│   ├── shared/             # Shared utilities (deduplicated logger)
│   └── exports/            # Client/RSC exports
├── dev/                    # Development environment
│   ├── app/                # Next.js app
│   ├── lib/                # Dev configuration
│   └── tests/              # Test files
└── dist/                   # Built output
```

## License

MIT

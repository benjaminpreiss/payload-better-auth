# payload-better-auth Manual

Complete documentation for integrating Better Auth with Payload CMS.

## Table of Contents

- [Architecture](#architecture)
- [Storage Adapters](#storage-adapters)
- [EventBus](#eventbus)
- [Environment Variables](#environment-variables)
- [Configuration](#configuration)
- [Configuration Options Reference](#configuration-options-reference)
- [Sync Flow](#sync-flow)
  - [Better Auth User Schema Extension](#better-auth-user-schema-extension)
  - [Session Flow](#session-flow)
  - [Startup Coordination](#startup-coordination)
  - [User Sync (Queue-based)](#user-sync-queue-based)
  - [Session Validation](#session-validation)
- [API Endpoints](#api-endpoints)
- [Monitoring & Debugging](#monitoring--debugging)
- [Production Considerations](#production-considerations)

---

## Architecture

### Overview

Better Auth serves as the **single source of truth** for all user operations. The SecondaryStorage provides a shared key-value store for sessions, timestamps, and coordination between Better Auth and Payload CMS.

```
┌─────────────────┐                           ┌─────────────────┐
│   Better Auth   │                           │   Payload CMS   │
│                 │                           │                 │
│  - Sets BA      │     ┌─────────────────┐   │  - Sets Payload │
│    timestamp    │────▶│ SecondaryStorage│◀──│    timestamp    │
│  - Writes       │     │                 │   │  - Reads        │
│    sessions     │     │  Sessions (KV)  │   │    sessions     │
│  - Enqueues     │     │  Timestamps     │   │                 │
│    user sync    │     │  Nonces         │   │                 │
│                 │     └─────────────────┘   │                 │
│                 │                           │                 │
│                 │     ┌─────────────────┐   │                 │
│  - Notifies     │────▶│    EventBus     │◀──│  - Subscribes   │
│    timestamp    │     │                 │   │    to timestamp │
│    changes      │     │ Timestamp Events│   │    changes      │
└─────────────────┘     └─────────────────┘   └─────────────────┘
```

### Core Components

| Component | Purpose |
|-----------|---------|
| **SecondaryStorage** | Key-value store for sessions, timestamps, nonces |
| **EventBus** | Real-time notifications for timestamp changes |
| **Reconcile Queue** | Background task queue with retry logic |
| **Timestamp Coordination** | Determines when reconciliation should run |
| **Users Collection** | Payload collection with Better Auth session validation |
| **BA Collections** | Auth method data (`__better_auth_email_password`, `__better_auth_magic_link`) |

### Collection Structure

The plugin creates/extends three collections in Payload:

```
users                          # Your users collection (auto-extended)
├── baUserId                   # Better Auth user ID
├── emailPasswordAccount       # Relationship to email-password account
├── magicLinkAccount           # Relationship to magic-link account
└── [your custom fields]       # Preserved from your config

__better_auth_email_password   # Email/password auth data
├── baAccountId                # Better Auth account ID
├── baUserId                   # Better Auth user ID
├── email                      # User email
├── emailVerified              # Verification status
└── user                       # Join field (displays linked user)

__better_auth_magic_link       # Magic link auth data
├── baAccountId                # Better Auth account ID
├── baUserId                   # Better Auth user ID
├── email                      # User email
├── emailVerified              # Verification status
└── user                       # Join field (displays linked user)
```

---

## Storage Adapters

The SecondaryStorage is a simple key-value interface. Choose the right implementation for your deployment.

### SQLite Storage (Development)

Uses Node.js 22+ native SQLite. Suitable for:

- Local development
- Single-instance deployments
- Same-process Better Auth + Payload

```typescript
import { DatabaseSync } from 'node:sqlite'
import { createSqliteStorage } from 'payload-better-auth/storage'

const db = new DatabaseSync('.sync-state.db')
export const storage = createSqliteStorage({ db })
```

**Characteristics:**
- Data persists across HMR and process restarts
- No external dependencies
- Single-process only

### Redis Storage (Production)

For production deployments with:

- Multiple Payload instances
- Geographically distributed services
- Horizontal scaling requirements

```typescript
import { createRedisStorage } from 'payload-better-auth/storage'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)
export const storage = createRedisStorage({ redis })

// With custom prefix (optional)
export const storage = createRedisStorage({ 
  redis, 
  prefix: 'myapp:ba:' // Default: 'ba:'
})
```

**Options:**
- `redis` - Redis client instance (required)
- `prefix` - Key prefix for all stored values (default: `'ba:'`)

**Characteristics:**
- Automatic TTL for sessions and nonces
- Scales horizontally across multiple instances
- Requires Redis server

**Redis Client Compatibility:**

The adapter accepts any Redis client compatible with the `RedisClient` interface:

- ioredis
- node-redis
- Any client with `get`, `set`, `del` methods

### SecondaryStorage Interface

Implement this interface for custom backends:

```typescript
import type { SecondaryStorage } from 'payload-better-auth/storage'

const customStorage: SecondaryStorage = {
  async get(key: string): Promise<string | null> { ... },
  async set(key: string, value: string, ttl?: number): Promise<void> { ... },
  async delete(key: string): Promise<void> { ... },
}
```

---

## EventBus

The EventBus provides real-time notifications for timestamp changes, enabling coordination between Better Auth and Payload.

### Redis EventBus (Production)

Uses Redis Pub/Sub for instant event delivery across distributed servers:

```typescript
import { createRedisEventBus } from 'payload-better-auth/eventBus'
import Redis from 'ioredis'

// Redis Pub/Sub requires separate connections for publishing and subscribing
const publisher = new Redis(process.env.REDIS_URL)
const subscriber = new Redis(process.env.REDIS_URL)
export const eventBus = createRedisEventBus({ publisher, subscriber })
```

**Options:**
- `channelPrefix` - Prefix for Redis Pub/Sub channels (default: `'eventbus:'`)

**Characteristics:**
- Instant event delivery (no polling)
- Scales across multiple servers and processes
- Requires Redis server
- **Recommended for production**

**Important:** Redis Pub/Sub requires two separate connections:
- `publisher` - For sending events (can be shared with other operations)
- `subscriber` - Dedicated connection that enters "subscriber mode"

### SQLite Polling EventBus (Development)

Uses SQLite for cross-process event coordination with polling:

```typescript
import { DatabaseSync } from 'node:sqlite'
import { createSqlitePollingEventBus } from 'payload-better-auth/eventBus'

const db = new DatabaseSync('.event-bus.db')
export const eventBus = createSqlitePollingEventBus({ db })
```

**Options:**
- `pollInterval` - How often to poll for new events (default: 100ms)
- `cleanupInterval` - How often to clean old events (default: 60s)
- `cleanupAge` - Age of events to clean up (default: 60s)

**Characteristics:**
- Works across multiple processes on the same machine
- Higher latency than Redis (polling-based)
- No external dependencies (uses Node.js 22+ native SQLite)
- **Logs warning in staging/production** - use Redis EventBus instead

### EventBus Interface

Implement this interface for custom backends:

```typescript
import type { EventBus } from 'payload-better-auth/eventBus'

const customEventBus: EventBus = {
  notifyTimestampChange(service: string, timestamp: number): void { ... },
  subscribeToTimestamp(service: string, handler: (ts: number) => void): () => void { ... },
}
```

---

## Environment Variables

```bash
# ══════════════════════════════════════════════════════════════
# PAYLOAD CMS
# ══════════════════════════════════════════════════════════════
DATABASE_URI=file:./payload.db          # SQLite, MongoDB, or PostgreSQL
PAYLOAD_SECRET=your-payload-secret      # JWT encryption key
NEXT_PUBLIC_SERVER_URL=http://localhost:3000  # No trailing slash

# ══════════════════════════════════════════════════════════════
# BETTER AUTH
# ══════════════════════════════════════════════════════════════
BETTER_AUTH_SECRET=your-secret-min-32-chars  # JWT signing (required)
BETTER_AUTH_DB_PATH=./better-auth.db         # SQLite database path
BETTER_AUTH_URL=http://localhost:3000        # Base URL for reconcile triggers

# ══════════════════════════════════════════════════════════════
# SYNC CONFIGURATION
# ══════════════════════════════════════════════════════════════
BA_TO_PAYLOAD_SECRET=your-sync-secret   # Signs sync operations (required)
RECONCILE_TOKEN=your-api-token          # Protects reconcile API endpoints

# ══════════════════════════════════════════════════════════════
# REDIS (optional, for distributed deployments)
# ══════════════════════════════════════════════════════════════
REDIS_URL=redis://localhost:6379        # Redis connection URL
```

---

## Configuration

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

### 2. Better Auth Setup

```typescript
// lib/auth.ts
import { betterAuth } from 'better-auth'
import { admin, apiKey } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { payloadBetterAuthPlugin } from 'payload-better-auth'
import type { User } from './payload-types' // Generated by Payload
import buildConfig from './payload.config.js'
import { eventBus } from './eventBus'
import { storage } from './syncAdapter'

export const auth = betterAuth({
  database: new Database(process.env.BETTER_AUTH_DB_PATH || './better-auth.db'),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },

  plugins: [
    admin(),    // Required: user management API
    apiKey(),   // Required: admin session authentication
    payloadBetterAuthPlugin<User>({
      payloadConfig: buildConfig,
      token: process.env.RECONCILE_TOKEN || 'reconcile-api-token',
      storage,
      eventBus,
      tickMs: 1000,
      reconcileEveryMs: 30 * 60_000,  // 30 minutes
      // Map Better Auth user to your Payload user fields
      mapUserToPayload: (baUser) => ({
        email: baUser.email ?? '',
        name: baUser.name ?? '',
        // Add defaults for any required fields
      }),
    }),
  ],
})
```

### 3. Payload Setup

```typescript
// payload.config.ts
import { buildConfig } from 'payload'
import { betterAuthPayloadPlugin } from 'payload-better-auth'
import { eventBus } from './lib/eventBus'
import { storage } from './lib/syncAdapter'

export default buildConfig({
  collections: [
    // Optional: Define your own users collection - it will be auto-extended
    {
      slug: 'users',
      fields: [
        { name: 'email', type: 'email', required: true },
        { name: 'name', type: 'text' },
        // Add your custom fields...
      ],
      // Your access rules are preserved and OR'd with BA sync access
      access: {
        read: ({ req }) => Boolean(req.user),
      },
    },
  ],
  plugins: [
    betterAuthPayloadPlugin({
      betterAuthClientOptions: {
        externalBaseURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
        internalBaseURL: process.env.INTERNAL_SERVER_URL || 'http://localhost:3000',
      },
      storage,
      eventBus,
      collectionPrefix: '__better_auth', // optional, this is the default
      debug: process.env.NODE_ENV === 'development',
    }),
  ],
  // ... other config
})
```

### 4. Users Collection (Auto-extended)

The plugin automatically extends your users collection (or creates a minimal one) with:

- **Session validation from storage**: Reads sessions directly from SecondaryStorage
- **Signed access control**: BA sync operations always pass via signature verification
- **Composable access**: Your access rules are preserved and OR'd with BA sync access
- **Relationship fields**: `emailPasswordAccount`, `magicLinkAccount` linking to BA collections
- **baUserId field**: Links Payload users to Better Auth users

### 5. Better Auth Collections (Auto-created)

The plugin creates two additional collections for auth method data:

- `__better_auth_email_password` - Email/password account data
- `__better_auth_magic_link` - Magic link account data

**Access Control:**

| Operation | Default | Extensible? |
|-----------|---------|-------------|
| `create` | BA sync only | No |
| `update` | BA sync only | No |
| `delete` | BA sync only | Yes (OR'd) |
| `read` | BA sync only | Yes (OR'd) |

All fields are read-only in the admin UI - only the sync agent can modify them.

---

## Configuration Options Reference

### Better Auth Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `payloadConfig` | `Promise<SanitizedConfig>` | **required** | Your Payload config promise |
| `token` | `string` | **required** | Auth token for reconcile API endpoints |
| `storage` | `SecondaryStorage` | **required** | Shared storage adapter |
| `eventBus` | `EventBus` | **required** | Shared event bus |
| `mapUserToPayload` | `(baUser) => UserData` | **required** | Maps BA user to Payload user fields |
| `collectionPrefix` | `string` | `'__better_auth'` | Prefix for BA collection slugs |
| `usersSlug` | `string` | `'users'` | Slug for the Payload users collection |
| `tickMs` | `number` | `1000` | Queue processing interval in ms |
| `reconcileEveryMs` | `number` | `1800000` | Full reconcile interval in ms (30 min) |
| `enableLogging` | `boolean` | `false` | Enable debug logging |

### Payload Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `betterAuthClientOptions` | `object` | **required** | Auth client configuration |
| `storage` | `SecondaryStorage` | **required** | Shared storage adapter |
| `eventBus` | `EventBus` | **required** | Shared event bus |
| `collectionPrefix` | `string` | `'__better_auth'` | Prefix for BA collection slugs |
| `debug` | `boolean` | `false` | Enable debug logging and show BA collections in admin |
| `disabled` | `boolean` | `false` | Disable the plugin |
| `baCollectionsAccess` | `object` | `undefined` | Custom access rules for BA collections (`read`, `delete`) |

### Debug Mode

When `debug: true` is set in the Payload plugin options:

1. **Debug logging** is enabled for troubleshooting connection issues
2. **BA collections are visible** in the admin panel under the "Better Auth (DEBUG)" group
3. **Authenticated users can read** BA collections (unless `baCollectionsAccess` overrides this)

This allows you to inspect the `__better_auth_email_password` and `__better_auth_magic_link` collections during development. In production, these collections remain hidden but continue to function normally for the sync agent.

### Custom BA Collections Access

Use `baCollectionsAccess` to define custom access rules for the Better Auth collections. This overrides the default debug-mode access:

```typescript
betterAuthPayloadPlugin({
  // ... other options
  baCollectionsAccess: {
    read: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
})
```

**Note:** `create` and `update` operations are always restricted to the BA sync agent only - they cannot be customized.

---

## Sync Flow

### Better Auth User Schema Extension

The plugin extends Better Auth's user schema with:

| Field | Type | Description |
|-------|------|-------------|
| `locale` | `string` (optional) | User's locale preference, captured from `User-Locale` header during sign-up |

This allows capturing the user's preferred locale during registration for localization purposes.

### Session Flow

1. User logs in via Better Auth
2. Better Auth writes session to SecondaryStorage (via `secondaryStorage` option)
3. Request hits Payload with session cookie
4. Payload reads session directly from SecondaryStorage (no HTTP call)
5. On logout, Better Auth deletes session from storage
6. Next Payload request sees no session → user is logged out

### Startup Coordination

The plugins use timestamp-based coordination to ensure reconciliation runs exactly once after both services are online.

1. **Payload starts** → Sets `timestamp:payload` in storage, notifies via EventBus
2. **Better Auth starts** → Checks timestamps:
   - If `timestamp:payload > timestamp:better-auth`: Run reconciliation
   - Otherwise: Subscribe to Payload timestamp changes via EventBus
3. **On Payload restart** → Better Auth is notified via EventBus, triggers reconciliation

```
Payload starts:
  ├── Set timestamp:payload = now() in storage
  └── Notify via eventBus.notifyTimestampChange('payload', now())

Better Auth starts:
  ├── Get timestamp:payload from storage
  ├── Get timestamp:better-auth from storage
  │
  ├── If payload_ts > ba_ts:
  │   ├── Set timestamp:better-auth = now()
  │   └── Run reconciliation
  │
  └── Else:
      └── Subscribe to payload timestamp via eventBus
```

### User Sync (Queue-based)

All user synchronization from Better Auth to Payload goes through the reconciliation queue:

1. User operation in Better Auth triggers database hook
2. Hook enqueues ensure/delete task to the queue
3. Queue processes task with retry logic
4. For each user:
   - Fetch accounts from Better Auth (email-password, magic-link, etc.)
   - Create/update BA collection entries (`__better_auth_email_password`, `__better_auth_magic_link`)
   - Create/update Payload user with `mapUserToPayload` callback
   - Set relationships from user to BA collection entries
5. For deletes: Remove BA collection entries first, then the user

**Schema Updates:** When updating users, `mapUserToPayload` is re-applied, allowing you to fill defaults for new required fields.

### Session Validation

1. Request hits Payload with session cookie
2. Payload extracts token from cookie (first part before `.`)
3. Payload reads session from `storage.get(token)`
4. If valid and not expired, authenticate; otherwise reject
5. On logout, Better Auth deletes session from storage
6. Next request immediately sees session is gone

---

## API Endpoints

Reconcile endpoints require the `x-reconcile-token` header. Utility endpoints (`/auth/methods`, `/auth/warmup`) are public.

### GET `/api/auth/reconcile/status`

Returns queue status and metrics.

```bash
curl -H "x-reconcile-token: your-token" http://localhost:3000/api/auth/reconcile/status
```

**Response:**
```json
{
  "queueSize": 10,
  "userOperationTasks": 5,
  "fullReconcileTasks": 5,
  "processing": false,
  "reconciling": false,
  "processed": 1250,
  "failed": 2,
  "lastError": null,
  "lastSeedAt": "2024-01-15T10:30:00.000Z"
}
```

### POST `/api/auth/reconcile/run`

Triggers immediate full reconciliation.

```bash
curl -X POST -H "x-reconcile-token: your-token" http://localhost:3000/api/auth/reconcile/run
```

### POST `/api/auth/reconcile/ensure`

Manually sync a specific user to Payload.

```bash
curl -X POST -H "x-reconcile-token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"user": {"id": "user-id", "email": "user@example.com"}}' \
  http://localhost:3000/api/auth/reconcile/ensure
```

### POST `/api/auth/reconcile/delete`

Manually delete a user from Payload.

```bash
curl -X POST -H "x-reconcile-token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"baId": "user-id"}' \
  http://localhost:3000/api/auth/reconcile/delete
```

### GET `/api/auth/methods`

Returns the enabled authentication methods. No token required.

```bash
curl http://localhost:3000/api/auth/methods
```

**Response:**
```json
[
  {
    "method": "emailAndPassword",
    "options": { "minPasswordLength": 8 }
  },
  {
    "method": "magicLink"
  }
]
```

### GET `/api/auth/warmup`

Triggers Better Auth plugin initialization without authentication. Returns instance info. No token required.

```bash
curl http://localhost:3000/api/auth/warmup
```

**Response:**
```json
{
  "initialized": true,
  "pluginId": "reconcile-queue-plugin",
  "authMethods": ["emailAndPassword", "magicLink"],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

This endpoint is called automatically by the Payload plugin during initialization to ensure Better Auth is ready.

---

## Monitoring & Debugging

### Log Prefixes

| Prefix | Source |
|--------|--------|
| `[payload]` | Payload plugin operations |
| `[better-auth]` | Better Auth plugin operations |
| `[reconcile]` | Reconcile queue operations |

### Common Issues

| Issue | Solution |
|-------|----------|
| **Signature verification failures** | Ensure `BA_TO_PAYLOAD_SECRET` matches in both systems |
| **Session not found** | Check that the same `storage` is passed to both plugins |
| **Reconciliation not running** | Verify timestamp coordination is working (check logs) |
| **Redis connection errors** | Verify `REDIS_URL` and network connectivity |
| **Session not in storage** | Ensure Better Auth plugin is passing `secondaryStorage` correctly |

---

## Production Considerations

### Security

- Use **strong, randomly generated secrets** for all tokens
- Store secrets in secure secret management (not .env files in production)
- Rotate `RECONCILE_TOKEN` and `BA_TO_PAYLOAD_SECRET` periodically

### Database

- **Backup both databases**: Better Auth and Payload databases must stay in sync
- Monitor for database connection limits with multiple processes
- Consider read replicas for high-traffic reconciliation

### Redis (for distributed deployments)

- Use **both** `createRedisStorage` and `createRedisEventBus` for production
- Redis EventBus requires 2 connections per process (publisher + subscriber)
- Use Redis Cluster or Redis Sentinel for high availability
- Configure appropriate maxmemory and eviction policies
- Monitor Redis memory usage and connection counts
- Sessions have automatic TTL, no manual cleanup needed

### Monitoring

- Set up alerts for queue status endpoint
- Monitor error rates and failed task counts
- Track reconciliation duration for performance regressions

### Scaling

- Each Payload instance shares state via SecondaryStorage
- Use Redis storage for horizontal scaling
- Adjust `reconcileEveryMs` based on user activity and consistency requirements

---

## License

MIT

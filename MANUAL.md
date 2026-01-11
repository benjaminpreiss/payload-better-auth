# payload-better-auth Manual

Complete documentation for integrating Better Auth with Payload CMS.

## Table of Contents

- [Architecture](#architecture)
- [Environment Variables](#environment-variables)
- [Configuration](#configuration)
- [Configuration Options Reference](#configuration-options-reference)
- [API Endpoints](#api-endpoints)
- [Monitoring & Debugging](#monitoring--debugging)
- [Production Considerations](#production-considerations)

---

## Architecture

### How It Works

Better Auth serves as the **single source of truth** for all user operations. When users are created, updated, or deleted in Better Auth, the changes are automatically synchronized to Payload CMS.

```
┌─────────────────┐     Database Hooks     ┌─────────────────┐
│   Better Auth   │ ──────────────────────▶│   Payload CMS   │
│  (Source of     │                        │  (Receives      │
│   Truth)        │ ◀────────────────────  │   synced users) │
└─────────────────┘   Reconcile Queue      └─────────────────┘
```

### Core Components

| Component | Purpose |
|-----------|---------|
| **Database Hooks** | Real-time sync on user create/delete via Better Auth hooks |
| **Reconcile Queue** | Background task queue with retry logic and exponential backoff |
| **Crypto Utilities** | HMAC-SHA256 signatures with nonce-based anti-replay protection |
| **Users Collection** | Payload collection with custom Better Auth authentication strategy |
| **Admin Sessions** | Temporary admin users for API access, auto-created and cleaned up |

### Sync Flow

1. **Real-time**: User operations in Better Auth trigger immediate sync via database hooks
2. **Background**: Periodic full reconciliation compares all users between systems
3. **Signed Operations**: All sync requests are cryptographically signed to prevent unauthorized modifications

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
RECONCILE_ON_BOOT=true                  # Run full reconcile on startup
RECONCILE_PRUNE=false                   # Delete orphaned Payload users (use carefully!)
```

---

## Configuration

### 1. Better Auth Setup

```typescript
// lib/auth.ts
import { betterAuth } from 'better-auth'
import { admin, apiKey } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { payloadBetterAuthPlugin } from 'payload-better-auth'
import buildConfig from './payload.config.js'

export const auth = betterAuth({
  database: new Database(process.env.BETTER_AUTH_DB_PATH || './better-auth.db'),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },

  plugins: [
    admin(),    // Required: user management API
    apiKey(),   // Required: admin session authentication
    payloadBetterAuthPlugin({
      payloadConfig: buildConfig,
      token: process.env.RECONCILE_TOKEN || 'reconcile-api-token',
      runOnBoot: process.env.RECONCILE_ON_BOOT !== 'false',
      tickMs: 1000,
      reconcileEveryMs: 30 * 60_000,  // 30 minutes
    }),
  ],
})
```

### 2. Payload Setup

```typescript
// payload.config.ts
import { buildConfig } from 'payload'
import { betterAuthPlugin } from 'payload-better-auth'
import { auth } from './lib/auth.js'

export default buildConfig({
  plugins: [
    betterAuthPlugin({ betterAuth: auth }),
  ],
  // ... other config
})
```

### 3. Users Collection (Auto-configured)

The plugin automatically configures the Users collection with:

- **Custom auth strategy**: Validates Better Auth sessions
- **Signed access control**: Only accepts cryptographically signed operations
- **externalId field**: Links Payload users to Better Auth users

```typescript
// What the plugin configures for you:
{
  slug: 'users',
  auth: {
    disableLocalStrategy: true,
    strategies: [{
      name: 'better-auth',
      authenticate: async ({ headers, payload }) => {
        const session = await auth.api.getSession({ headers })
        if (!session) return { user: null }
        
        const existing = await payload.find({
          collection: 'users',
          where: { externalId: { equals: session.user.id } },
          limit: 1,
        })
        
        return { user: existing.docs[0] ?? /* create user */ }
      },
    }],
  },
  access: {
    create: ({ req }) => verifySignature(req),  // Signed requests only
    delete: ({ req }) => verifySignature(req),
    update: ({ req }) => verifySignature(req),
    read: ({ req }) => Boolean(req.user),
  },
  fields: [
    { name: 'externalId', type: 'text', unique: true, index: true, required: true },
    { name: 'name', type: 'text' },
  ],
}
```

---

## Configuration Options Reference

### Better Auth Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `payloadConfig` | `Promise<SanitizedConfig>` | **required** | Your Payload config promise |
| `token` | `string` | **required** | Auth token for reconcile API endpoints |
| `runOnBoot` | `boolean` | `true` | Run full reconcile on application startup |
| `tickMs` | `number` | `1000` | Queue processing interval in ms |
| `reconcileEveryMs` | `number` | `1800000` | Full reconcile interval in ms (30 min) |
| `forceReset` | `boolean` | `false` | Force reset bootstrap state (testing only) |
| `createAdmins` | `array` | `[]` | Admin users to create on boot |

### Queue Behavior

| Setting | Value | Notes |
|---------|-------|-------|
| Page size | 500 users | Memory-efficient batch processing |
| Retry base delay | `2^attempts × 1000ms` | Exponential backoff |
| Max retry delay | 60,000ms | 1 minute cap |
| Jitter | 0-500ms random | Prevents thundering herd |
| Task deduplication | `${kind}:${userId}` | User ops take priority over reconcile |

### Admin Session Management

The system creates temporary admin users for internal API access:

| Setting | Format | Purpose |
|---------|--------|---------|
| Email | `${processId}-agent@sync-to-payload.agent` | Unique per process |
| API Key | `sync-${processId.substr(0,8)}` | Easy identification |
| Lifecycle | Auto-created/cleaned | Old sessions removed on bootstrap |

---

## API Endpoints

All endpoints require the `x-reconcile-token` header.

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

---

## Monitoring & Debugging

### Log Prefixes

| Prefix | Source |
|--------|--------|
| `[reconcile:xxx]` | General reconcile operations |
| `[admin-session]` | Admin user management |
| `[queue]` | Task processing |

### Common Issues

| Issue | Solution |
|-------|----------|
| **Signature verification failures** | Ensure `BA_TO_PAYLOAD_SECRET` matches in both systems |
| **Admin session errors** | Verify Better Auth has `admin` and `apiKey` plugins enabled |
| **Queue stalling** | Check database connectivity and Better Auth API availability |
| **Invalid Base64 errors** | Clear browser cookies, request new magic link |
| **Reconcile token rejected** | Verify `RECONCILE_TOKEN` matches in all configurations |

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

### Monitoring

- Set up alerts for queue status endpoint
- Monitor error rates and failed task counts
- Track reconciliation duration for performance regressions

### Scaling

- Each Node.js process creates its own admin session
- Old admin sessions are cleaned up automatically on bootstrap
- Adjust `reconcileEveryMs` based on user activity and consistency requirements

### Orphan Cleanup

The `RECONCILE_PRUNE=true` option deletes Payload users without corresponding Better Auth users.

⚠️ **Use with caution**: This permanently deletes data. Only enable after verifying your sync is working correctly.

---

## License

MIT



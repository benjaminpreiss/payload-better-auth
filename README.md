# Better Auth to Payload CMS Sync Solution

A comprehensive user synchronization system that integrates Better Auth with Payload CMS, providing seamless user management across both systems while maintaining Better Auth as the single source of truth.

## Overview

This solution provides bidirectional user synchronization between Better Auth and Payload CMS with the following key features:

-   **Better Auth as Single Source of Truth**: All user operations (create, update, delete) are managed through Better Auth
-   **Real-time Sync**: Automatic synchronization of user operations via database hooks
-   **Background Reconciliation**: Periodic full reconciliation to ensure data consistency
-   **Cryptographic Security**: Signed operations prevent unauthorized modifications
-   **Queue-based Processing**: Resilient task queue with retry logic and error handling
-   **Admin Session Management**: Automated creation and cleanup of admin sessions for API access

## Architecture

### Core Components

1. **Better Auth Configuration** ([`lib/auth.ts`](apps/payload-and-frontend/src/lib/auth.ts))

    - Configured with `admin` and `apiKey` plugins
    - Database hooks for real-time user creation sync
    - User deletion callbacks for cleanup operations
    - Reconcile queue plugin for background processing

2. **Reconcile Queue System** ([`lib/reconcile-queue.ts`](apps/payload-and-frontend/src/lib/reconcile-queue.ts))

    - Sophisticated task queue for sync operations
    - Bootstrap functionality with admin session management
    - Paginated processing for large datasets
    - Automatic retry with exponential backoff

3. **Better Auth Plugin** ([`lib/betterAuthPlugin.ts`](apps/payload-and-frontend/src/lib/betterAuthPlugin.ts))

    - REST API endpoints for reconcile operations
    - Token-based authentication for admin endpoints
    - Manual trigger capabilities for sync operations

4. **Payload User Collection** ([`collections/Users/index.ts`](apps/payload-and-frontend/src/collections/Users/index.ts))

    - Custom Better Auth authentication strategy
    - Cryptographic signature verification
    - Prevents manual user management through Payload admin
    - Uses `externalId` field to link to Better Auth users

5. **Sync Functions** ([`lib/sources.ts`](apps/payload-and-frontend/src/lib/sources.ts))

    - User synchronization between systems
    - Admin session creation and cleanup
    - Paginated data loading for efficient processing

6. **Cryptographic Utilities** ([`lib/crypto-shared.ts`](apps/payload-and-frontend/src/lib/crypto-shared.ts))
    - HMAC-SHA256 signature generation and verification
    - Anti-replay protection with nonces
    - Canonical JSON serialization for consistent signing

## Setup Requirements

### Prerequisites

-   Node.js 18.20.2+ or 20.9.0+
-   Better Auth with `admin` and `apiKey` plugins
-   Payload CMS 3.55.1+
-   SQLite database (or compatible adapter)

### Required Environment Variables

```bash
# ===== PAYLOAD CMS CONFIGURATION =====
# Database connection string for Payload CMS
DATABASE_URI=file:./payload.db
# Or use MongoDB: DATABASE_URI=mongodb://127.0.0.1/your-database-name
# Or use PostgreSQL: DATABASE_URI=postgresql://127.0.0.1:5432/your-database-name

# Used to encrypt JWT tokens for Payload CMS
PAYLOAD_SECRET=your-payload-secret

# Used to configure CORS, format links and more. No trailing slash
NEXT_PUBLIC_SERVER_URL=http://localhost:3000

# ===== BETTER AUTH CONFIGURATION =====
# Better Auth secret for JWT signing and encryption
BETTER_AUTH_SECRET=your-better-auth-secret

# Database path for Better Auth SQLite database
BETTER_AUTH_DB_PATH=./better-auth.db

# Base URL of your Better Auth server (used by Payload to trigger reconcile)
BETTER_AUTH_URL=http://localhost:3000

# ===== SYNC CONFIGURATION =====
# Secret used to cryptographically sign sync operations between Better Auth and Payload
# This prevents unauthorized user operations and ensures data integrity
BA_TO_PAYLOAD_SECRET=your-internal-sync-secret

# Token for authenticating reconcile API endpoints
# Used to protect admin endpoints like /api/auth/reconcile/run
RECONCILE_TOKEN=your-reconcile-api-token

# Whether to run full reconcile on application boot (default: true)
# Set to 'false' to disable automatic reconcile on startup
RECONCILE_ON_BOOT=true

# Whether to prune orphaned Payload users during reconcile (default: false)
# Set to 'true' to automatically delete Payload users without corresponding Better Auth users
RECONCILE_PRUNE=false
```

## Configuration Steps

### 1. Better Auth Setup

Configure Better Auth with the required plugins and sync hooks:

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { admin, apiKey } from "better-auth/plugins";
import { reconcileQueuePlugin } from "./betterAuthPlugin";
import {
	enqueueDelete,
	enqueueEnsure,
	bootstrapReconcile,
} from "./reconcile-queue";

export const auth = betterAuth({
	database: new Database(
		process.env.BETTER_AUTH_DB_PATH || "./better-auth.db"
	),

	emailAndPassword: { enabled: true },

	// Handle user deletions
	user: {
		deleteUser: {
			enabled: true,
			afterDelete: async (user) => {
				enqueueDelete(user.id, true, "user-operation");
			},
		},
	},

	// Handle user creations
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					enqueueEnsure(user, true, "user-operation");
				},
			},
		},
	},

	plugins: [
		admin(), // Required for user management API
		apiKey(), // Required for admin session authentication
		reconcileQueuePlugin({
			token: process.env.RECONCILE_TOKEN || "reconcile-api-token",
		}),
	],
});

// Bootstrap the reconcile system
bootstrapReconcile(auth, {
	runOnBoot: process.env.RECONCILE_ON_BOOT !== "false",
	tickMs: 1000,
	reconcileEveryMs: 30 * 60_000, // 30 minutes
});
```

### 2. Payload Configuration

Configure Payload to use Better Auth authentication and trigger reconciliation:

```typescript
// payload.config.ts
import { Users } from "./collections/Users";
import { triggerFullReconcile } from "./lib/payload-reconcile";

export default buildConfig({
	collections: [Users /* other collections */],

	// Trigger reconcile on Payload startup
	async onInit(payload) {
		await triggerFullReconcile(payload);
	},
});
```

The reconcile trigger logic is externalized to [`lib/payload-reconcile.ts`](apps/payload-and-frontend/src/lib/payload-reconcile.ts) for better organization and reusability.

### 3. User Collection Setup

Configure the Users collection with Better Auth integration:

```typescript
// collections/Users/index.ts
export const Users: CollectionConfig = {
	slug: "users",

	access: {
		// Only allow sync operations with valid signatures
		create: ({ req }) => basicSigOk(req),
		delete: ({ req }) => basicSigOk(req),
		update: ({ req }) => basicSigOk(req),
		read: authenticated,
	},

	auth: {
		disableLocalStrategy: true,
		strategies: [
			{
				name: "better-auth",
				authenticate: async ({ headers, payload }) => {
					// Validate Better Auth session
					const session = await auth.api.getSession({ headers });
					if (!session) return { user: null };

					// Find or create Payload user
					const existing = await payload.find({
						collection: "users",
						where: { externalId: { equals: session.user.id } },
						limit: 1,
					});

					const doc =
						existing.docs[0] ??
						(await payload.create({
							collection: "users",
							data: { externalId: session.user.id },
						}));

					return { user: { collection: "users", ...doc } };
				},
			},
		],
	},

	fields: [
		{
			name: "externalId",
			type: "text",
			unique: true,
			index: true,
			required: true,
		},
		{ name: "name", type: "text" },
	],
};
```

## Configuration Options

### Better Auth Plugin Configuration

The [`reconcileQueuePlugin`](apps/payload-and-frontend/src/lib/betterAuthPlugin.ts) accepts the following options:

#### `token` (required)

-   **Type**: `string`
-   **Description**: Authentication token for protecting reconcile API endpoints
-   **Environment Variable**: `RECONCILE_TOKEN`
-   **Usage**: All reconcile API endpoints require this token in the `x-reconcile-token` header
-   **Security**: Use a strong, randomly generated token in production

**Example:**

```typescript
reconcileQueuePlugin({
	token: process.env.RECONCILE_TOKEN || "reconcile-api-token",
});
```

### Bootstrap Function Configuration

The [`bootstrapReconcile`](apps/payload-and-frontend/src/lib/reconcile-queue.ts) function accepts a `BootstrapOptions` object with the following properties:

#### `runOnBoot` (optional)

-   **Type**: `boolean`
-   **Default**: `true`
-   **Description**: Whether to automatically trigger a full reconcile when the application starts
-   **Environment Variable**: `RECONCILE_ON_BOOT` (set to `'false'` to disable)
-   **Usage**: Ensures data consistency on application startup

#### `tickMs` (optional)

-   **Type**: `number`
-   **Default**: `1000` (1 second)
-   **Description**: Interval in milliseconds for processing queued tasks
-   **Usage**: Controls how frequently the queue processor checks for pending tasks
-   **Performance**: Lower values provide faster processing but higher CPU usage

#### `reconcileEveryMs` (optional)

-   **Type**: `number`
-   **Default**: `1800000` (30 minutes)
-   **Description**: Interval in milliseconds between automatic full reconciliations
-   **Usage**: Periodic background sync to ensure long-term data consistency
-   **Performance**: Adjust based on your user activity and consistency requirements

#### `forceReset` (optional)

-   **Type**: `boolean`
-   **Default**: `false`
-   **Description**: Forces a complete reset of the bootstrap state
-   **Usage**: Primarily for testing or when explicitly requested
-   **Warning**: Use with caution in production as it clears existing admin sessions

**Example:**

```typescript
bootstrapReconcile(auth, {
	runOnBoot: process.env.RECONCILE_ON_BOOT !== "false",
	tickMs: 1000,
	reconcileEveryMs: 30 * 60_000, // 30 minutes
	forceReset: false,
});
```

### Queue Dependencies Configuration

The reconcile queue system uses several environment-controlled behaviors:

#### `RECONCILE_PRUNE`

-   **Type**: `boolean` (via string comparison)
-   **Default**: `false`
-   **Environment Variable**: `RECONCILE_PRUNE=true`
-   **Description**: Enables automatic cleanup of orphaned Payload users
-   **Behavior**: When enabled, removes Payload users that don't have corresponding Better Auth users
-   **Caution**: Use carefully as this permanently deletes data

#### Page Size Configuration

-   **Default**: `500` users per page
-   **Location**: Hardcoded in [`reconcile-queue.ts`](apps/payload-and-frontend/src/lib/reconcile-queue.ts#L384)
-   **Purpose**: Controls memory usage during large dataset processing
-   **Customization**: Modify the `pageSize` constant for different performance characteristics

### Retry and Error Handling Configuration

The queue system includes built-in retry logic with the following characteristics:

#### Exponential Backoff

-   **Base Delay**: `2^attempts * 1000ms`
-   **Maximum Delay**: `60,000ms` (1 minute)
-   **Jitter**: Random 0-500ms added to prevent thundering herd
-   **Location**: [`reconcile-queue.ts`](apps/payload-and-frontend/src/lib/reconcile-queue.ts#L321-L323)

#### Task Deduplication

-   **Key Format**: `${taskKind}:${userId}`
-   **Behavior**: Prevents duplicate tasks for the same user
-   **Priority**: User operations take precedence over reconcile operations

### Admin Session Configuration

The system automatically creates temporary admin users for API access:

#### Email Pattern

-   **Format**: `${processId}-agent@sync-to-payload.agent`
-   **Purpose**: Unique identification and easy cleanup
-   **Cleanup**: Automatic removal of old admin users on bootstrap

#### API Key Naming

-   **Format**: `sync-${processId.substr(0, 8)}`
-   **Purpose**: Easy identification of sync-related API keys
-   **Lifecycle**: Created and cleaned up with admin users

## Key Features

### Real-time Synchronization

-   **User Creation**: Automatically syncs new Better Auth users to Payload via database hooks
-   **User Deletion**: Cleans up Payload users when deleted from Better Auth
-   **Priority Queue**: User operations are prioritized over background reconciliation

### Background Reconciliation

-   **Full Sync**: Periodic comparison of all users between systems
-   **Orphan Cleanup**: Optional removal of Payload users without corresponding Better Auth users
-   **Paginated Processing**: Efficient handling of large user datasets
-   **Configurable Intervals**: Customizable reconciliation frequency

### Security Features

-   **Cryptographic Signatures**: All sync operations are signed with HMAC-SHA256
-   **Anti-replay Protection**: Nonce-based prevention of operation replay
-   **Token Authentication**: API endpoints protected with configurable tokens
-   **Access Control**: Payload operations restricted to signed requests only

### Admin Session Management

-   **Automatic Creation**: Creates temporary admin users for API access
-   **Process Isolation**: Unique sessions per Node.js process
-   **Cleanup**: Automatic removal of old admin users and API keys
-   **Error Resilience**: Continues operation even if cleanup fails

### Queue Management

-   **Retry Logic**: Exponential backoff with jitter for failed operations
-   **Task Deduplication**: Prevents duplicate operations for the same user
-   **Status Monitoring**: Real-time queue status and metrics
-   **Source Tracking**: Distinguishes between user operations and reconciliation tasks

## API Endpoints

The reconcile plugin provides several admin endpoints:

### GET `/api/auth/reconcile/status`

Returns current queue status and metrics.

**Headers:**

-   `x-reconcile-token`: Your reconcile token

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

Triggers a full reconciliation immediately.

**Headers:**

-   `x-reconcile-token`: Your reconcile token

### POST `/api/auth/reconcile/ensure`

Manually enqueue a user for sync to Payload.

**Headers:**

-   `x-reconcile-token`: Your reconcile token

**Body:**

```json
{
	"user": {
		"id": "user-id",
		"email": "user@example.com"
	}
}
```

### POST `/api/auth/reconcile/delete`

Manually enqueue a user for deletion from Payload.

**Headers:**

-   `x-reconcile-token`: Your reconcile token

**Body:**

```json
{
	"baId": "user-id"
}
```

## Development Commands

```bash
# Generate Payload types (run after configuration changes)
pnpm run generate:types

# Run tests
pnpm run test:int-with-wait

```

## Monitoring and Debugging

### Queue Status Monitoring

Monitor the reconcile queue status via the API endpoint or check logs for processing information:

```bash
curl -H "x-reconcile-token: your-token" \
  http://localhost:3000/api/auth/reconcile/status
```

### Log Messages

The system provides detailed logging with prefixed messages:

-   `[reconcile:process-id]` - General reconcile operations
-   `[admin-session]` - Admin user management
-   `[queue]` - Task processing

### Common Issues

1. **Signature Verification Failures**: Check that `BA_TO_PAYLOAD_SECRET` is consistent
2. **Admin Session Errors**: Ensure Better Auth has `admin` and `apiKey` plugins enabled
3. **Queue Stalling**: Check database connectivity and Better Auth API availability
4. **Reconcile Token Issues**: Verify `RECONCILE_TOKEN` matches in all configurations

## Production Considerations

-   **Database Backups**: Ensure both Better Auth and Payload databases are backed up
-   **Secret Management**: Use secure secret management for `BA_TO_PAYLOAD_SECRET` and `RECONCILE_TOKEN`
-   **Monitoring**: Set up monitoring for queue status and error rates
-   **Scaling**: Consider database connection limits with multiple processes
-   **Cleanup**: Monitor admin user cleanup to prevent database bloat

## License

MIT

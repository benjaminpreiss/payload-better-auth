import { betterAuth } from 'better-auth'
import { admin, apiKey } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { reconcileQueuePlugin } from './betterAuthPlugin'
import { deleteUserFromPayload, syncUserToPayload } from './sources'

// Use environment-specific database path
const dbPath = process.env.BETTER_AUTH_DB_PATH || './better-auth.db'

export const auth = betterAuth({
  database: new Database(dbPath),

  emailAndPassword: { enabled: true },

  // Deletions: only via official callbacks (no DB delete hook)
  user: {
    deleteUser: {
      enabled: true,

      // Do not throw here; deletion already happened in Better Auth.
      afterDelete: async (user) => {
        // push BA-induced delete to the **front** of the queue
        deleteUserFromPayload(user.id)
        // This doesnt work
        // enqueueDelete(user.id, true, 'user-operation')
      },
    },
  },

  // Creations: DB hooks cover all Better-Auth–mediated user inserts
  databaseHooks: {
    user: {
      create: {
        // After the BA user exists, sync to Payload. On failure, enqueue in memory.
        after: async (user) => {
          // push BA-induced ensure to the **front** of the queue
          syncUserToPayload(user)
        },
      },
    },
  },
  plugins: [
    admin(), // Provides the listUsers API for user management
    reconcileQueuePlugin({
      token: process.env.RECONCILE_TOKEN || 'reconcile-api-token',
      runOnBoot: process.env.RECONCILE_ON_BOOT !== 'false',
      tickMs: 1000,
      reconcileEveryMs: 30 * 60_000,
      createAdmins: [
        {
          user: { email: 'sample-admin@user.com', name: 'Sample admin', password: 'bubbletea' },
          overwrite: true,
        },
      ],
    }),
    apiKey(),
  ],
})

import { betterAuth } from 'better-auth'
import { admin, apiKey } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { createDatabaseHooks, payloadBetterAuthPlugin } from 'payload-better-auth'

import buildConfig from '../payload.config.js'

// Use environment-specific database path
const dbPath = process.env.BETTER_AUTH_DB_PATH || './better-auth.db'

export const auth = betterAuth({
  database: new Database(dbPath),

  emailAndPassword: { enabled: true },
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  // Creations: DB hooks cover all Better-Auth–mediated user inserts
  databaseHooks: createDatabaseHooks({ config: buildConfig }),
  plugins: [
    admin(), // Provides the listUsers API for user management
    payloadBetterAuthPlugin({
      createAdmins: [
        {
          overwrite: true,
          user: { name: 'Sample admin', email: 'sample-admin@user.com', password: 'bubbletea' },
        },
      ],
      payloadConfig: buildConfig,
      reconcileEveryMs: 30 * 60_000,
      runOnBoot: process.env.RECONCILE_ON_BOOT !== 'false',
      tickMs: 1000,
      token: process.env.RECONCILE_TOKEN || 'reconcile-api-token',
    }),
    apiKey(),
  ],
})

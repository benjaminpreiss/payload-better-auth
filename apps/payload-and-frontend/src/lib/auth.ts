import { betterAuth } from 'better-auth'
import { admin, apiKey } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { payloadBetterAuthPlugin } from 'payload-better-auth'
import config from '@payload-config'

// Use environment-specific database path
const dbPath = process.env.BETTER_AUTH_DB_PATH || './better-auth.db'

export const auth = betterAuth({
  database: new Database(dbPath),

  emailAndPassword: { enabled: true },
  plugins: [
    admin(), // Provides the listUsers API for user management
    payloadBetterAuthPlugin({
      createAdmins: [
        {
          overwrite: true,
          user: { name: 'Sample admin', email: 'sample-admin@user.com', password: 'bubbletea' },
        },
      ],
      payloadConfig: config,
      reconcileEveryMs: 30 * 60_000,
      runOnBoot: process.env.RECONCILE_ON_BOOT !== 'false',
      tickMs: 1000,
      token: process.env.RECONCILE_TOKEN || 'reconcile-api-token',
    }),
    apiKey(),
  ],
})

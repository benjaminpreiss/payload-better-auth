import type { User } from '@/payload-types'
import type { CollectionSlug } from 'payload'

import { apiKey } from '@better-auth/api-key'
import { betterAuth } from 'better-auth'
import { admin, magicLink } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { payloadBetterAuthPlugin } from 'payload-better-auth'

import buildConfig from '../payload.config'
import { eventBus } from './eventBus'
import { sendEmail } from './sendMails'
import { storage } from './syncAdapter'

// Use environment-specific database path
const dbPath = process.env.BETTER_AUTH_DB_PATH || './better-auth.db'

const betterAuthPortRaw = process.env.BETTER_AUTH_PORT
if (betterAuthPortRaw === undefined) throw new Error('BETTER_AUTH_PORT is required')
const betterAuthUrl = `http://localhost:${betterAuthPortRaw}`

const payloadPortRaw = process.env.PAYLOAD_PORT
if (payloadPortRaw === undefined) throw new Error('PAYLOAD_PORT is required')
const trustedOrigins = [`http://localhost:${payloadPortRaw}`]

export const auth = betterAuth({
  baseURL: betterAuthUrl,
  database: new Database(dbPath),
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,

  emailAndPassword: { enabled: true },
  plugins: [
    admin(), // Provides the listUsers API for user management
    payloadBetterAuthPlugin<User, CollectionSlug>({
      enableLogging: true, // Enable reconciliation logging
      eventBus, // Shared with Payload plugin
      // Map Better Auth user data to Payload user fields
      mapUserToPayload: (baUser) => ({
        name: baUser.name ?? '',
        collection: 'users',
        email: baUser.email ?? '',
      }),
      payloadConfig: buildConfig,
      reconcileEveryMs: 30 * 60_000,
      storage, // Shared with Payload plugin
      tickMs: 1000,
      token: process.env.RECONCILE_TOKEN || 'reconcile-api-token',
    }),
    apiKey(),
    magicLink({
      async sendMagicLink({ email, url }, _request) {
        await sendEmail({
          html: `<!DOCTYPE html>
<html>
  <body>
    <h1>Sign in to your account</h1>
    <p>Click the link below to sign in:</p>
    <p>
      <a href="${url}">Sign in</a>
    </p>
    <p>
      If the button doesn't work, copy and paste this link into your browser:<br>
      ${url}
    </p>
  </body>
</html>`,
          subject: 'Verify Email',
          to: email,
        })
      },
    }),
  ],
})

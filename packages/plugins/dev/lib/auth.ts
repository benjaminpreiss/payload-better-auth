import { betterAuth } from 'better-auth'
import { admin, apiKey, magicLink } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { payloadBetterAuthPlugin } from 'payload-better-auth'

import buildConfig from '../payload.config.js'
import { sendEmail } from './sendMails.js'

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
      payloadConfig: buildConfig,
      reconcileEveryMs: 30 * 60_000,
      runOnBoot: process.env.RECONCILE_ON_BOOT !== 'false',
      tickMs: 1000,
      token: process.env.RECONCILE_TOKEN || 'reconcile-api-token',
    }),
    apiKey(),
    magicLink({
      async sendMagicLink({ email, url }, request) {
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
      If the button doesn’t work, copy and paste this link into your browser:<br>
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

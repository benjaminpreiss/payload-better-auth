// src/sources.ts
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { signCanonical } from './crypto-shared'
import type { User } from '@/payload-types'
import type { Auth } from './auth'

const INTERNAL_SECRET = process.env.BA_TO_PAYLOAD_SECRET!

export type BAUser = { id: string; email?: string | null; [k: string]: any }
export type PayloadUser = Pick<User, 'id' | 'externalId'>

// Better Auth user type for sync operations
export interface BetterAuthUser {
  id: string
  name?: string | null
  email?: string | null
  [k: string]: any
}

/** Load Better-Auth users page by page via the Better-Auth *server API* (Admin plugin). */
export async function listBAUsersPage(
  auth: Auth,
  limit: number,
  offset: number,
  headers: Headers,
): Promise<{ users: BAUser[]; total: number }> {
  const { users, total } = await auth.api.listUsers({
    query: { limit, offset },
    headers,
  })
  return {
    users: users.map((u: BAUser) => ({ id: u.id, email: u.email })),
    total,
  }
}

/** Load Payload users page by page via Local API. */
export async function listPayloadUsersPage(
  limit: number,
  page: number,
): Promise<{ users: PayloadUser[]; total: number; hasNextPage: boolean }> {
  const payload = await getPayload({ config: configPromise })
  const res = await payload.find({
    collection: 'users',
    limit,
    page,
    depth: 0,
    overrideAccess: true,
  })
  return {
    users: res.docs.map((d: User) => ({ id: d.id, externalId: d.externalId })),
    total: res.totalDocs || 0,
    hasNextPage: res.hasNextPage || false,
  }
}

// Better-auth is the single source of truth and manages users through database hooks
// These functions provide bidirectional validation and sync capabilities
/**
 * Sync user from better-auth to Payload
 * This is called from the better-auth hooks
 * Creates a Payload user with externalId, which prevents reverse sync
 */

export async function syncUserToPayload(betterAuthUser: BetterAuthUser) {
  const payload = await getPayload({ config: configPromise })

  // idempotency check (keep as-is)
  const existing = await payload.find({
    collection: 'users',
    where: { externalId: { equals: betterAuthUser.id } },
    limit: 1,
  })
  if (existing.docs.length) return

  const baBody = { op: 'create', userId: betterAuthUser.id } // keep body minimal & stable
  const baSig = signCanonical(baBody, INTERNAL_SECRET)

  await payload.create({
    collection: 'users',
    data: {
      externalId: betterAuthUser.id,
      name: betterAuthUser.name ?? '',
    },
    overrideAccess: false,
    context: { baBody, baSig },
  })
}

// user-sync.ts (delete)
export async function deleteUserFromPayload(betterAuthUserId: string) {
  const payload = await getPayload({ config: configPromise })

  const existing = await payload.find({
    collection: 'users',
    where: { externalId: { equals: betterAuthUserId } },
    limit: 1,
  })
  if (!existing.docs.length) return

  const baBody = { op: 'delete', userId: betterAuthUserId }
  const baSig = signCanonical(baBody, INTERNAL_SECRET)

  await payload.delete({
    collection: 'users',
    id: existing.docs[0].id,
    overrideAccess: false,
    context: { baBody, baSig },
  })
}

// ——— Optional: link an existing Payload user (id-matched) to BA id
export async function attachExternalIdInPayload(payloadUserId: number, baId: string) {
  const payload = await getPayload({ config: configPromise })
  await payload.update({
    collection: 'users',
    id: payloadUserId,
    data: { externalId: baId },
    overrideAccess: true,
  })
}

// Generate a unique process ID for this Node.js process
const PROCESS_ID = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
const EMAIL_SUFFIX = '-agent@sync-to-payload.agent'

export async function createAndGetBAAdminSession({ auth }: { auth: Auth }) {
  const timestamp = Date.now()
  const processEmail = `${PROCESS_ID}${EMAIL_SUFFIX}`

  const newUser = {
    email: processEmail,
    password: 'some-secure-password',
    name: `Payload sync agent`,
    role: 'admin',
  } as const

  console.log(`[admin-session] Creating admin user for process: ${newUser.email}`)

  const { user } = await auth.api.createUser({
    body: newUser,
  })

  console.log(`[admin-session] Created user with ID: ${user.id}`)

  // create api key
  const { key: apiKey } = await auth.api.createApiKey({
    body: {
      name: `sync-${PROCESS_ID.substr(0, 8)}`,
      userId: user.id,
    },
  })

  console.log(`[admin-session] Created API key: ${apiKey.substring(0, 8)}...`)

  const headers = new Headers({
    'x-api-key': apiKey,
  })

  // Simple cleanup: remove old admin users (but be conservative)
  await cleanupOldAdminUsers(auth, headers, processEmail)

  console.log(`[admin-session] Admin session setup complete`)
  return { headers, processId: PROCESS_ID }
}

async function cleanupOldAdminUsers(auth: Auth, headers: Headers, currentUserEmail: string) {
  console.log(`[admin-session] Looking for old admin users to cleanup...`)

  try {
    const { users: oldAdminUsers } = await auth.api.listUsers({
      query: {
        searchValue: EMAIL_SUFFIX,
        searchField: 'email',
        searchOperator: 'ends_with',
        // exclude this current user from deletions
        filterField: 'email',
        filterValue: currentUserEmail,
        filterOperator: 'ne',
      },
      headers,
    })

    console.log(
      `[admin-session] Found ${oldAdminUsers.length} old admin users to cleanup:`,
      oldAdminUsers.map(({ id, email }) => ({ id, email })),
    )

    if (oldAdminUsers.length > 0) {
      // Get all API keys to find which ones belong to old users
      const apiKeys = await auth.api.listApiKeys({
        headers,
      })

      for (const { id: userId, email } of oldAdminUsers) {
        console.log(`[admin-session] Cleaning up old user: ${email} (${userId})`)

        // Find and delete API keys for this user
        const deletableApiKeys = apiKeys.filter(
          ({ userId: apiKeyUserId }) => apiKeyUserId === userId,
        )

        for (const { id: apiKeyId } of deletableApiKeys) {
          try {
            await auth.api.deleteApiKey({
              body: {
                keyId: apiKeyId,
              },
              headers,
            })
            console.log(`[admin-session] Deleted API key: ${apiKeyId}`)
          } catch (error) {
            console.warn(`[admin-session] Failed to delete API key ${apiKeyId}:`, error)
          }
        }

        // Delete the user
        try {
          await auth.api.removeUser({
            body: {
              userId: userId,
            },
            headers,
          })
          console.log(`[admin-session] Deleted old user: ${email} (${userId})`)
        } catch (error) {
          console.warn(`[admin-session] Failed to delete user ${userId}:`, error)
        }
      }
    }
  } catch (error) {
    console.warn(`[admin-session] Cleanup failed, but continuing with new session:`, error)
  }
}

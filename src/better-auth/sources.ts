// src/sources.ts
import { getPayload, type SanitizedConfig } from 'payload'

import { signCanonical } from './crypto-shared'

const INTERNAL_SECRET = process.env.BA_TO_PAYLOAD_SECRET!

export type BAUser = { [k: string]: unknown; email?: null | string; id: string }
export type PayloadUser = { externalId?: null | string; id: number | string }

// Better Auth user type for sync operations
export interface BetterAuthUser {
  [k: string]: unknown
  email?: null | string
  id: string
  name?: null | string
}

// ═══════════════════════════════════════════════════════════════════════════
// Payload Operations
// ═══════════════════════════════════════════════════════════════════════════

/** Create a function to load Payload users page by page via Local API. */
export function createListPayloadUsersPage(config: Promise<SanitizedConfig>) {
  return async function listPayloadUsersPage(
    limit: number,
    page: number,
  ): Promise<{ hasNextPage: boolean; total: number; users: PayloadUser[] }> {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: 'users',
      depth: 0,
      limit,
      overrideAccess: true,
      page,
    })
    return {
      hasNextPage: res.hasNextPage || false,
      total: res.totalDocs || 0,
      users: res.docs.map((d) => ({
        id: d.id,
        externalId: (d as { externalId?: string }).externalId,
      })),
    }
  }
}

/**
 * Create a function to sync user from better-auth to Payload.
 * This is called from the better-auth hooks.
 * Creates a Payload user with externalId, which prevents reverse sync.
 */
export function createSyncUserToPayload(config: Promise<SanitizedConfig>) {
  return async function syncUserToPayload(betterAuthUser: BetterAuthUser) {
    const payload = await getPayload({ config })

    // idempotency check
    const existing = await payload.find({
      collection: 'users',
      limit: 1,
      where: { externalId: { equals: betterAuthUser.id } },
    })
    if (existing.docs.length) {
      return
    }

    const baBody = { op: 'create', userId: betterAuthUser.id }
    const baSig = signCanonical(baBody, INTERNAL_SECRET)

    await payload.create({
      collection: 'users',
      context: { baBody, baSig },
      data: {
        name: betterAuthUser.name ?? '',
        externalId: betterAuthUser.id,
      },
      overrideAccess: false,
    })
  }
}

/** Create a function to delete user from Payload. */
export function createDeleteUserFromPayload(config: Promise<SanitizedConfig>) {
  return async function deleteUserFromPayload(betterAuthUserId: string) {
    const payload = await getPayload({ config })

    const existing = await payload.find({
      collection: 'users',
      limit: 1,
      where: { externalId: { equals: betterAuthUserId } },
    })
    if (!existing.docs.length) {
      return
    }

    const baBody = { op: 'delete', userId: betterAuthUserId }
    const baSig = signCanonical(baBody, INTERNAL_SECRET)

    await payload.delete({
      id: existing.docs[0].id,
      collection: 'users',
      context: { baBody, baSig },
      overrideAccess: false,
    })
  }
}

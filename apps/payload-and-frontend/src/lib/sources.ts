// src/sources.ts
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { signCanonical } from './crypto-shared'
import type { User } from '@/payload-types'

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

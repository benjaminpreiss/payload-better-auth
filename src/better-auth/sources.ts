// src/sources.ts
import { type CollectionSlug, getPayload, type SanitizedConfig } from 'payload'

import { signCanonical } from './crypto-shared'

const INTERNAL_SECRET = process.env.BA_TO_PAYLOAD_SECRET!

export type BAUser = { [k: string]: unknown; email?: null | string; id: string }
export type PayloadUser = { baUserId?: null | string; id: number | string }

// Better Auth user type for sync operations
export interface BetterAuthUser {
  [k: string]: unknown
  email?: null | string
  emailVerified?: boolean
  id: string
  name?: null | string
}

// Better Auth account type
export interface BetterAuthAccount {
  accountId: string
  createdAt: Date
  id: string
  providerId: string
  updatedAt: Date
  userId: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Payload Operations
// ═══════════════════════════════════════════════════════════════════════════

/** Create a function to load Payload users page by page via Local API. */
export function createListPayloadUsersPage<TCollectionSlug extends string>(
  config: Promise<SanitizedConfig>,
  usersSlug: TCollectionSlug,
) {
  return async function listPayloadUsersPage(
    limit: number,
    page: number,
  ): Promise<{ hasNextPage: boolean; total: number; users: PayloadUser[] }> {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: usersSlug as CollectionSlug,
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
        baUserId: (d as { baUserId?: string }).baUserId,
      })),
    }
  }
}

/**
 * Create a function to sync user from better-auth to Payload.
 * This handles creating/updating both BA collection entries and the user.
 */
export function createSyncUserToPayload<TUser extends object, TCollectionSlug extends string>(
  config: Promise<SanitizedConfig>,
  emailPasswordSlug: TCollectionSlug,
  magicLinkSlug: TCollectionSlug,
  usersSlug: TCollectionSlug,
  mapUserToPayload: (
    baUser: BetterAuthUser,
  ) => Omit<TUser, 'baUserId' | 'betterAuthAccounts' | 'createdAt' | 'id' | 'updatedAt'>,
) {
  return async function syncUserToPayload(
    betterAuthUser: BetterAuthUser,
    accounts?: BetterAuthAccount[],
  ) {
    const payload = await getPayload({ config })

    // Map BA user to Payload user data using the callback
    const userData = mapUserToPayload(betterAuthUser)

    // Check if user already exists
    const existing = await payload.find({
      collection: usersSlug as CollectionSlug,
      limit: 1,
      where: { baUserId: { equals: betterAuthUser.id } },
    })

    // Track relationship IDs
    let emailPasswordAccountId: null | number | string = null
    let magicLinkAccountId: null | number | string = null

    // Check if there's a credential (email/password) account
    const hasCredentialAccount = accounts?.some((a) => a.providerId === 'credential')

    // Sync BA collection entries for each account
    if (accounts) {
      for (const account of accounts) {
        if (account.providerId === 'credential') {
          // Email/password account
          const existingBA = await payload.find({
            collection: emailPasswordSlug as CollectionSlug,
            limit: 1,
            where: { baAccountId: { equals: account.id } },
          })

          const baData = {
            baAccountId: account.id,
            baUserId: betterAuthUser.id,
            email: betterAuthUser.email ?? '',
            emailVerified: betterAuthUser.emailVerified ?? false,
          }

          if (existingBA.docs.length) {
            // Update existing
            const baBody = { accountId: account.id, collection: emailPasswordSlug, op: 'update' }
            const baSig = signCanonical(baBody, INTERNAL_SECRET)

            const updated = await payload.update({
              id: existingBA.docs[0].id,
              collection: emailPasswordSlug as CollectionSlug,
              context: { baBody, baSig },
              data: baData,
              overrideAccess: false,
            })
            emailPasswordAccountId = updated.id
          } else {
            // Create new
            const baBody = { accountId: account.id, collection: emailPasswordSlug, op: 'create' }
            const baSig = signCanonical(baBody, INTERNAL_SECRET)

            const created = await payload.create({
              collection: emailPasswordSlug as CollectionSlug,
              context: { baBody, baSig },
              data: baData,
              overrideAccess: false,
            })
            emailPasswordAccountId = created.id
          }
        }
        // Note: Better Auth's magic-link plugin does NOT create account entries,
        // so we handle magic-link detection separately below
      }
    }

    // Magic-link detection: If user is email-verified but has no credential account,
    // they likely authenticated via magic-link. Better Auth's magic-link plugin
    // doesn't create account entries - it only verifies the user's email.
    if (betterAuthUser.emailVerified && !hasCredentialAccount && betterAuthUser.email) {
      // Use a synthetic account ID based on user ID for magic-link
      const syntheticAccountId = `magic-link:${betterAuthUser.id}`

      const existingBA = await payload.find({
        collection: magicLinkSlug as CollectionSlug,
        limit: 1,
        where: { baAccountId: { equals: syntheticAccountId } },
      })

      const baData = {
        baAccountId: syntheticAccountId,
        baUserId: betterAuthUser.id,
        email: betterAuthUser.email,
        emailVerified: true,
      }

      if (existingBA.docs.length) {
        // Update existing
        const baBody = { accountId: syntheticAccountId, collection: magicLinkSlug, op: 'update' }
        const baSig = signCanonical(baBody, INTERNAL_SECRET)

        const updated = await payload.update({
          id: existingBA.docs[0].id,
          collection: magicLinkSlug as CollectionSlug,
          context: { baBody, baSig },
          data: baData,
          overrideAccess: false,
        })
        magicLinkAccountId = updated.id
      } else {
        // Create new
        const baBody = { accountId: syntheticAccountId, collection: magicLinkSlug, op: 'create' }
        const baSig = signCanonical(baBody, INTERNAL_SECRET)

        const created = await payload.create({
          collection: magicLinkSlug as CollectionSlug,
          context: { baBody, baSig },
          data: baData,
          overrideAccess: false,
        })
        magicLinkAccountId = created.id
      }
    }

    // Build polymorphic relationship array for betterAuthAccounts
    // Format: { relationTo: 'collection_slug', value: id }
    const betterAuthAccounts: Array<{ relationTo: string; value: number | string }> = []
    if (emailPasswordAccountId !== null) {
      betterAuthAccounts.push({ relationTo: emailPasswordSlug, value: emailPasswordAccountId })
    }
    if (magicLinkAccountId !== null) {
      betterAuthAccounts.push({ relationTo: magicLinkSlug, value: magicLinkAccountId })
    }

    // Build user data with relationships
    const fullUserData = {
      ...userData,
      baUserId: betterAuthUser.id,
      ...(betterAuthAccounts.length > 0 && { betterAuthAccounts }),
    }

    if (existing.docs.length) {
      // Update existing user (re-apply mapUserToPayload for schema changes)
      const baBody = { collection: usersSlug, op: 'update', userId: betterAuthUser.id }
      const baSig = signCanonical(baBody, INTERNAL_SECRET)

      await payload.update({
        id: existing.docs[0].id,
        collection: usersSlug as CollectionSlug,
        context: { baBody, baSig },
        data: fullUserData,
        overrideAccess: false,
      })
    } else {
      // Create new user
      const baBody = { collection: usersSlug, op: 'create', userId: betterAuthUser.id }
      const baSig = signCanonical(baBody, INTERNAL_SECRET)

      await payload.create({
        collection: usersSlug as CollectionSlug,
        context: { baBody, baSig },
        data: fullUserData,
        overrideAccess: false,
      })
    }
  }
}

/** Create a function to delete user from Payload, including BA collection entries. */
export function createDeleteUserFromPayload<TCollectionSlug extends string>(
  config: Promise<SanitizedConfig>,
  emailPasswordSlug: TCollectionSlug,
  magicLinkSlug: TCollectionSlug,
  usersSlug: TCollectionSlug,
) {
  return async function deleteUserFromPayload(betterAuthUserId: string) {
    const payload = await getPayload({ config })

    // Find user
    const existing = await payload.find({
      collection: usersSlug as CollectionSlug,
      limit: 1,
      where: { baUserId: { equals: betterAuthUserId } },
    })
    if (!existing.docs.length) {
      return
    }

    const userId = existing.docs[0].id

    // Delete BA collection entries first
    const emailPasswordEntries = await payload.find({
      collection: emailPasswordSlug as CollectionSlug,
      limit: 100,
      where: { baUserId: { equals: betterAuthUserId } },
    })

    for (const entry of emailPasswordEntries.docs) {
      const accountId = (entry as unknown as { baAccountId: string }).baAccountId
      const baBody = { accountId, collection: emailPasswordSlug, op: 'delete' }
      const baSig = signCanonical(baBody, INTERNAL_SECRET)

      await payload.delete({
        id: entry.id,
        collection: emailPasswordSlug as CollectionSlug,
        context: { baBody, baSig },
        overrideAccess: false,
      })
    }

    const magicLinkEntries = await payload.find({
      collection: magicLinkSlug as CollectionSlug,
      limit: 100,
      where: { baUserId: { equals: betterAuthUserId } },
    })

    for (const entry of magicLinkEntries.docs) {
      const accountId = (entry as unknown as { baAccountId: string }).baAccountId
      const baBody = { accountId, collection: magicLinkSlug, op: 'delete' }
      const baSig = signCanonical(baBody, INTERNAL_SECRET)

      await payload.delete({
        id: entry.id,
        collection: magicLinkSlug as CollectionSlug,
        context: { baBody, baSig },
        overrideAccess: false,
      })
    }

    // Delete the user
    const baBody = { collection: usersSlug, op: 'delete', userId: betterAuthUserId }
    const baSig = signCanonical(baBody, INTERNAL_SECRET)

    await payload.delete({
      id: userId,
      collection: usersSlug as CollectionSlug,
      context: { baBody, baSig },
      overrideAccess: false,
    })
  }
}

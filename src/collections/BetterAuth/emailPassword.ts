import type { Access, CollectionConfig } from 'payload'

import { APIError } from 'payload'

import type { SecondaryStorage } from '../../storage/types'

import { type CryptoSignature, verifyCanonical } from '../../better-auth/crypto-shared'
import {
  createBACollectionAccess,
  createSigVerifier,
  INTERNAL_SECRET,
  markNonceUsed,
  sharedBAFields,
} from './shared'

export interface CreateEmailPasswordCollectionOptions {
  /**
   * Custom access rules for extensible operations (read, delete).
   * These are OR'd with the BA sync agent check.
   */
  access?: {
    delete?: Access
    read?: Access
  }
  /**
   * When true, shows this collection in admin UI under "Better Auth (DEBUG)" group.
   * When false, hides from admin navigation.
   */
  isVisible?: boolean
  /**
   * Prefix for the collection slug (default: '__better_auth')
   */
  prefix?: string
  /**
   * Secondary storage for signature verification and nonce protection.
   */
  storage: SecondaryStorage
}

/**
 * Creates the Better Auth email-password collection.
 * Stores account data for users who authenticate via email and password.
 */
export function createEmailPasswordCollection({
  access: customAccess,
  isVisible = false,
  prefix = '__better_auth',
  storage,
}: CreateEmailPasswordCollectionOptions): CollectionConfig {
  const slug = `${prefix}_email_password`
  const verifySig = createSigVerifier(storage)

  return {
    slug,
    access: createBACollectionAccess(storage, customAccess),
    admin: {
      defaultColumns: ['email', 'emailVerified', 'createdAt'],
      group: isVisible ? 'Better Auth (DEBUG)' : undefined,
      hidden: !isVisible,
      useAsTitle: 'email',
    },
    fields: [
      ...sharedBAFields,
      // Join field to display the reverse relationship from users
      // References the polymorphic betterAuthAccounts field
      {
        name: 'user',
        type: 'join',
        collection: 'users',
        on: 'betterAuthAccounts',
      },
    ],
    hooks: {
      beforeChange: [
        async ({ data, operation, originalDoc, req }) => {
          const sig = req.context.baSig as CryptoSignature | undefined

          if (operation === 'create') {
            const expectedBody = { accountId: data.baAccountId, collection: slug, op: 'create' }
            if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
              throw new APIError('This collection is managed by Better Auth.')
            }
            await markNonceUsed(storage, sig.nonce)
          } else if (operation === 'update') {
            const accountId = originalDoc?.baAccountId || data.baAccountId
            const expectedBody = { accountId, collection: slug, op: 'update' }
            if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
              throw new APIError('This collection is managed by Better Auth.')
            }
            await markNonceUsed(storage, sig.nonce)
          }
          return data
        },
      ],
      beforeDelete: [
        async ({ id, req }) => {
          // Only check signature if not already verified in access control
          const sigOk = await verifySig(req)
          if (!sigOk) {
            // Allow if custom delete access was granted
            // The access control already verified either sig OR custom access
            // But we need the sig for nonce marking if it was a BA operation
            return
          }

          const sig = req.context.baSig as CryptoSignature | undefined
          if (sig) {
            await markNonceUsed(storage, sig.nonce)
          }
        },
      ],
    },
    timestamps: true,
  }
}

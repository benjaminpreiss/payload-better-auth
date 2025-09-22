import type { CollectionConfig, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

import { authenticated } from '../../access/authenticated'
import { auth } from '@/lib/auth'
import { APIError } from 'payload'
import { verifyCanonical, type CryptoSignature } from '@/lib/crypto-shared'

const INTERNAL_SECRET = process.env.BA_TO_PAYLOAD_SECRET!

// (optional) simple anti-replay for Local API calls
const seenNonces = new Map<string, number>()
const TTL = 5 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [k, exp] of seenNonces) if (exp < now) seenNonces.delete(k)
}, 60_000).unref()

function basicSigOk(req: PayloadRequest & { context: { baSig?: CryptoSignature } }) {
  const sig = req.context.baSig
  const body = req.context.baBody
  if (!sig || !body) return false
  const ok = verifyCanonical(body, sig, INTERNAL_SECRET)
  if (!ok) return false
  if (seenNonces.has(sig.nonce)) return false // replay
  // don't mark used yet; final verification happens in hooks
  return true
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    // Disable manual user management through Payload admin
    // Users can only be managed through better-auth
    create: ({ req }) => basicSigOk(req),
    delete: ({ req }) => basicSigOk(req),
    read: authenticated,
    update: ({ req }) => basicSigOk(req),
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: {
    disableLocalStrategy: true,
    strategies: [
      {
        name: 'better-auth',
        authenticate: async ({ headers, payload }) => {
          // Validate Better Auth session (cookie/JWT) from headers
          const session = await auth.api.getSession({ headers })
          if (!session) return { user: null }

          const externalId = session.user.id
          const email = session.user.email ?? null

          // Find or provision the minimal Payload user
          const existing = await payload.find({
            collection: 'users',
            where: { externalId: { equals: externalId } },
            limit: 1,
          })
          const doc =
            existing.docs[0] ??
            (await payload.create({
              collection: 'users',
              data: { externalId },
            }))

          return { user: { collection: 'users', ...doc } }
        },
      },
    ],
  },
  hooks: {
    beforeChange: [
      async ({ req, operation, data, originalDoc }) => {
        if (operation === 'create') {
          // authoritative check: tie signature to the actual mutation
          const sig = req.context.baSig as CryptoSignature | undefined
          const expectedBody = { op: 'create', userId: data.externalId }
          if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
            throw new APIError('User creation is managed by Better Auth.')
          }
          // mark nonce as used
          seenNonces.set(sig.nonce, Date.now() + TTL)
        } else if (operation === 'update') {
          // authoritative check: tie signature to the actual mutation
          const sig = req.context.baSig as CryptoSignature | undefined
          const userId = originalDoc?.externalId || data.externalId
          const expectedBody = { op: 'update', userId }
          if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
            throw new APIError('User updates are managed by Better Auth.')
          }
          // mark nonce as used
          seenNonces.set(sig.nonce, Date.now() + TTL)
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ req, id }) => {
        // Get the document first to access externalId
        const payload = await getPayload({ config: configPromise })
        const doc = await payload.findByID({
          collection: 'users',
          id,
        })

        const sig = req.context.baSig as CryptoSignature | undefined
        const expectedBody = { op: 'delete', userId: doc.externalId }
        if (!sig || !verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
          throw new APIError('User deletion is managed by Better Auth.')
        }
        seenNonces.set(sig.nonce, Date.now() + TTL)
      },
    ],
  },
  fields: [
    { name: 'externalId', type: 'text', unique: true, index: true, required: true },
    {
      name: 'name',
      type: 'text',
    },
  ],
  timestamps: true,
}

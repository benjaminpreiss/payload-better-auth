import type {
  Access,
  CollectionConfig,
  CollectionSlug,
  Field,
  Payload,
  PayloadRequest,
} from 'payload'

import type { SecondaryStorage } from '../../storage/types'

import { type CryptoSignature, verifyCanonical } from '../../better-auth/crypto-shared'
import { NONCE_PREFIX, SESSION_COOKIE_NAME_KEY } from '../../storage/keys'

const INTERNAL_SECRET = process.env.BA_TO_PAYLOAD_SECRET!
const NONCE_TTL_SECONDS = 5 * 60 // 5 minutes in seconds

/**
 * Extract ALL session tokens from cookies that match the expected cookie name.
 * This handles cases where multiple cookies with the same name exist (different paths/domains).
 * Returns tokens in order they appear (first = most recent typically).
 */
async function extractAllSessionTokens(
  headers: Headers,
  storage: SecondaryStorage,
): Promise<string[]> {
  const cookieHeader = headers.get('cookie')
  if (!cookieHeader) {
    return []
  }

  // Get cookie name from storage (set by Better Auth plugin)
  const sessionCookieName =
    (await storage.get(SESSION_COOKIE_NAME_KEY)) ?? 'better-auth.session_token'

  // Parse ALL cookies, keeping duplicates
  const tokens: string[] = []
  for (const cookie of cookieHeader.split(';')) {
    const trimmed = cookie.trim()
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, eqIndex)
    const value = trimmed.slice(eqIndex + 1)

    if (key === sessionCookieName && value) {
      try {
        tokens.push(decodeURIComponent(value))
      } catch {
        // Skip malformed cookies
      }
    }
  }

  return tokens
}

/**
 * Better Auth session data format in secondaryStorage.
 * Better Auth stores sessions with this structure when secondaryStorage is configured.
 */
interface BetterAuthStoredSession {
  session: {
    expiresAt: Date | string
    id: string
    userId: string
  }
  user: {
    [key: string]: unknown
    id: string
  }
}

/**
 * Create the signature verification function.
 * Uses storage for nonce checking to prevent replay attacks.
 */
function createSigVerifier(storage: SecondaryStorage) {
  return async function verifySig(
    req: { context: { baBody?: unknown; baSig?: CryptoSignature } } & PayloadRequest,
  ): Promise<boolean> {
    const sig = req.context.baSig
    const body = req.context.baBody
    if (!sig || !body) {
      return false
    }

    // Verify HMAC signature (includes timestamp check)
    const ok = verifyCanonical(body, sig, INTERNAL_SECRET)
    if (!ok) {
      return false
    }

    // Check nonce for replay protection
    const alreadyUsed = await storage.get(NONCE_PREFIX + sig.nonce)
    if (alreadyUsed !== null) {
      return false // replay detected
    }

    return true
  }
}

/**
 * Mark a nonce as used via secondary storage.
 */
async function markNonceUsed(storage: SecondaryStorage, nonce: string): Promise<void> {
  await storage.set(NONCE_PREFIX + nonce, '1', NONCE_TTL_SECONDS)
}

export interface ExtendUsersCollectionOptions {
  /**
   * Prefix for Better Auth collection slugs (default: '__better_auth')
   */
  collectionPrefix?: string
  /**
   * Secondary storage for session validation and nonce protection.
   * Sessions are read directly from storage - no HTTP calls to Better Auth.
   *
   * This must be the same storage instance passed to the Better Auth plugin,
   * as Better Auth writes sessions to this storage via secondaryStorage.
   */
  storage: SecondaryStorage
}

/**
 * Field-level access that only allows BA sync agent to update.
 * Checks for BA signature in request context.
 */
const baOnlyFieldAccess = {
  // BA sync agent sets baSig in context - only allow update if present
  update: ({ req }: { req: PayloadRequest }) => Boolean(req.context?.baSig),
}

/**
 * Better Auth fields to add to the users collection.
 * Includes a polymorphic relationship field to BA collections.
 */
function getBetterAuthFields<TCollectionSlug extends string>(
  emailPasswordSlug: TCollectionSlug,
  magicLinkSlug: TCollectionSlug,
): Field[] {
  return [
    {
      name: 'baUserId',
      type: 'text',
      access: baOnlyFieldAccess,
      admin: { readOnly: true },
      index: true,
      unique: true,
    },
    {
      // Polymorphic relationship: one field can reference multiple BA collections
      // A user can have multiple auth methods (e.g., email/password AND magic-link)
      name: 'betterAuthAccounts',
      type: 'relationship',
      access: baOnlyFieldAccess,
      admin: { readOnly: true },
      hasMany: true,
      relationTo: [emailPasswordSlug, magicLinkSlug] as CollectionSlug[],
    },
  ]
}

/**
 * Validate a session token and return the user ID if valid.
 * Returns null if token is invalid or expired.
 */
async function validateSessionToken(
  fullToken: string,
  storage: SecondaryStorage,
): Promise<null | string> {
  // Better Auth cookie format: "token.signature" - we need just the token part
  const token = fullToken.split('.')[0]
  if (!token) {
    return null
  }

  // Read session directly from storage (written by Better Auth)
  const cached = await storage.get(token)
  if (!cached) {
    return null
  }

  try {
    const storedSession = JSON.parse(cached) as BetterAuthStoredSession
    // Check expiration - Better Auth stores expiresAt as ISO string or Date
    const expiresAt =
      typeof storedSession.session.expiresAt === 'string'
        ? new Date(storedSession.session.expiresAt).getTime()
        : new Date(storedSession.session.expiresAt).getTime()

    if (expiresAt > Date.now()) {
      return storedSession.session.userId
    }
  } catch {
    // Invalid JSON in storage
  }

  return null
}

/**
 * Create the Better Auth authentication strategy.
 * Tries all session cookies until finding a valid, non-expired session.
 */
function createBetterAuthStrategy(storage: SecondaryStorage, _prefix: string) {
  return {
    name: 'better-auth',
    authenticate: async ({ headers, payload }: { headers: Headers; payload: Payload }) => {
      // Get ALL session tokens from cookies (handles duplicates)
      const tokens = await extractAllSessionTokens(headers, storage)
      if (tokens.length === 0) {
        return { user: null }
      }

      // Try each token until we find a valid session
      for (const fullToken of tokens) {
        const baUserId = await validateSessionToken(fullToken, storage)
        if (!baUserId) {
          continue // Try next token
        }

        // Find user by baUserId
        const existing = await payload.find({
          collection: 'users',
          limit: 1,
          where: { baUserId: { equals: baUserId } },
        })

        if (existing.docs[0]) {
          return { user: { collection: 'users' as const, ...existing.docs[0] } }
        }
        // User not found in Payload, try next token
      }

      return { user: null }
    },
  }
}

/**
 * Create composable access control that OR's BA sync access with developer access.
 * Handles both sync and async access functions from developers.
 */
function createComposableAccess(
  storage: SecondaryStorage,
  developerAccess: Access | undefined,
  operation: 'create' | 'delete' | 'read' | 'update',
) {
  const verifySig = createSigVerifier(storage)

  return async (args: Parameters<Access>[0]) => {
    // BA sync agent always has access
    const sigOk = await verifySig(args.req)
    if (sigOk) {
      return true
    }

    // Fall back to developer's access rules (handles both sync and async)
    if (developerAccess) {
      return await Promise.resolve(developerAccess(args))
    }

    // Default behavior by operation
    if (operation === 'read') {
      return Boolean(args.req.user) // authenticated users can read
    }
    return false // deny by default for create/update/delete
  }
}

/**
 * Extends an existing users collection with Better Auth integration.
 * Merges BA fields, auth strategy, access control, and hooks.
 *
 * @param baseCollection - The developer's existing users collection config (or undefined for minimal)
 * @param options - Extension options including storage
 * @returns Extended collection config with BA integration
 */
export function extendUsersCollection(
  baseCollection: CollectionConfig | undefined,
  options: ExtendUsersCollectionOptions,
): CollectionConfig {
  const { collectionPrefix = '__better_auth', storage } = options
  const verifySig = createSigVerifier(storage)

  // Compute BA collection slugs
  const emailPasswordSlug = `${collectionPrefix}_email_password`
  const magicLinkSlug = `${collectionPrefix}_magic_link`

  // Start with base or minimal collection
  const base: CollectionConfig = baseCollection ?? {
    slug: 'users',
    fields: [],
  }

  // Ensure slug is 'users'
  if (base.slug !== 'users') {
    throw new Error('Users collection must have slug "users"')
  }

  // Get developer's existing access rules
  const developerAccess = base.access ?? {}

  // Get developer's existing hooks
  const developerHooks = base.hooks ?? {}

  // BA-specific beforeChange hook
  const baBeforeChange = async ({
    data,
    operation,
    originalDoc,
    req,
  }: {
    data: Record<string, unknown>
    operation: 'create' | 'update'
    originalDoc?: Record<string, unknown>
    req: PayloadRequest
  }) => {
    const sig = req.context.baSig as CryptoSignature | undefined

    if (operation === 'create' && sig) {
      const expectedBody = { collection: 'users', op: 'create', userId: data.baUserId }
      if (verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
        await markNonceUsed(storage, sig.nonce)
      }
    } else if (operation === 'update' && sig) {
      const userId = originalDoc?.baUserId || data.baUserId
      const expectedBody = { collection: 'users', op: 'update', userId }
      if (verifyCanonical(expectedBody, sig, INTERNAL_SECRET)) {
        await markNonceUsed(storage, sig.nonce)
      }
    }
    return data
  }

  // BA-specific beforeDelete hook
  const baBeforeDelete = async ({ req }: { id: number | string; req: PayloadRequest }) => {
    const sigOk = await verifySig(req)
    if (sigOk) {
      const sig = req.context.baSig as CryptoSignature | undefined
      if (sig) {
        await markNonceUsed(storage, sig.nonce)
      }
    }
  }

  return {
    ...base,
    access: {
      admin: developerAccess.admin ?? (({ req: { user } }) => Boolean(user)),
      create: createComposableAccess(storage, developerAccess.create as Access, 'create'),
      delete: createComposableAccess(storage, developerAccess.delete as Access, 'delete'),
      read: createComposableAccess(storage, developerAccess.read as Access, 'read'),
      update: createComposableAccess(storage, developerAccess.update as Access, 'update'),
    },
    admin: {
      ...base.admin,
      defaultColumns: (() => {
        const cols = base.admin?.defaultColumns ?? ['email', 'createdAt']
        // Add BA accounts column if not already present
        if (!cols.includes('betterAuthAccounts')) {
          return [...cols, 'betterAuthAccounts']
        }
        return cols
      })(),
      useAsTitle: base.admin?.useAsTitle ?? 'email',
    },
    auth: {
      ...(typeof base.auth === 'object' ? base.auth : {}),
      disableLocalStrategy: true,
      strategies: [
        createBetterAuthStrategy(storage, collectionPrefix),
        // Preserve any existing strategies (except local)
        ...((typeof base.auth === 'object' && base.auth.strategies) || []),
      ],
    },
    fields: [
      // Developer's fields first
      ...(base.fields ?? []),
      // BA fields
      ...getBetterAuthFields(emailPasswordSlug, magicLinkSlug),
    ],
    hooks: {
      ...developerHooks,
      beforeChange: [
        // BA hook first
        baBeforeChange,
        // Then developer hooks
        ...(developerHooks.beforeChange ?? []),
      ],
      beforeDelete: [
        // BA hook first
        baBeforeDelete,
        // Then developer hooks
        ...(developerHooks.beforeDelete ?? []),
      ],
    },
    timestamps: base.timestamps ?? true,
  }
}

/**
 * Creates a minimal users collection with Better Auth integration.
 * Use this when no custom users collection is defined.
 */
export function createMinimalUsersCollection(
  options: ExtendUsersCollectionOptions,
): CollectionConfig {
  return extendUsersCollection(undefined, options)
}

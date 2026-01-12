// ═══════════════════════════════════════════════════════════════════════════
// Better Auth Plugin (for Better Auth configuration)
// ═══════════════════════════════════════════════════════════════════════════
export {
  payloadBetterAuthPlugin,
  type PayloadBetterAuthPluginOptions,
  type PayloadUserData,
} from './better-auth/plugin'
export { Queue } from './better-auth/reconcile-queue'
export { type BetterAuthUser } from './better-auth/sources'

// ═══════════════════════════════════════════════════════════════════════════
// Collection Factories
// ═══════════════════════════════════════════════════════════════════════════
export {
  createEmailPasswordCollection,
  type CreateEmailPasswordCollectionOptions,
  createMagicLinkCollection,
  type CreateMagicLinkCollectionOptions,
} from './collections/BetterAuth'
export { extendUsersCollection, type ExtendUsersCollectionOptions } from './collections/Users'

// ═══════════════════════════════════════════════════════════════════════════
// Payload Plugin (for Payload configuration)
// ═══════════════════════════════════════════════════════════════════════════
export {
  type BetterAuthClientOptions,
  betterAuthPayloadPlugin,
  type BetterAuthPayloadPluginOptions,
} from './payload/plugin'

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════
export { triggerFullReconcile } from './utils/payload-reconcile'

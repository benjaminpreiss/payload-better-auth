// Main exports for payload-better-auth package
export { reconcileQueuePlugin } from "./src/betterAuthPlugin";

// Source functions - factory functions that require config
export {
	createListPayloadUsersPage,
	createSyncUserToPayload,
	createDeleteUserFromPayload,
	createAttachExternalIdInPayload,
	// Legacy exports for backward compatibility
	listPayloadUsersPage,
	syncUserToPayload,
	deleteUserFromPayload,
	attachExternalIdInPayload,
} from "./src/sources";

// Types
export type { BAUser, PayloadUser, BetterAuthUser } from "./src/sources";

// Crypto utilities
export {
	signCanonical,
	verifyCanonical,
	verifySignature,
	createSignature,
} from "./src/crypto-shared";

export type {
	CryptoSignature,
	VerifySignatureInput,
	SignCanonicalInput,
} from "./src/crypto-shared";

// Auth client
export { authClient } from "./src/auth-client";

// Components (optional export - users can import from /components)
export { BetterAuthLogin, EmailPasswordForm } from "./src/components";

// Reconcile queue utilities
export { Queue } from "./src/reconcile-queue";

export type { QueueDeps, TaskSource, InitOptions } from "./src/reconcile-queue";

// Payload reconcile utilities
export { triggerFullReconcile } from "./src/payload-reconcile";

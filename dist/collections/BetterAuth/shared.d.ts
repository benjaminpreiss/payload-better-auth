import type { Access, PayloadRequest } from 'payload';
import type { SecondaryStorage } from '../../storage/types';
import { type CryptoSignature } from '../../better-auth/crypto-shared';
declare const INTERNAL_SECRET: string;
/**
 * Create the signature verification function for BA sync operations.
 * Uses storage for nonce checking to prevent replay attacks.
 */
export declare function createSigVerifier(storage: SecondaryStorage): (req: {
    context: {
        baBody?: unknown;
        baSig?: CryptoSignature;
    };
} & PayloadRequest) => Promise<boolean>;
/**
 * Mark a nonce as used via secondary storage.
 */
export declare function markNonceUsed(storage: SecondaryStorage, nonce: string): Promise<void>;
/**
 * Create access control for BA collections.
 * - create/update: BA sync agent only (non-extensible)
 * - read/delete: BA sync agent only by default, can be extended via custom access
 * Handles both sync and async access functions from developers.
 */
export declare function createBACollectionAccess(storage: SecondaryStorage, customAccess?: {
    delete?: Access;
    read?: Access;
}): {
    create: ({ req }: {
        req: PayloadRequest;
    }) => Promise<boolean>;
    delete: (args: Parameters<Access>[0]) => Promise<import("payload").AccessResult>;
    read: (args: Parameters<Access>[0]) => Promise<import("payload").AccessResult>;
    update: ({ req }: {
        req: PayloadRequest;
    }) => Promise<boolean>;
};
/**
 * Shared fields for all BA collections.
 * All fields are read-only in the admin UI.
 */
export declare const sharedBAFields: ({
    name: string;
    type: "text";
    admin: {
        readOnly: boolean;
    };
    index: boolean;
    required: boolean;
    unique: boolean;
    defaultValue?: undefined;
} | {
    name: string;
    type: "text";
    admin: {
        readOnly: boolean;
    };
    index: boolean;
    required: boolean;
    unique?: undefined;
    defaultValue?: undefined;
} | {
    name: string;
    type: "email";
    admin: {
        readOnly: boolean;
    };
    required: boolean;
    index?: undefined;
    unique?: undefined;
    defaultValue?: undefined;
} | {
    name: string;
    type: "checkbox";
    admin: {
        readOnly: boolean;
    };
    defaultValue: boolean;
    index?: undefined;
    required?: undefined;
    unique?: undefined;
})[];
export { INTERNAL_SECRET };

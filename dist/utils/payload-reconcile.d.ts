import type { Payload } from 'payload';
/**
 * Triggers a full reconcile operation via the Better Auth reconcile API
 * This is typically called during Payload initialization to ensure data consistency
 */
export declare function triggerFullReconcile({ additionalHeaders, betterAuthUrl, payload, reconcileToken, }: {
    additionalHeaders?: HeadersInit;
    betterAuthUrl: string;
    payload: Payload;
    reconcileToken?: string;
}): Promise<void>;

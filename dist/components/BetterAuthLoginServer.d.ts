import type { ClientOptions } from 'better-auth';
import type React from 'react';
import type { AuthMethod } from '../better-auth/helpers';
export type AuthClientOptions = {
    baseURL: string;
} & Omit<ClientOptions, 'baseURL'>;
export declare function fetchAuthMethods({ additionalHeaders, betterAuthBaseUrl, debug, }: {
    additionalHeaders?: HeadersInit;
    betterAuthBaseUrl: string;
    debug?: boolean;
}): Promise<{
    data: AuthMethod[];
    error: null;
} | {
    data: null;
    error: Error;
}>;
export type BetterAuthLoginServerProps = {
    /**
     * Enable debug logging for troubleshooting connection issues.
     */
    debug?: boolean;
    /**
     * Auth client options for client-side requests (uses external/public URL).
     */
    externalAuthClientOptions: AuthClientOptions;
    /**
     * Auth client options for server-side requests (uses internal URL).
     */
    internalAuthClientOptions: AuthClientOptions;
};
export declare function BetterAuthLoginServer({ debug, externalAuthClientOptions, internalAuthClientOptions, }: BetterAuthLoginServerProps): Promise<React.JSX.Element>;

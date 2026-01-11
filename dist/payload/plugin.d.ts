import type { ClientOptions } from 'better-auth';
import type { Config } from 'payload';
export type BetterAuthClientOptions = {
    /**
     * The external base URL for better-auth, used for client-side requests (from the browser).
     * This should be the publicly accessible URL.
     * @example 'https://auth.example.com'
     */
    externalBaseURL: string;
    /**
     * The internal base URL for better-auth, used for server-side requests.
     * This is used when the server needs to reach better-auth internally (e.g., within a container network).
     * @example 'http://auth-service:3000'
     */
    internalBaseURL: string;
} & Omit<ClientOptions, 'baseURL'>;
export type BetterAuthPayloadPluginOptions = {
    betterAuthClientOptions: BetterAuthClientOptions;
    /**
     * Enable debug logging for troubleshooting connection issues.
     * When enabled, detailed error information will be logged during auth method fetching.
     */
    debug?: boolean;
    disabled?: boolean;
    reconcileToken?: string;
};
export declare const betterAuthPayloadPlugin: (pluginOptions: BetterAuthPayloadPluginOptions) => (config: Config) => Config;

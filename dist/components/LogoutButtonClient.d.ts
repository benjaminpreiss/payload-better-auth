import type { AuthClientOptions } from './BetterAuthLoginServer';
export interface LogoutButtonClientProps {
    /**
     * Auth client options for Better Auth sign-out.
     * Uses the external (browser-accessible) URL.
     */
    authClientOptions: AuthClientOptions;
}
export declare function LogoutButtonClient({ authClientOptions }: LogoutButtonClientProps): import("react").JSX.Element;

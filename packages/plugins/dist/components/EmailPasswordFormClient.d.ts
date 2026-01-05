import type { default as React } from 'react';
import type { AuthMethod } from 'src/better-auth/helpers.js';
import { createAuthClient } from 'better-auth/react';
export declare function EmailPasswordFormClient({ authClientOptions, authMethods, }: {
    authClientOptions: Parameters<typeof createAuthClient>['0'];
    authMethods: AuthMethod[];
}): React.JSX.Element;

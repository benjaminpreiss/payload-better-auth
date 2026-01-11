import type { default as React } from 'react';
import { createAuthClient } from 'better-auth/react';
import type { AuthMethod } from '../better-auth/helpers';
export declare function EmailPasswordFormClient({ authClientOptions, authMethods, }: {
    authClientOptions: Parameters<typeof createAuthClient>['0'];
    authMethods: AuthMethod[];
}): React.JSX.Element;

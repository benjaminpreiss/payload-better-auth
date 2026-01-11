import type { AuthContext, BetterAuthPlugin } from 'better-auth';
import type { SanitizedConfig } from 'payload';
import { type InitOptions } from './reconcile-queue';
type CreateAdminsUser = Parameters<AuthContext['internalAdapter']['createUser']>['0'];
export declare const payloadBetterAuthPlugin: (opts: {
    createAdmins?: {
        overwrite?: boolean;
        user: CreateAdminsUser;
    }[];
    enableLogging?: boolean;
    payloadConfig: Promise<SanitizedConfig>;
    token: string;
} & InitOptions) => BetterAuthPlugin;
export {};

export type AuthMethod = {
    method: 'emailAndPassword';
    options: {
        minPasswordLength: number;
    };
} | {
    method: 'magicLink';
};

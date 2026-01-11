import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { EmailPasswordFormClient } from './EmailPasswordFormClient';
export async function fetchAuthMethods({ additionalHeaders, betterAuthBaseUrl, debug = false }) {
    const headers = new Headers(additionalHeaders);
    headers.append('Content-Type', 'application/json');
    const url = `${betterAuthBaseUrl}/api/auth/auth/methods`;
    if (debug) {
        console.log('[payload-better-auth] fetchAuthMethods: Attempting to fetch auth methods');
        console.log('[payload-better-auth] fetchAuthMethods:   - URL:', url);
        console.log('[payload-better-auth] fetchAuthMethods:   - betterAuthBaseUrl:', betterAuthBaseUrl);
    }
    try {
        const response = await fetch(url, {
            headers,
            method: 'GET'
        });
        if (debug) {
            console.log('[payload-better-auth] fetchAuthMethods: Response received');
            console.log('[payload-better-auth] fetchAuthMethods:   - status:', response.status);
            console.log('[payload-better-auth] fetchAuthMethods:   - statusText:', response.statusText);
        }
        if (!response.ok) {
            throw new Error(`Failed to fetch auth methods: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (debug) {
            console.log('[payload-better-auth] fetchAuthMethods: Successfully fetched auth methods');
            console.log('[payload-better-auth] fetchAuthMethods:   - methods count:', data?.length ?? 0);
        }
        return {
            data,
            error: null
        };
    } catch (error) {
        console.error('Error fetching auth methods:', error);
        return {
            data: null,
            error: error
        };
    }
}
export async function BetterAuthLoginServer({ debug = false, externalAuthClientOptions, internalAuthClientOptions }) {
    const authMethods = await fetchAuthMethods({
        additionalHeaders: internalAuthClientOptions.fetchOptions?.headers,
        betterAuthBaseUrl: internalAuthClientOptions.baseURL,
        debug
    });
    return /*#__PURE__*/ _jsx("div", {
        style: {
            alignItems: 'center',
            display: 'flex',
            justifyContent: 'center'
        },
        children: /*#__PURE__*/ _jsxs("div", {
            style: {
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                maxWidth: '400px',
                padding: '2rem',
                width: '100%'
            },
            children: [
                /*#__PURE__*/ _jsx("h2", {
                    style: {
                        color: '#333',
                        fontSize: '1.5rem',
                        fontWeight: '600',
                        marginBottom: '2rem',
                        textAlign: 'center'
                    },
                    children: "Sign In to Admin"
                }),
                authMethods.data?.some((m)=>m.method === 'emailAndPassword' || m.method === 'magicLink') && /*#__PURE__*/ _jsx(EmailPasswordFormClient, {
                    authClientOptions: externalAuthClientOptions,
                    authMethods: authMethods.data
                }),
                authMethods.data?.length === 0 && /*#__PURE__*/ _jsxs("div", {
                    style: {
                        color: '#666',
                        padding: '2rem',
                        textAlign: 'center'
                    },
                    children: [
                        /*#__PURE__*/ _jsx("p", {
                            children: "No authentication methods are currently available."
                        }),
                        /*#__PURE__*/ _jsx("p", {
                            style: {
                                fontSize: '0.875rem',
                                marginTop: '1rem'
                            },
                            children: "Please contact your administrator."
                        })
                    ]
                }),
                authMethods.error && /*#__PURE__*/ _jsxs("div", {
                    style: {
                        color: '#666',
                        padding: '2rem',
                        textAlign: 'center'
                    },
                    children: [
                        /*#__PURE__*/ _jsx("p", {
                            children: "Couldn't fetch authentication methods from better-auth"
                        }),
                        /*#__PURE__*/ _jsx("p", {
                            style: {
                                fontSize: '0.875rem',
                                marginTop: '1rem'
                            },
                            children: "Please contact your administrator."
                        })
                    ]
                })
            ]
        })
    });
}

//# sourceMappingURL=BetterAuthLoginServer.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from '@payloadcms/ui';
export function VerifyEmailInfoViewClient() {
    return /*#__PURE__*/ _jsx("div", {
        style: {
            alignItems: 'center',
            display: 'flex',
            justifyContent: 'center',
            minHeight: '100dvh',
            padding: '1.5rem'
        },
        children: /*#__PURE__*/ _jsxs("div", {
            style: {
                background: 'white',
                borderRadius: 8,
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                maxWidth: 480,
                padding: '2rem',
                width: '100%'
            },
            children: [
                /*#__PURE__*/ _jsx("h2", {
                    style: {
                        color: '#333',
                        fontSize: '1.5rem',
                        fontWeight: 600,
                        marginBottom: '0.75rem',
                        textAlign: 'center'
                    },
                    children: "Check your email"
                }),
                /*#__PURE__*/ _jsx("p", {
                    style: {
                        color: '#555',
                        fontSize: '0.9875rem',
                        lineHeight: 1.6,
                        marginBottom: '1.75rem',
                        textAlign: 'center'
                    },
                    children: "We’ve sent a magic sign-in link to your inbox. Open the email and click the link to continue. If you don’t see it, check your spam folder."
                }),
                /*#__PURE__*/ _jsxs("p", {
                    style: {
                        color: '#666',
                        fontSize: '0.9375rem',
                        marginTop: '1.5rem',
                        textAlign: 'center'
                    },
                    children: [
                        "Ready to try again?",
                        /*#__PURE__*/ _jsx(Link, {
                            href: "/admin/auth",
                            children: "Go back to sign-in"
                        }),
                        "."
                    ]
                })
            ]
        })
    });
}

//# sourceMappingURL=VerifyEmailInfoViewClient.js.map
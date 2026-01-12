'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { toast } from '@payloadcms/ui';
import { createAuthClient } from 'better-auth/react';
import { useRouter } from 'next/navigation.js';
import { useState } from 'react';
/**
 * Simple logout icon SVG component
 */ function LogOutIcon() {
    return /*#__PURE__*/ _jsxs("svg", {
        fill: "none",
        height: "20",
        stroke: "currentColor",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: "2",
        viewBox: "0 0 24 24",
        width: "20",
        xmlns: "http://www.w3.org/2000/svg",
        children: [
            /*#__PURE__*/ _jsx("path", {
                d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
            }),
            /*#__PURE__*/ _jsx("polyline", {
                points: "16 17 21 12 16 7"
            }),
            /*#__PURE__*/ _jsx("line", {
                x1: "21",
                x2: "9",
                y1: "12",
                y2: "12"
            })
        ]
    });
}
export function LogoutButtonClient({ authClientOptions }) {
    const authClient = createAuthClient(authClientOptions);
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const handleLogout = async ()=>{
        if (isLoading) {
            return;
        }
        setIsLoading(true);
        try {
            // Sign out from Better Auth - this clears the session cookie
            const result = await authClient.signOut();
            if (result.error) {
                toast.error(result.error.message || 'Logout failed');
                setIsLoading(false);
                return;
            }
            // Redirect to login page after successful sign-out
            router.push('/admin/login');
            router.refresh();
        } catch (error) {
            toast.error(error.message || 'Logout failed');
            setIsLoading(false);
        }
    };
    return /*#__PURE__*/ _jsxs("button", {
        "aria-label": "Log out",
        disabled: isLoading,
        onClick: handleLogout,
        style: {
            alignItems: 'center',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: isLoading ? 'wait' : 'pointer',
            display: 'flex',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            gap: '0.5rem',
            opacity: isLoading ? 0.6 : 1,
            padding: '0.75rem 1rem',
            textAlign: 'left',
            transition: 'opacity 0.2s',
            width: '100%'
        },
        type: "button",
        children: [
            /*#__PURE__*/ _jsx(LogOutIcon, {}),
            /*#__PURE__*/ _jsx("span", {
                children: isLoading ? 'Logging out...' : 'Logout'
            })
        ]
    });
}

//# sourceMappingURL=LogoutButtonClient.js.map
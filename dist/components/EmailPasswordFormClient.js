'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, FieldLabel, TextInput } from '@payloadcms/ui';
import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { useRouter } from 'next/navigation.js';
import { useState } from 'react';
export function EmailPasswordFormClient({ authClientOptions, authMethods }) {
    const authClient = createAuthClient({
        ...authClientOptions,
        plugins: [
            ...authClientOptions?.plugins?.filter((p)=>p.id !== 'magic-link') ?? [],
            magicLinkClient()
        ]
    });
    const router = useRouter();
    const [errors, setErrors] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    // Use useField hooks for each input to get proper setValue functions
    const [emailValue, setEmailValue] = useState('');
    const [passwordValue, setPasswordValue] = useState('');
    const withEmailAndPassword = authMethods.find((m)=>m.method === 'emailAndPassword');
    const withMagicLink = authMethods.find((m)=>m.method === 'magicLink');
    if (!withEmailAndPassword && !withMagicLink) {
        throw new Error("This Form can't render with neither email nor magicLink activated.");
    }
    const handleEmailChange = (event)=>{
        setEmailValue(event.target.value);
        // Clear field-specific error when user starts typing
        if (errors.email) {
            setErrors((prev)=>({
                    ...prev,
                    email: undefined
                }));
        }
    };
    const handlePasswordChange = (event)=>{
        setPasswordValue(event.target.value);
        // Clear field-specific error when user starts typing
        if (errors.password) {
            setErrors((prev)=>({
                    ...prev,
                    password: undefined
                }));
        }
    };
    const validateForm = ()=>{
        const newErrors = {};
        const email = String(emailValue || '').trim();
        const password = String(passwordValue || '').trim();
        if (!email) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
            newErrors.email = 'Please enter a valid email address';
        }
        if (withEmailAndPassword && !withMagicLink) {
            if (!password) {
                newErrors.password = 'Password is required';
            // TODO: verify if minPasswordLength is also set if not actively specified
            } else if (password.length < withEmailAndPassword.options.minPasswordLength) {
                newErrors.password = `Password must be at least ${withEmailAndPassword.options.minPasswordLength} characters`;
            }
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const handleSubmit = async (e)=>{
        e.preventDefault();
        if (!validateForm()) {
            return;
        }
        setIsLoading(true);
        setErrors({});
        try {
            if (withEmailAndPassword && passwordValue !== '') {
                const result = await authClient.signIn.email({
                    email: String(emailValue || ''),
                    password: String(passwordValue || '')
                });
                if (result.error) {
                    setErrors({
                        general: result.error.message || 'Sign in failed. Please check your credentials.'
                    });
                } else {
                    // Successful sign in - redirect to admin
                    router.push('/admin');
                    router.refresh();
                }
            } else if (withMagicLink && passwordValue === '') {
                const result = await authClient.signIn.magicLink({
                    callbackURL: `${window.location.origin}/admin`,
                    email: String(emailValue || '')
                });
                if (result.error) {
                    setErrors({
                        general: result.error.message || 'Sign in failed. Please check your credentials.'
                    });
                } else {
                    // Successful sign in - redirect to admin
                    router.push('/admin/auth/verify-email');
                    router.refresh();
                }
            }
        } catch (error) {
            setErrors({
                general: error.message
            });
        } finally{
            setIsLoading(false);
        }
    };
    const errorStyle = {
        color: '#dc2626',
        fontSize: '0.875rem',
        marginTop: '0.25rem'
    };
    return /*#__PURE__*/ _jsxs("form", {
        className: "email-password-form",
        onSubmit: handleSubmit,
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "form-field",
                style: {
                    marginBottom: '1.5rem'
                },
                children: [
                    /*#__PURE__*/ _jsx(FieldLabel, {
                        htmlFor: "email",
                        label: "Email",
                        required: true
                    }),
                    /*#__PURE__*/ _jsx(TextInput, {
                        onChange: handleEmailChange,
                        path: "email",
                        readOnly: isLoading,
                        required: true,
                        value: emailValue || ''
                    }),
                    errors.email && /*#__PURE__*/ _jsx("div", {
                        className: "field-error",
                        style: errorStyle,
                        children: errors.email
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "form-field",
                style: {
                    marginBottom: '1.5rem'
                },
                children: [
                    /*#__PURE__*/ _jsx(FieldLabel, {
                        htmlFor: "password",
                        label: `Password ${withMagicLink && '(Optional)'}`,
                        required: !withMagicLink
                    }),
                    /*#__PURE__*/ _jsx(TextInput, {
                        onChange: handlePasswordChange,
                        path: "password",
                        readOnly: isLoading,
                        required: !withMagicLink,
                        value: passwordValue || ''
                    }),
                    errors.password && /*#__PURE__*/ _jsx("div", {
                        className: "field-error",
                        style: errorStyle,
                        children: errors.password
                    })
                ]
            }),
            errors.general && /*#__PURE__*/ _jsx("div", {
                className: "general-error",
                style: {
                    ...errorStyle,
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '0.375rem',
                    marginBottom: '1rem',
                    padding: '0.75rem'
                },
                children: errors.general
            }),
            /*#__PURE__*/ _jsx(Button, {
                buttonStyle: "primary",
                disabled: isLoading,
                size: "large",
                type: "submit",
                children: isLoading ? 'Signing In...' : 'Sign In'
            })
        ]
    });
}

//# sourceMappingURL=EmailPasswordFormClient.js.map
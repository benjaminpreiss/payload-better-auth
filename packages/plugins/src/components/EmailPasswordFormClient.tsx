'use client'

import type { ChangeEvent, default as React } from 'react'

import { Button, FieldLabel, TextInput } from '@payloadcms/ui'
import { createAuthClient } from 'better-auth/react'
import { useRouter } from 'next/navigation.js'
import { useState } from 'react'

interface FormErrors {
  email?: string
  general?: string
  password?: string
}

export function EmailPasswordFormClient({
  authClientOptions,
}: {
  authClientOptions: Parameters<typeof createAuthClient>['0']
}) {
  const authClient = createAuthClient(authClientOptions)
  const router = useRouter()
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)

  // Use useField hooks for each input to get proper setValue functions
  const [emailValue, setEmailValue] = useState('')
  const [passwordValue, setPasswordValue] = useState('')

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmailValue(event.target.value)
    // Clear field-specific error when user starts typing
    if (errors.email) {
      setErrors((prev) => ({ ...prev, email: undefined }))
    }
  }

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPasswordValue(event.target.value)
    // Clear field-specific error when user starts typing
    if (errors.password) {
      setErrors((prev) => ({ ...prev, password: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}
    const email = String(emailValue || '').trim()
    const password = String(passwordValue || '').trim()

    if (!email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      const result = await authClient.signIn.email({
        email: String(emailValue || ''),
        password: String(passwordValue || ''),
      })

      if (result.error) {
        setErrors({
          general: result.error.message || 'Sign in failed. Please check your credentials.',
        })
      } else {
        // Successful sign in - redirect to admin
        router.push('/admin')
        router.refresh()
      }
    } catch (error) {
      console.error('Sign in error:', error)
      setErrors({
        general: 'An unexpected error occurred. Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const errorStyle = {
    color: '#dc2626',
    fontSize: '0.875rem',
    marginTop: '0.25rem',
  }

  return (
    <form className="email-password-form" onSubmit={handleSubmit}>
      <div className="form-field" style={{ marginBottom: '1.5rem' }}>
        <FieldLabel htmlFor="email" label="Email" required />
        <TextInput
          onChange={handleEmailChange}
          path="email"
          readOnly={isLoading}
          value={emailValue || ''}
        />
        {errors.email && (
          <div className="field-error" style={errorStyle}>
            {errors.email}
          </div>
        )}
      </div>

      <div className="form-field" style={{ marginBottom: '1.5rem' }}>
        <FieldLabel htmlFor="password" label="Password" required />
        <TextInput
          onChange={handlePasswordChange}
          path="password"
          readOnly={isLoading}
          value={passwordValue || ''}
        />
        {errors.password && (
          <div className="field-error" style={errorStyle}>
            {errors.password}
          </div>
        )}
      </div>

      {errors.general && (
        <div
          className="general-error"
          style={{
            ...errorStyle,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            padding: '0.75rem',
          }}
        >
          {errors.general}
        </div>
      )}

      <Button buttonStyle="primary" disabled={isLoading} size="large" type="submit">
        {isLoading ? 'Signing In...' : 'Sign In'}
      </Button>
    </form>
  )
}

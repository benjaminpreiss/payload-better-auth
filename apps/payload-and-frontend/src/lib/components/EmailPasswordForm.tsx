'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, TextInput, FieldLabel, useField } from '@payloadcms/ui'
import { authClient } from '../auth-client'

interface FormErrors {
  email?: string
  password?: string
  general?: string
}

export function EmailPasswordForm() {
  const router = useRouter()
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)

  // Use useField hooks for each input to get proper setValue functions
  const { value: emailValue, setValue: setEmailValue } = useField<string>({ path: 'email' })
  const { value: passwordValue, setValue: setPasswordValue } = useField<string>({
    path: 'password',
  })

  const handleEmailChange = (value: unknown) => {
    setEmailValue(value)
    // Clear field-specific error when user starts typing
    if (errors.email) {
      setErrors((prev) => ({ ...prev, email: undefined }))
    }
  }

  const handlePasswordChange = (value: unknown) => {
    setPasswordValue(value)
    // Clear field-specific error when user starts typing
    if (errors.password) {
      setErrors((prev) => ({ ...prev, password: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}
    const email = String(emailValue || '')
    const password = String(passwordValue || '')

    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!password.trim()) {
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
    <form onSubmit={handleSubmit} className="email-password-form">
      <div className="form-field" style={{ marginBottom: '1.5rem' }}>
        <FieldLabel htmlFor="email" label="Email" required />
        <TextInput
          value={emailValue || ''}
          onChange={handleEmailChange}
          path="email"
          readOnly={isLoading}
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
          value={passwordValue || ''}
          onChange={handlePasswordChange}
          path="password"
          readOnly={isLoading}
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
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.375rem',
          }}
        >
          {errors.general}
        </div>
      )}

      <Button type="submit" disabled={isLoading} buttonStyle="primary" size="large">
        {isLoading ? 'Signing In...' : 'Sign In'}
      </Button>
    </form>
  )
}

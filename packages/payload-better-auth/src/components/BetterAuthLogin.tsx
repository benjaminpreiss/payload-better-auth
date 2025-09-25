import React from 'react'
import { EmailPasswordForm } from './EmailPasswordForm'

interface AuthMethods {
  authMethods: 'emailAndPassword'[]
}

async function fetchAuthMethods(): Promise<AuthMethods> {
  try {
    const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    const response = await fetch(`${baseURL}/api/auth/auth/methods`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch auth methods: ${response.status}`)
    }

    const data = await response.json()
    return data as AuthMethods
  } catch (error) {
    console.error('Error fetching auth methods:', error)
    // Return default fallback
    return { authMethods: ['emailAndPassword'] }
  }
}

export default async function BetterAuthLogin() {
  const { authMethods } = await fetchAuthMethods()

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            marginBottom: '2rem',
            fontSize: '1.5rem',
            fontWeight: '600',
            color: '#333',
          }}
        >
          Sign In to Admin
        </h2>

        {authMethods.includes('emailAndPassword') && <EmailPasswordForm />}
        {authMethods.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '2rem',
              color: '#666',
            }}
          >
            <p>No authentication methods are currently available.</p>
            <p style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
              Please contact your administrator.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

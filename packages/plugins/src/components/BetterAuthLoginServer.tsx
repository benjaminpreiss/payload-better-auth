import type { createAuthClient } from 'better-auth/react'
import type React from 'react'

import { EmailPasswordFormClient } from './EmailPasswordFormClient.js'

interface AuthMethods {
  authMethods: 'emailAndPassword'[]
}

async function fetchAuthMethods(): Promise<AuthMethods> {
  try {
    const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    const response = await fetch(`${baseURL}/api/auth/auth/methods`, {
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'GET',
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

export async function BetterAuthLoginServer({
  authClientOptions,
}: {
  authClientOptions: Parameters<typeof createAuthClient>['0']
}) {
  const { authMethods } = await fetchAuthMethods()

  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxWidth: '400px',
          padding: '2rem',
          width: '100%',
        }}
      >
        <h2
          style={{
            color: '#333',
            fontSize: '1.5rem',
            fontWeight: '600',
            marginBottom: '2rem',
            textAlign: 'center',
          }}
        >
          Sign In to Admin
        </h2>

        {authMethods.includes('emailAndPassword') && (
          <EmailPasswordFormClient authClientOptions={authClientOptions} />
        )}
        {authMethods.length === 0 && (
          <div
            style={{
              color: '#666',
              padding: '2rem',
              textAlign: 'center',
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

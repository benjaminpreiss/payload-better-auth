import type { ClientOptions } from 'better-auth'
import type React from 'react'

import type { AuthMethod } from '../better-auth/helpers.js'

import { EmailPasswordFormClient } from './EmailPasswordFormClient.js'

export type AuthClientOptions = { baseURL: string } & Omit<ClientOptions, 'baseURL'>

export async function fetchAuthMethods({
  additionalHeaders,
  betterAuthBaseUrl,
  debug = false,
}: {
  additionalHeaders?: HeadersInit
  betterAuthBaseUrl: string
  debug?: boolean
}): Promise<{ data: AuthMethod[]; error: null } | { data: null; error: Error }> {
  const headers = new Headers(additionalHeaders)
  headers.append('Content-Type', 'application/json')
  const url = `${betterAuthBaseUrl}/api/auth/auth/methods`

  if (debug) {
    console.log('[payload-better-auth] fetchAuthMethods: Attempting to fetch auth methods')
    console.log('[payload-better-auth] fetchAuthMethods:   - URL:', url)
    console.log('[payload-better-auth] fetchAuthMethods:   - betterAuthBaseUrl:', betterAuthBaseUrl)
  }

  try {
    const response = await fetch(url, {
      headers,
      method: 'GET',
    })

    if (debug) {
      console.log('[payload-better-auth] fetchAuthMethods: Response received')
      console.log('[payload-better-auth] fetchAuthMethods:   - status:', response.status)
      console.log('[payload-better-auth] fetchAuthMethods:   - statusText:', response.statusText)
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch auth methods: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (debug) {
      console.log('[payload-better-auth] fetchAuthMethods: Successfully fetched auth methods')
      console.log('[payload-better-auth] fetchAuthMethods:   - methods count:', data?.length ?? 0)
    }

    return { data, error: null } as { data: AuthMethod[]; error: null }
  } catch (error) {
    console.error('Error fetching auth methods:', error)
    return { data: null, error: error as Error }
  }
}

export type BetterAuthLoginServerProps = {
  /**
   * Enable debug logging for troubleshooting connection issues.
   */
  debug?: boolean
  /**
   * Auth client options for client-side requests (uses external/public URL).
   */
  externalAuthClientOptions: AuthClientOptions
  /**
   * Auth client options for server-side requests (uses internal URL).
   */
  internalAuthClientOptions: AuthClientOptions
}

export async function BetterAuthLoginServer({
  debug = false,
  externalAuthClientOptions,
  internalAuthClientOptions,
}: BetterAuthLoginServerProps) {
  const authMethods = await fetchAuthMethods({
    additionalHeaders: internalAuthClientOptions.fetchOptions?.headers,
    betterAuthBaseUrl: internalAuthClientOptions.baseURL,
    debug,
  })

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

        {authMethods.data?.some(
          (m) => m.method === 'emailAndPassword' || m.method === 'magicLink',
        ) && (
          <EmailPasswordFormClient
            authClientOptions={externalAuthClientOptions}
            authMethods={authMethods.data}
          />
        )}
        {authMethods.data?.length === 0 && (
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
        {authMethods.error && (
          <div
            style={{
              color: '#666',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <p>Couldn't fetch authentication methods from better-auth</p>
            <p style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
              Please contact your administrator.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

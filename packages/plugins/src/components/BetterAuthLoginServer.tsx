import type { ClientOptions } from 'better-auth'
import type React from 'react'
import type { AuthMethod } from 'src/better-auth/helpers.js'

import { headers } from 'next/headers.js'

import { EmailPasswordFormClient } from './EmailPasswordFormClient.js'

async function getPayloadBaseUrl() {
  const h = await headers()
  // Prefer proxy-aware headers (Vercel, reverse proxies)
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('x-forwarded-host') ?? h.get('host') // fallback for local dev
  if (!host) {
    return ''
  } // or throw, depending on your needs
  return `${proto}://${host}`
}

export async function fetchAuthMethods({
  additionalHeaders,
  betterAuthBaseUrl,
}: {
  additionalHeaders?: HeadersInit
  betterAuthBaseUrl: string
}): Promise<{ data: AuthMethod[]; error: null } | { data: null; error: Error }> {
  const headers = new Headers(additionalHeaders)
  headers.append('Content-Type', 'application/json')
  try {
    const response = await fetch(`${betterAuthBaseUrl}/api/auth/auth/methods`, {
      headers,
      method: 'GET',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch auth methods: ${response.status}`)
    }

    const data = await response.json()
    return { data, error: null } as { data: AuthMethod[]; error: null }
  } catch (error) {
    console.error('Error fetching auth methods:', error)
    return { data: null, error: error as Error }
  }
}

export type BetterAuthLoginServerProps = {
  authClientOptions: { baseURL: string } & Omit<ClientOptions, 'baseURL'>
}

export async function BetterAuthLoginServer({ authClientOptions }: BetterAuthLoginServerProps) {
  const authMethods = await fetchAuthMethods({
    additionalHeaders: authClientOptions.fetchOptions?.headers,
    betterAuthBaseUrl: authClientOptions.baseURL,
  })
  const payloadBaseUrl = await getPayloadBaseUrl()

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
            authClientOptions={authClientOptions}
            authMethods={authMethods.data}
            payloadBaseUrl={payloadBaseUrl}
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

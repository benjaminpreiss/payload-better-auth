'use client'

import { toast } from '@payloadcms/ui'
import { createAuthClient } from 'better-auth/react'
import { useRouter } from 'next/navigation.js'
import { useState } from 'react'

import type { AuthClientOptions } from './BetterAuthLoginServer'

/**
 * Simple logout icon SVG component
 */
function LogOutIcon() {
  return (
    <svg
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}

export interface LogoutButtonClientProps {
  /**
   * Auth client options for Better Auth sign-out.
   * Uses the external (browser-accessible) URL.
   */
  authClientOptions: AuthClientOptions
}

export function LogoutButtonClient({ authClientOptions }: LogoutButtonClientProps) {
  const authClient = createAuthClient(authClientOptions)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleLogout = async () => {
    if (isLoading) {
      return
    }

    setIsLoading(true)

    try {
      // Sign out from Better Auth - this clears the session cookie
      const result = await authClient.signOut()

      if (result.error) {
        toast.error(result.error.message || 'Logout failed')
        setIsLoading(false)
        return
      }

      // Redirect to login page after successful sign-out
      router.push('/admin/login')
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message || 'Logout failed')
      setIsLoading(false)
    }
  }

  return (
    <button
      aria-label="Log out"
      disabled={isLoading}
      onClick={handleLogout}
      style={{
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
        width: '100%',
      }}
      type="button"
    >
      <LogOutIcon />
      <span>{isLoading ? 'Logging out...' : 'Logout'}</span>
    </button>
  )
}

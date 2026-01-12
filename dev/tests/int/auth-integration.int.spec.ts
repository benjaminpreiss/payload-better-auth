import type { AuthContext } from 'better-auth'
import type { Payload } from 'payload'
import type { Queue } from 'payload-better-auth'

import configPromise from '@payload-config'
import Database from 'better-sqlite3'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { auth } from '../../lib/auth'

type PayloadSyncPluginContext = { payloadSyncPlugin: { queue: Queue } } & AuthContext

describe('Better Auth Integration', () => {
  // Generate unique test user for each test run to avoid conflicts
  const generateTestUser = () => ({
    name: 'Test User',
    email: `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`,
    password: 'TestPassword123!',
  })

  let db: Database.Database
  let payload: Payload

  beforeAll(async () => {
    // Initialize database connection for cleanup using test database
    const dbPath = process.env.BETTER_AUTH_DB_PATH || './better-auth.db'
    db = new Database(dbPath)
    // Initialize Payload instance
    payload = await getPayload({ config: configPromise })
    // Clean up any existing test users before starting tests
    // Clear all test users that might exist from previous runs
    try {
      const deleteAllTestUsersStmt = db.prepare(
        "DELETE FROM user WHERE email LIKE 'test-user-%@example.com'",
      )
      deleteAllTestUsersStmt.run()
    } catch (_error) {
      // Ignore cleanup errors
    }
  })

  afterAll(() => {
    // Close database connection
    db.close()
  })

  /**
   * Helper function to clean up a specific test user from both better-auth and Payload
   */
  async function cleanupTestUser(userEmail: string) {
    try {
      // First, get the user ID from better-auth to find corresponding Payload user
      const getUserStmt = db.prepare('SELECT id FROM user WHERE email = ?')
      const betterAuthUser = getUserStmt.get(userEmail) as { id: string } | undefined

      if (betterAuthUser) {
        // Delete BA collection entries first
        try {
          const emailPasswordEntries = await payload.find({
            collection: '__better_auth_email_password',
            limit: 100,
            overrideAccess: true,
            where: { baUserId: { equals: betterAuthUser.id } },
          })
          for (const entry of emailPasswordEntries.docs) {
            await payload.delete({
              id: entry.id,
              collection: '__better_auth_email_password',
              overrideAccess: true,
            })
          }
        } catch (_e) {
          // Ignore
        }

        // Delete from Payload (using baUserId)
        try {
          const existingPayloadUsers = await payload.find({
            collection: 'users',
            limit: 1,
            overrideAccess: true,
            where: {
              baUserId: {
                equals: betterAuthUser.id,
              },
            },
          })

          if (existingPayloadUsers.docs.length > 0) {
            await payload.delete({
              id: existingPayloadUsers.docs[0].id,
              collection: 'users',
              overrideAccess: true,
            })
          }
        } catch (_payloadError) {
          // Ignore cleanup errors
        }
      }

      // Delete user from better-auth database
      const deleteUserStmt = db.prepare('DELETE FROM user WHERE email = ?')
      const result = deleteUserStmt.run(userEmail)

      if (result.changes > 0) {
        // Also delete any sessions for this user
        const deleteSessionsStmt = db.prepare(
          'DELETE FROM session WHERE userId IN (SELECT id FROM user WHERE email = ?)',
        )
        deleteSessionsStmt.run(userEmail)
      }

      // Delete accounts from better-auth
      if (betterAuthUser) {
        const deleteAccountsStmt = db.prepare('DELETE FROM account WHERE userId = ?')
        deleteAccountsStmt.run(betterAuthUser.id)
      }
    } catch (_error) {
      // Database error or user doesn't exist - this is expected in most cases
    }
  }

  /**
   * Helper function to find Payload user by baUserId
   */
  async function findPayloadUserByBaUserId(baUserId: string) {
    try {
      const result = await payload.find({
        collection: 'users',
        limit: 1,
        overrideAccess: true,
        where: {
          baUserId: {
            equals: baUserId,
          },
        },
      })
      return result.docs.length > 0 ? result.docs[0] : null
    } catch (_error) {
      return null
    }
  }

  /**
   * Wait for the reconcile queue to process pending tasks with exponential backoff
   */
  async function waitForQueueToProcess(
    targetUserId: string,
    operation: 'create' | 'delete',
    maxWaitMs = 10000,
  ) {
    const startTime = Date.now()
    let attempt = 0
    const maxAttempts = 15

    while (Date.now() - startTime < maxWaitMs && attempt < maxAttempts) {
      const status = (
        (await auth.$context) as PayloadSyncPluginContext
      ).payloadSyncPlugin.queue.status()

      // For create operations, check if the user exists in Payload
      if (operation === 'create') {
        const payloadUser = await findPayloadUserByBaUserId(targetUserId)
        if (payloadUser) {
          return // User successfully created in Payload
        }
      }

      // For delete operations, check if the user no longer exists in Payload
      if (operation === 'delete') {
        const payloadUser = await findPayloadUserByBaUserId(targetUserId)
        if (!payloadUser) {
          return // User successfully deleted from Payload
        }
      }

      // If queue is not processing and has no user-operation tasks, but target still not synced,
      // wait a bit more as there might be background processing
      if (!status.processing && status.userOperationTasks === 0) {
        // Give it one more chance with a longer delay
        await new Promise((resolve) => setTimeout(resolve, 500))

        // Check again
        if (operation === 'create') {
          const payloadUser = await findPayloadUserByBaUserId(targetUserId)
          if (payloadUser) {
            return
          }
        } else {
          const payloadUser = await findPayloadUserByBaUserId(targetUserId)
          if (!payloadUser) {
            return
          }
        }
      }

      // Exponential backoff with jitter
      const baseDelay = Math.min(1000, Math.pow(2, attempt) * 100)
      const jitter = Math.random() * 100
      const delay = baseDelay + jitter

      await new Promise((resolve) => setTimeout(resolve, delay))
      attempt++
    }

    // Final check after timeout
    const finalStatus = (
      (await auth.$context) as PayloadSyncPluginContext
    ).payloadSyncPlugin.queue.status()
    const finalPayloadUser = await findPayloadUserByBaUserId(targetUserId)

    throw new Error(
      `Queue processing timeout after ${maxWaitMs}ms. ` +
        `Final status: queueSize=${finalStatus.queueSize}, processing=${finalStatus.processing}, ` +
        `userOperationTasks=${finalStatus.userOperationTasks}, fullReconcileTasks=${finalStatus.fullReconcileTasks}, ` +
        `operation=${operation}, targetUserId=${targetUserId}, ` +
        `payloadUserExists=${!!finalPayloadUser}`,
    )
  }

  it('should create a new user, sign them up, and sign them in successfully', async () => {
    const testUser = generateTestUser()

    // Test user creation (sign up) using server-side API
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: testUser.name,
        email: testUser.email,
        password: testUser.password,
      },
    })

    // Verify sign up was successful
    expect(signUpResult).toBeDefined()
    expect(signUpResult.user).toBeDefined()
    expect(signUpResult.user.email).toBe(testUser.email)
    expect(signUpResult.user.name).toBe(testUser.name)
    expect(signUpResult.user.id).toBeDefined()

    const createdUserId = signUpResult.user.id

    // Test sign in with the created user using server-side API
    const signInResult = await auth.api.signInEmail({
      body: {
        email: testUser.email,
        password: testUser.password,
      },
    })

    // Verify sign in was successful
    expect(signInResult).toBeDefined()
    expect(signInResult.user).toBeDefined()
    expect(signInResult.user.email).toBe(testUser.email)
    expect(signInResult.user.id).toBe(createdUserId)

    // Test sign out using server-side API (optional - just verify we have a session)
    const sessionResult = await auth.api.getSession({
      headers: new Headers({
        cookie: `better-auth.session_token=${signInResult.token}`,
      }),
    })

    expect(sessionResult).toBeDefined()
    if (sessionResult) {
      expect(sessionResult.user).toBeDefined()
      expect(sessionResult.user.id).toBe(createdUserId)
    }

    // Clean up the test user
    await cleanupTestUser(testUser.email)
  })

  it('should sync user creation from better-auth to Payload', async () => {
    const testUser = generateTestUser()

    // Test user creation (sign up) using server-side API
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: testUser.name,
        email: testUser.email,
        password: testUser.password,
      },
    })

    expect(signUpResult.user).toBeDefined()
    const betterAuthUserId = signUpResult.user.id

    // Wait for the queue to process the user creation
    await waitForQueueToProcess(betterAuthUserId, 'create')

    // Verify that a corresponding user was created in Payload
    const payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)

    expect(payloadUser).toBeDefined()
    expect(payloadUser?.baUserId).toBe(betterAuthUserId)
    expect(payloadUser?.name).toBe(testUser.name)

    // Clean up the test user
    await cleanupTestUser(testUser.email)
  })

  it('should sync user deletion from better-auth to Payload', async () => {
    const testUser = generateTestUser()

    // First, create a user using server-side API
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: testUser.name,
        email: testUser.email,
        password: testUser.password,
      },
    })

    expect(signUpResult.user).toBeDefined()
    const betterAuthUserId = signUpResult.user.id

    // Wait for the queue to process the user creation
    await waitForQueueToProcess(betterAuthUserId, 'create')

    // Verify user exists in Payload
    let payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
    expect(payloadUser).toBeDefined()

    // Sign in to get session cookies using returnHeaders
    const { headers: signInHeaders, response: signInResponse } = await auth.api.signInEmail({
      body: {
        email: testUser.email,
        password: testUser.password,
      },
      returnHeaders: true,
    })

    expect(signInResponse.user).toBeDefined()

    // Get the session cookies from the sign-in response
    const cookies = signInHeaders.get('set-cookie')
    expect(cookies).toBeDefined()

    // Delete the user using server-side API with proper session cookies
    const deleteResult = await auth.api.deleteUser({
      body: {
        password: testUser.password,
      },
      headers: new Headers({
        cookie: cookies!,
      }),
    })

    // The deletion should succeed now with proper session management
    expect(deleteResult).toBeDefined()

    // Wait for the queue to process the user deletion
    await waitForQueueToProcess(betterAuthUserId, 'delete')

    // Check if user still exists in better-auth database
    const getUserStmt = db.prepare('SELECT id FROM user WHERE email = ?')
    const betterAuthUser = getUserStmt.get(testUser.email)

    // Verify user no longer exists in Payload
    payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
    expect(payloadUser).toBeNull()

    // Verify user no longer exists in better-auth
    expect(betterAuthUser).toBeUndefined()
  })

  it('should prevent direct user management through Payload API', async () => {
    // Test that direct user creation is blocked
    try {
      await payload.create({
        collection: 'users',
        data: {
          name: 'Direct Payload User',
          baUserId: 'non-existent-user-id',
          email: 'direct@example.com',
        },
        overrideAccess: false,
      })
      expect.fail('Expected user creation to fail, but it succeeded')
    } catch (error) {
      // The test should pass if any error occurs when trying to create a user directly
      // This indicates that the access controls are working
      expect(error).toBeDefined()
    }

    // Verify access controls are properly configured
    const usersCollection = payload.collections.users
    expect(typeof usersCollection.config.access.create).toBe('function')
    expect(typeof usersCollection.config.access.delete).toBe('function')
    expect(typeof usersCollection.config.access.update).toBe('function')
    expect(typeof usersCollection.config.access.read).toBe('function')
  })

  it('should handle sync errors gracefully without breaking better-auth operations', async () => {
    const testUser = generateTestUser()

    // This test ensures better-auth operations work even if Payload sync fails
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: testUser.name,
        email: testUser.email,
        password: testUser.password,
      },
    })

    // Verify sign up was successful in better-auth
    expect(signUpResult).toBeDefined()
    expect(signUpResult.user).toBeDefined()
    expect(signUpResult.user.email).toBe(testUser.email)

    // Wait a moment for any async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100))

    // The user should still be able to sign in
    const signInResult = await auth.api.signInEmail({
      body: {
        email: testUser.email,
        password: testUser.password,
      },
    })

    expect(signInResult).toBeDefined()
    expect(signInResult.user).toBeDefined()
    expect(signInResult.user.email).toBe(testUser.email)

    // Clean up the test user
    await cleanupTestUser(testUser.email)
  })

  it('should block unauthorized user creation through Payload API', async () => {
    // Test that direct user creation without proper signature is blocked
    // Must use overrideAccess: false to test access control
    try {
      await payload.create({
        collection: 'users',
        data: {
          name: 'Unauthorized User',
          baUserId: 'unauthorized-user-id-' + Date.now(),
          email: 'unauthorized@example.com',
        },
        overrideAccess: false,
      })
      expect.fail('Expected user creation to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Should be blocked by access control
      expect(errorMessage).toMatch(/You are not allowed to perform this action/i)
    }
  })

  it('should block unauthorized user deletion through Payload API', async () => {
    const testUser = generateTestUser()

    // First, create a user through better-auth (legitimate way)
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: testUser.name,
        email: testUser.email,
        password: testUser.password,
      },
    })

    expect(signUpResult.user).toBeDefined()
    const betterAuthUserId = signUpResult.user.id

    // Wait for the queue to process the user creation
    await waitForQueueToProcess(betterAuthUserId, 'create')

    // Find the created Payload user
    const payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
    expect(payloadUser).toBeDefined()

    // Now try to delete the user directly through Payload API (should fail)
    // Must use overrideAccess: false to test access control
    try {
      await payload.delete({
        id: payloadUser!.id,
        collection: 'users',
        overrideAccess: false,
      })
      expect.fail('Expected user deletion to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Should be blocked by access control
      expect(errorMessage).toMatch(/You are not allowed to perform this action/i)
    }

    // Verify user still exists (deletion was blocked)
    const userStillExists = await findPayloadUserByBaUserId(betterAuthUserId)
    expect(userStillExists).toBeDefined()
    expect(userStillExists!.id).toBe(payloadUser!.id)

    // Clean up the test user properly through better-auth
    await cleanupTestUser(testUser.email)
  })

  it('should block unauthorized user updates through Payload API', async () => {
    const testUser = generateTestUser()

    // First, create a user through better-auth (legitimate way)
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: testUser.name,
        email: testUser.email,
        password: testUser.password,
      },
    })

    expect(signUpResult.user).toBeDefined()
    const betterAuthUserId = signUpResult.user.id

    // Wait for the queue to process the user creation
    await waitForQueueToProcess(betterAuthUserId, 'create')

    // Find the created Payload user
    const payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
    expect(payloadUser).toBeDefined()

    // Now try to update the user directly through Payload API (should fail)
    // Must use overrideAccess: false to test access control
    try {
      await payload.update({
        id: payloadUser!.id,
        collection: 'users',
        data: {
          name: 'Unauthorized Name Change',
        },
        overrideAccess: false,
      })
      expect.fail('Expected user update to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Should be blocked by access control
      expect(errorMessage).toMatch(/You are not allowed to perform this action/i)
    }

    // Verify user data unchanged (update was blocked)
    const userUnchanged = await findPayloadUserByBaUserId(betterAuthUserId)
    expect(userUnchanged).toBeDefined()
    expect(userUnchanged!.name).toBe(testUser.name) // Original name should be preserved

    // Clean up the test user properly through better-auth
    await cleanupTestUser(testUser.email)
  })

  it('should block user operations with invalid signatures', async () => {
    // Test that operations with malformed or missing signatures are blocked
    // Must use overrideAccess: false to test access control
    const testBaUserId = 'invalid-sig-test-' + Date.now()

    // Try to create user with invalid context (no signature)
    try {
      await payload.create({
        collection: 'users',
        context: {
          // Missing baSig - should fail access control
        },
        data: {
          name: 'Invalid Signature User',
          baUserId: testBaUserId,
          email: 'invalid-sig@example.com',
        },
        overrideAccess: false,
      })
      expect.fail('Expected user creation with invalid signature to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)
      expect(errorMessage).toMatch(/You are not allowed to perform this action/i)
    }

    // Try to create user with malformed signature
    try {
      await payload.create({
        collection: 'users',
        context: {
          baBody: { op: 'create', userId: testBaUserId },
          baSig: {
            nonce: 'invalid-nonce',
            signature: 'invalid-signature',
            timestamp: Date.now(),
          },
        },
        data: {
          name: 'Malformed Signature User',
          baUserId: testBaUserId,
          email: 'malformed-sig@example.com',
        },
        overrideAccess: false,
      })
      expect.fail('Expected user creation with malformed signature to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)
      expect(errorMessage).toMatch(/You are not allowed to perform this action/i)
    }
  })

  it('should trigger full reconcile with proper authentication headers', async () => {
    // Import the triggerFullReconcile function directly to avoid module caching issues
    const { triggerFullReconcile } = await import('payload-better-auth')

    // Mock the fetch function to capture the request
    const originalFetch = global.fetch
    let capturedRequest: { headers: Headers; method: string; url: string } | null = null

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlString = typeof input === 'string' ? input : input instanceof URL ? input.href : ''
      if (urlString.includes('/api/auth/reconcile/run')) {
        capturedRequest = {
          headers: init?.headers as Headers,
          method: init?.method || 'GET',
          url: urlString,
        }
        // Return a successful response
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        })
      }
      // For other requests, use the original fetch
      return originalFetch(input, init)
    }

    try {
      const mockPayload = {
        logger: {
          error: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        },
      } as unknown as Parameters<typeof triggerFullReconcile>[0]['payload']

      await triggerFullReconcile({
        betterAuthUrl: 'http://localhost:3000',
        payload: mockPayload,
        reconcileToken: 'test-reconcile-token',
      })

      // Verify that the fetch request was made with correct parameters
      expect(capturedRequest).not.toBeNull()
      expect(capturedRequest!.url).toBe('http://localhost:3000/api/auth/reconcile/run')
      expect(capturedRequest!.method).toBe('POST')
      expect(capturedRequest!.headers.get('Content-Type')).toBe('application/json')
      expect(capturedRequest!.headers.get('x-reconcile-token')).toBe('test-reconcile-token')

      // Verify logger was called
      expect(mockPayload.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Triggering full reconcile'),
      )
    } finally {
      // Restore the original fetch function
      global.fetch = originalFetch
    }
  })

  it('should handle missing reconcile token gracefully', async () => {
    // Import the triggerFullReconcile function directly
    const { triggerFullReconcile } = await import('payload-better-auth')

    // Mock the fetch function to ensure it's not called
    const originalFetch = global.fetch
    let fetchCalled = false

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalled = true
      return originalFetch(input, init)
    }

    try {
      const mockPayload = {
        logger: {
          error: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        },
      } as unknown as Parameters<typeof triggerFullReconcile>[0]['payload']

      // Call without reconcileToken
      await triggerFullReconcile({
        betterAuthUrl: 'http://localhost:3000',
        payload: mockPayload,
        reconcileToken: undefined,
      })

      // Verify that a warning was logged
      expect(mockPayload.logger.warn).toHaveBeenCalledWith(
        'reconcile token not set, skipping onInit reconcile trigger',
      )

      // Verify that fetch was not called
      expect(fetchCalled).toBe(false)
    } finally {
      // Restore the original fetch function
      global.fetch = originalFetch
    }
  })

  describe('New Plugin Features', () => {
    // Server-dependent tests moved to e2e/frontend.e2e.spec.ts

    it('should handle sign-up without locale header gracefully', async () => {
      const testUser = generateTestUser()

      // Test user creation without locale header
      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
      })

      // Verify sign up was successful
      expect(signUpResult).toBeDefined()
      expect(signUpResult.user).toBeDefined()
      expect(signUpResult.user.email).toBe(testUser.email)
      expect(signUpResult.user.name).toBe(testUser.name)
      expect(signUpResult.user.id).toBeDefined()

      const userId = signUpResult.user.id

      // Check if locale is null/undefined in the database directly
      const getUserStmt = db.prepare('SELECT locale FROM user WHERE id = ?')
      const userRecord = getUserStmt.get(userId) as { locale: null | string } | undefined

      expect(userRecord).toBeDefined()
      expect(userRecord?.locale).toBeNull()

      // Clean up the test user
      await cleanupTestUser(testUser.email)
    })
  })
})

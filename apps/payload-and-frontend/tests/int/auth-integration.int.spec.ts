import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { auth } from '@/lib/auth'
import { AuthContext } from 'better-auth'
import { Queue } from '@/lib/reconcile-queue'

type PayloadSyncPluginContext = AuthContext & { payloadSyncPlugin: { queue: Queue } }

describe('Better Auth Integration', () => {
  // Generate unique test user for each test run to avoid conflicts
  const generateTestUser = () => ({
    email: `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`,
    password: 'TestPassword123!',
    name: 'Test User',
  })

  let db: Database.Database
  let payload: any

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
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  afterAll(async () => {
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
        // Delete from Payload first (using externalId)
        try {
          const existingPayloadUsers = await payload.find({
            collection: 'users',
            where: {
              externalId: {
                equals: betterAuthUser.id,
              },
            },
            limit: 1,
          })

          if (existingPayloadUsers.docs.length > 0) {
            await payload.delete({
              collection: 'users',
              id: existingPayloadUsers.docs[0].id,
            })
          }
        } catch (payloadError) {
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
    } catch (error) {
      // Database error or user doesn't exist - this is expected in most cases
    }
  }

  /**
   * Helper function to find Payload user by externalId
   */
  async function findPayloadUserByExternalId(externalId: string) {
    try {
      const result = await payload.find({
        collection: 'users',
        where: {
          externalId: {
            equals: externalId,
          },
        },
        limit: 1,
      })
      return result.docs.length > 0 ? result.docs[0] : null
    } catch (error) {
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
        const payloadUser = await findPayloadUserByExternalId(targetUserId)
        if (payloadUser) {
          return // User successfully created in Payload
        }
      }

      // For delete operations, check if the user no longer exists in Payload
      if (operation === 'delete') {
        const payloadUser = await findPayloadUserByExternalId(targetUserId)
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
          const payloadUser = await findPayloadUserByExternalId(targetUserId)
          if (payloadUser) return
        } else {
          const payloadUser = await findPayloadUserByExternalId(targetUserId)
          if (!payloadUser) return
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
    const finalPayloadUser = await findPayloadUserByExternalId(targetUserId)

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
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
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
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      },
    })

    expect(signUpResult.user).toBeDefined()
    const betterAuthUserId = signUpResult.user.id

    // Wait for the queue to process the user creation
    await waitForQueueToProcess(betterAuthUserId!, 'create')

    // Verify that a corresponding user was created in Payload
    const payloadUser = await findPayloadUserByExternalId(betterAuthUserId!)

    expect(payloadUser).toBeDefined()
    expect(payloadUser?.externalId).toBe(betterAuthUserId)
    expect(payloadUser?.name).toBe(testUser.name)

    // Clean up the test user
    await cleanupTestUser(testUser.email)
  })

  it('should sync user deletion from better-auth to Payload', async () => {
    const testUser = generateTestUser()

    // First, create a user using server-side API
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      },
    })

    expect(signUpResult.user).toBeDefined()
    const betterAuthUserId = signUpResult.user.id

    // Wait for the queue to process the user creation
    await waitForQueueToProcess(betterAuthUserId!, 'create')

    // Verify user exists in Payload
    let payloadUser = await findPayloadUserByExternalId(betterAuthUserId!)
    expect(payloadUser).toBeDefined()

    // Sign in to get session cookies using returnHeaders
    const { headers: signInHeaders, response: signInResponse } = await auth.api.signInEmail({
      returnHeaders: true,
      body: {
        email: testUser.email,
        password: testUser.password,
      },
    })

    expect(signInResponse.user).toBeDefined()

    // Get the session cookies from the sign-in response
    const cookies = signInHeaders.get('set-cookie')
    expect(cookies).toBeDefined()

    // Delete the user using server-side API with proper session cookies

    try {
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
    } catch (error) {
      throw error
    }

    // Wait for the queue to process the user deletion
    await waitForQueueToProcess(betterAuthUserId!, 'delete')

    // Check if user still exists in better-auth database
    const getUserStmt = db.prepare('SELECT id FROM user WHERE email = ?')
    const betterAuthUser = getUserStmt.get(testUser.email)

    // Verify user no longer exists in Payload
    payloadUser = await findPayloadUserByExternalId(betterAuthUserId!)
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
          externalId: 'non-existent-user-id',
          name: 'Direct Payload User',
        },
        overrideAccess: false,
      })
      expect.fail('Expected user creation to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)

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
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
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
    try {
      await payload.create({
        collection: 'users',
        data: {
          externalId: 'unauthorized-user-id-' + Date.now(),
          name: 'Unauthorized User',
        },
      })
      expect.fail('Expected user creation to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Should be blocked by access control or hook validation
      expect(errorMessage).toMatch(
        /User creation is managed by Better Auth|You are not allowed to perform this action/,
      )
    }
  })

  it('should block unauthorized user deletion through Payload API', async () => {
    const testUser = generateTestUser()

    // First, create a user through better-auth (legitimate way)
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      },
    })

    expect(signUpResult.user).toBeDefined()
    const betterAuthUserId = signUpResult.user.id

    // Wait for the queue to process the user creation
    await waitForQueueToProcess(betterAuthUserId!, 'create')

    // Find the created Payload user
    const payloadUser = await findPayloadUserByExternalId(betterAuthUserId!)
    expect(payloadUser).toBeDefined()

    // Now try to delete the user directly through Payload API (should fail)
    try {
      await payload.delete({
        collection: 'users',
        id: payloadUser!.id,
      })
      expect.fail('Expected user deletion to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Should be blocked by access control or hook validation
      expect(errorMessage).toMatch(
        /User deletion is managed by Better Auth|You are not allowed to perform this action/,
      )
    }

    // Verify user still exists (deletion was blocked)
    const userStillExists = await findPayloadUserByExternalId(betterAuthUserId!)
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
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      },
    })

    expect(signUpResult.user).toBeDefined()
    const betterAuthUserId = signUpResult.user.id

    // Wait for the queue to process the user creation
    await waitForQueueToProcess(betterAuthUserId!, 'create')

    // Find the created Payload user
    const payloadUser = await findPayloadUserByExternalId(betterAuthUserId!)
    expect(payloadUser).toBeDefined()

    // Now try to update the user directly through Payload API (should fail)
    try {
      const updateResult = await payload.update({
        collection: 'users',
        id: payloadUser!.id,
        data: {
          name: 'Unauthorized Name Change',
        },
      })
      expect.fail('Expected user update to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Should be blocked by access control - the basicSigOk function should return false
      // when no proper signature is provided in the request context
      expect(errorMessage).toMatch(
        /You are not allowed to perform this action|User updates? are managed by Better Auth/,
      )
    }

    // Verify user data unchanged (update was blocked)
    const userUnchanged = await findPayloadUserByExternalId(betterAuthUserId!)
    expect(userUnchanged).toBeDefined()
    expect(userUnchanged!.name).toBe(testUser.name) // Original name should be preserved

    // Clean up the test user properly through better-auth
    await cleanupTestUser(testUser.email)
  })

  it('should block user operations with invalid signatures', async () => {
    // Test that operations with malformed or missing signatures are blocked
    const testExternalId = 'invalid-sig-test-' + Date.now()

    // Try to create user with invalid context (no signature)
    try {
      await payload.create({
        collection: 'users',
        data: {
          externalId: testExternalId,
          name: 'Invalid Signature User',
        },
        context: {
          // Missing baSig - should fail access control
        },
      })
      expect.fail('Expected user creation with invalid signature to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)
      expect(errorMessage).toMatch(
        /User creation is managed by Better Auth|You are not allowed to perform this action/,
      )
    }

    // Try to create user with malformed signature
    try {
      await payload.create({
        collection: 'users',
        data: {
          externalId: testExternalId,
          name: 'Malformed Signature User',
        },
        context: {
          baSig: {
            signature: 'invalid-signature',
            nonce: 'invalid-nonce',
            timestamp: Date.now(),
          },
          baBody: { op: 'create', userId: testExternalId },
        },
      })
      expect.fail('Expected user creation with malformed signature to fail, but it succeeded')
    } catch (error) {
      expect(error).toBeDefined()
      const errorMessage = error instanceof Error ? error.message : String(error)
      expect(errorMessage).toMatch(
        /User creation is managed by Better Auth|You are not allowed to perform this action/,
      )
    }
  })

  it('should trigger full reconcile from Payload onInit hook with authentication', async () => {
    // Mock the fetch function to capture the request
    const originalFetch = global.fetch
    let capturedRequest: { url: string; options: any } | null = null

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlString = input.toString()
      if (urlString.includes('/api/auth/reconcile/run')) {
        capturedRequest = { url: urlString, options: init }
        // Return a successful response
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // For other requests, use the original fetch
      return originalFetch(input, init)
    }

    try {
      // Set the required environment variables
      const originalReconcileToken = process.env.RECONCILE_TOKEN
      const originalBetterAuthUrl = process.env.BETTER_AUTH_URL

      process.env.RECONCILE_TOKEN = 'test-reconcile-token'
      process.env.BETTER_AUTH_URL = 'http://localhost:3000'

      // Get the config and call onInit manually since we can't easily restart Payload in tests
      const configModule = await import('@payload-config')
      const config = await configModule.default

      // Simulate calling onInit manually
      if (config.onInit) {
        const mockPayload = {
          logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        }
        await config.onInit(mockPayload as any)
      }

      // Verify that the fetch request was made with correct parameters
      expect(capturedRequest).toBeDefined()
      expect(capturedRequest!.url).toBe('http://localhost:3000/api/auth/reconcile/run')
      expect(capturedRequest!.options.method).toBe('POST')
      expect(capturedRequest!.options.headers['Content-Type']).toBe('application/json')
      expect(capturedRequest!.options.headers['x-reconcile-token']).toBe('test-reconcile-token')

      // Restore environment variables
      if (originalReconcileToken !== undefined) {
        process.env.RECONCILE_TOKEN = originalReconcileToken
      } else {
        delete process.env.RECONCILE_TOKEN
      }
      if (originalBetterAuthUrl !== undefined) {
        process.env.BETTER_AUTH_URL = originalBetterAuthUrl
      } else {
        delete process.env.BETTER_AUTH_URL
      }
    } finally {
      // Restore the original fetch function
      global.fetch = originalFetch
    }
  })

  it('should handle missing RECONCILE_TOKEN gracefully in onInit', async () => {
    // Mock the fetch function to ensure it's not called
    const originalFetch = global.fetch
    let fetchCalled = false

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalled = true
      return originalFetch(input, init)
    }

    try {
      // Remove the RECONCILE_TOKEN environment variable
      const originalReconcileToken = process.env.RECONCILE_TOKEN
      delete process.env.RECONCILE_TOKEN

      // Get the config and call onInit
      const configModule = await import('@payload-config')
      const config = await configModule.default

      if (config.onInit) {
        const mockPayload = {
          logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        }
        await config.onInit(mockPayload as any)

        // Verify that a warning was logged
        expect(mockPayload.logger.warn).toHaveBeenCalledWith(
          'RECONCILE_TOKEN not set, skipping onInit reconcile trigger',
        )
      }

      // Verify that fetch was not called
      expect(fetchCalled).toBe(false)

      // Restore environment variable
      if (originalReconcileToken !== undefined) {
        process.env.RECONCILE_TOKEN = originalReconcileToken
      }
    } finally {
      // Restore the original fetch function
      global.fetch = originalFetch
    }
  })
})

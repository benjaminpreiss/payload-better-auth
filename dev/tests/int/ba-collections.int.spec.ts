import type { AuthContext } from 'better-auth'
import type { Payload } from 'payload'
import type { Queue } from 'payload-better-auth'

import configPromise from '@payload-config'
import Database from 'better-sqlite3'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { auth } from '../../lib/auth'

type PayloadSyncPluginContext = { payloadSyncPlugin: { queue: Queue } } & AuthContext

describe('Better Auth Collections Integration', () => {
  // Generate unique test user for each test run to avoid conflicts
  const generateTestUser = () => ({
    name: 'BA Collection Test User',
    email: `ba-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`,
    password: 'TestPassword123!',
  })

  let db: Database.Database
  let payload: Payload
  const collectionPrefix = '__better_auth'
  const emailPasswordSlug = `${collectionPrefix}_email_password`
  const magicLinkSlug = `${collectionPrefix}_magic_link`

  beforeAll(async () => {
    // Initialize database connection for cleanup using test database
    const dbPath = process.env.BETTER_AUTH_DB_PATH || './better-auth.db'
    db = new Database(dbPath)
    // Initialize Payload instance
    payload = await getPayload({ config: configPromise })
    // Clean up any existing test users before starting tests
    try {
      const deleteAllTestUsersStmt = db.prepare(
        "DELETE FROM user WHERE email LIKE 'ba-test-%@example.com'",
      )
      deleteAllTestUsersStmt.run()
    } catch (_error) {
      // Ignore cleanup errors
    }
  })

  afterAll(() => {
    db.close()
  })

  /**
   * Helper function to clean up a specific test user from both better-auth and Payload
   */
  async function cleanupTestUser(userEmail: string) {
    try {
      // First, get the user ID from better-auth
      const getUserStmt = db.prepare('SELECT id FROM user WHERE email = ?')
      const betterAuthUser = getUserStmt.get(userEmail) as { id: string } | undefined

      if (betterAuthUser) {
        // Delete BA collection entries
        try {
          const emailPasswordEntries = await payload.find({
            collection: emailPasswordSlug,
            limit: 100,
            overrideAccess: true,
            where: { baUserId: { equals: betterAuthUser.id } },
          })
          for (const entry of emailPasswordEntries.docs) {
            await payload.delete({
              id: entry.id,
              collection: emailPasswordSlug,
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
            where: { baUserId: { equals: betterAuthUser.id } },
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
      deleteUserStmt.run(userEmail)

      // Delete sessions
      const deleteSessionsStmt = db.prepare('DELETE FROM session WHERE userId = ?')
      if (betterAuthUser) {
        deleteSessionsStmt.run(betterAuthUser.id)
      }

      // Delete accounts
      const deleteAccountsStmt = db.prepare('DELETE FROM account WHERE userId = ?')
      if (betterAuthUser) {
        deleteAccountsStmt.run(betterAuthUser.id)
      }
    } catch (_error) {
      // Database error or user doesn't exist
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
        where: { baUserId: { equals: baUserId } },
      })
      return result.docs.length > 0 ? result.docs[0] : null
    } catch (_error) {
      return null
    }
  }

  /**
   * Helper function to find BA collection entry by baUserId
   */
  async function findEmailPasswordEntry(baUserId: string) {
    try {
      const result = await payload.find({
        collection: emailPasswordSlug,
        limit: 1,
        overrideAccess: true,
        where: { baUserId: { equals: baUserId } },
      })
      return result.docs.length > 0 ? result.docs[0] : null
    } catch (_error) {
      return null
    }
  }

  /**
   * Wait for the reconcile queue to process pending tasks
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
      if (operation === 'create') {
        const payloadUser = await findPayloadUserByBaUserId(targetUserId)
        if (payloadUser) {
          return
        }
      }

      if (operation === 'delete') {
        const payloadUser = await findPayloadUserByBaUserId(targetUserId)
        if (!payloadUser) {
          return
        }
      }

      const baseDelay = Math.min(1000, Math.pow(2, attempt) * 100)
      const jitter = Math.random() * 100
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter))
      attempt++
    }

    throw new Error(`Queue processing timeout for ${operation} operation on user ${targetUserId}`)
  }

  describe('BA Collections Structure', () => {
    it('should have email_password collection created', () => {
      const collections = payload.collections
      expect(collections[emailPasswordSlug]).toBeDefined()
    })

    it('should have magic_link collection created', () => {
      const collections = payload.collections
      expect(collections[magicLinkSlug]).toBeDefined()
    })

    it('should have users collection with BA relationship fields', () => {
      const usersCollection = payload.collections.users
      expect(usersCollection).toBeDefined()

      // Check for baUserId field
      const baUserIdField = usersCollection.config.fields.find(
        (f) => 'name' in f && f.name === 'baUserId',
      )
      expect(baUserIdField).toBeDefined()

      // Check for betterAuthAccounts polymorphic relationship field
      const betterAuthAccountsField = usersCollection.config.fields.find(
        (f) => 'name' in f && f.name === 'betterAuthAccounts',
      )
      expect(betterAuthAccountsField).toBeDefined()

      // Verify it's a hasMany polymorphic relationship
      if (betterAuthAccountsField && 'type' in betterAuthAccountsField) {
        expect(betterAuthAccountsField.type).toBe('relationship')
        expect((betterAuthAccountsField as { hasMany?: boolean }).hasMany).toBe(true)
      }
    })
  })

  describe('User Sync with BA Collections', () => {
    it('should create BA collection entry when user signs up with email/password', async () => {
      const testUser = generateTestUser()

      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
      })

      expect(signUpResult.user).toBeDefined()
      const betterAuthUserId = signUpResult.user.id

      // Wait for queue to process
      await waitForQueueToProcess(betterAuthUserId, 'create')

      // Verify Payload user was created
      const payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
      expect(payloadUser).toBeDefined()
      expect(payloadUser?.baUserId).toBe(betterAuthUserId)

      // Verify BA collection entry was created
      const emailPasswordEntry = await findEmailPasswordEntry(betterAuthUserId)
      expect(emailPasswordEntry).toBeDefined()
      expect((emailPasswordEntry as { baUserId?: string })?.baUserId).toBe(betterAuthUserId)
      expect((emailPasswordEntry as { email?: string })?.email).toBe(testUser.email)

      // Clean up
      await cleanupTestUser(testUser.email)
    })

    it('should create user with fields from mapUserToPayload callback', async () => {
      const testUser = generateTestUser()

      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
      })

      expect(signUpResult.user).toBeDefined()
      const betterAuthUserId = signUpResult.user.id

      // Wait for queue to process
      await waitForQueueToProcess(betterAuthUserId, 'create')

      // Verify Payload user has mapped fields
      const payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
      expect(payloadUser).toBeDefined()
      expect((payloadUser as { name?: string })?.name).toBe(testUser.name)
      expect((payloadUser as { email?: string })?.email).toBe(testUser.email)

      // Clean up
      await cleanupTestUser(testUser.email)
    })

    it('should link user to BA collection entry via relationship', async () => {
      const testUser = generateTestUser()

      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
      })

      expect(signUpResult.user).toBeDefined()
      const betterAuthUserId = signUpResult.user.id

      // Wait for queue to process
      await waitForQueueToProcess(betterAuthUserId, 'create')

      // Find BA collection entry
      const emailPasswordEntry = await findEmailPasswordEntry(betterAuthUserId)
      expect(emailPasswordEntry).toBeDefined()

      // Find user and check relationship
      const payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
      expect(payloadUser).toBeDefined()

      // The user should have a relationship to the BA collection entry via betterAuthAccounts
      // Note: The value can be either just the ID or the full populated document object
      type PolymorphicRelation = {
        relationTo: string
        value: { id: number | string } | number | string
      }
      const betterAuthAccounts = (payloadUser as { betterAuthAccounts?: PolymorphicRelation[] })
        ?.betterAuthAccounts
      expect(betterAuthAccounts).toBeDefined()
      expect(betterAuthAccounts?.length).toBeGreaterThan(0)

      // Find the email password entry in the polymorphic relationships
      const emailPasswordRelation = betterAuthAccounts?.find(
        (r) => r.relationTo === emailPasswordSlug,
      )
      expect(emailPasswordRelation).toBeDefined()

      // The value might be the ID directly or a populated object
      const relationValue = emailPasswordRelation?.value
      const relationId =
        typeof relationValue === 'object' && relationValue !== null
          ? (relationValue as { id: number | string }).id
          : relationValue
      expect(relationId).toBe(emailPasswordEntry?.id)

      // Clean up
      await cleanupTestUser(testUser.email)
    })

    it('should delete BA collection entry when user is deleted', async () => {
      const testUser = generateTestUser()

      // Create user
      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
      })

      const betterAuthUserId = signUpResult.user.id
      await waitForQueueToProcess(betterAuthUserId, 'create')

      // Verify entries exist
      let payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
      let emailPasswordEntry = await findEmailPasswordEntry(betterAuthUserId)
      expect(payloadUser).toBeDefined()
      expect(emailPasswordEntry).toBeDefined()

      // Sign in and delete user through Better Auth
      const { headers: signInHeaders } = await auth.api.signInEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
        },
        returnHeaders: true,
      })

      const cookies = signInHeaders.get('set-cookie')
      await auth.api.deleteUser({
        body: { password: testUser.password },
        headers: new Headers({ cookie: cookies! }),
      })

      // Wait for deletion to process
      await waitForQueueToProcess(betterAuthUserId, 'delete')

      // Verify both entries are deleted
      payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
      emailPasswordEntry = await findEmailPasswordEntry(betterAuthUserId)
      expect(payloadUser).toBeNull()
      expect(emailPasswordEntry).toBeNull()
    })
  })

  describe('BA Collections Access Control', () => {
    it('should block direct creation on BA collections', async () => {
      try {
        await payload.create({
          collection: emailPasswordSlug,
          data: {
            baAccountId: 'fake-account-id',
            baUserId: 'fake-user-id',
            email: 'fake@example.com',
            emailVerified: false,
          },
          overrideAccess: false,
        })
        expect.fail('Expected creation to fail')
      } catch (error) {
        expect(error).toBeDefined()
        const errorMessage = error instanceof Error ? error.message : String(error)
        expect(errorMessage).toMatch(
          /You are not allowed to perform this action|This collection is managed by Better Auth/,
        )
      }
    })

    it('should block direct update on BA collections', async () => {
      const testUser = generateTestUser()

      // Create user first
      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
      })

      const betterAuthUserId = signUpResult.user.id
      await waitForQueueToProcess(betterAuthUserId, 'create')

      const emailPasswordEntry = await findEmailPasswordEntry(betterAuthUserId)
      expect(emailPasswordEntry).toBeDefined()

      // Try to update directly
      try {
        await payload.update({
          id: emailPasswordEntry!.id,
          collection: emailPasswordSlug,
          data: { email: 'hacked@example.com' },
          overrideAccess: false,
        })
        expect.fail('Expected update to fail')
      } catch (error) {
        expect(error).toBeDefined()
        const errorMessage = error instanceof Error ? error.message : String(error)
        expect(errorMessage).toMatch(
          /You are not allowed to perform this action|This collection is managed by Better Auth/,
        )
      }

      // Clean up
      await cleanupTestUser(testUser.email)
    })

    it('should block direct deletion on BA collections by default', async () => {
      const testUser = generateTestUser()

      // Create user first
      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
      })

      const betterAuthUserId = signUpResult.user.id
      await waitForQueueToProcess(betterAuthUserId, 'create')

      const emailPasswordEntry = await findEmailPasswordEntry(betterAuthUserId)
      expect(emailPasswordEntry).toBeDefined()

      // Try to delete directly
      try {
        await payload.delete({
          id: emailPasswordEntry!.id,
          collection: emailPasswordSlug,
          overrideAccess: false,
        })
        expect.fail('Expected deletion to fail')
      } catch (error) {
        expect(error).toBeDefined()
      }

      // Verify entry still exists
      const stillExists = await findEmailPasswordEntry(betterAuthUserId)
      expect(stillExists).toBeDefined()

      // Clean up
      await cleanupTestUser(testUser.email)
    })

    it('should block direct read on BA collections by default', async () => {
      const testUser = generateTestUser()

      // Create user first
      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
      })

      const betterAuthUserId = signUpResult.user.id
      await waitForQueueToProcess(betterAuthUserId, 'create')

      // Try to read without override - should throw Forbidden
      try {
        await payload.find({
          collection: emailPasswordSlug,
          limit: 10,
          overrideAccess: false,
          where: { baUserId: { equals: betterAuthUserId } },
        })
        expect.fail('Expected read to throw Forbidden error')
      } catch (error) {
        // Should be a Forbidden error
        expect(error).toBeDefined()
        expect((error as Error).message).toContain('not allowed')
      }

      // But with overrideAccess it should work
      const resultWithOverride = await payload.find({
        collection: emailPasswordSlug,
        limit: 10,
        overrideAccess: true,
        where: { baUserId: { equals: betterAuthUserId } },
      })
      expect(resultWithOverride.docs.length).toBeGreaterThan(0)

      // Clean up
      await cleanupTestUser(testUser.email)
    })
  })

  describe('Users Collection Access Control', () => {
    it('should allow BA sync agent to create users', async () => {
      const testUser = generateTestUser()

      // This is done through Better Auth which has proper signatures
      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
      })

      expect(signUpResult.user).toBeDefined()
      const betterAuthUserId = signUpResult.user.id

      await waitForQueueToProcess(betterAuthUserId, 'create')

      const payloadUser = await findPayloadUserByBaUserId(betterAuthUserId)
      expect(payloadUser).toBeDefined()

      await cleanupTestUser(testUser.email)
    })

    it('should block direct user creation without signature', async () => {
      try {
        await payload.create({
          collection: 'users',
          data: {
            name: 'Unauthorized',
            baUserId: 'unauthorized-user-id',
            email: 'unauthorized@example.com',
          },
          overrideAccess: false,
        })
        expect.fail('Expected creation to fail')
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it('should preserve custom access rules on users collection', async () => {
      // The dev payload.config.ts has read access for authenticated users only
      // Since we're not authenticated, read without override should throw Forbidden
      // because the access rule is: read: ({ req }) => Boolean(req.user)

      // Without authentication, should throw Forbidden
      try {
        await payload.find({
          collection: 'users',
          limit: 1,
          overrideAccess: false,
        })
        expect.fail('Expected unauthenticated read to throw Forbidden')
      } catch (error) {
        // This verifies the access control is being checked
        expect(error).toBeDefined()
        expect((error as Error).message).toContain('not allowed')
      }

      // With overrideAccess it should work
      const result = await payload.find({
        collection: 'users',
        limit: 1,
        overrideAccess: true,
      })
      expect(result).toBeDefined()
    })
  })

  describe('BA Collection Fields', () => {
    it('should have all required fields on email_password collection', () => {
      const collection = payload.collections[emailPasswordSlug]
      expect(collection).toBeDefined()

      const fieldNames = collection.config.fields
        .filter((f) => 'name' in f)
        .map((f) => (f as { name: string }).name)

      expect(fieldNames).toContain('baAccountId')
      expect(fieldNames).toContain('baUserId')
      expect(fieldNames).toContain('email')
      expect(fieldNames).toContain('emailVerified')
      expect(fieldNames).toContain('user') // join field
    })

    it('should have all required fields on magic_link collection', () => {
      const collection = payload.collections[magicLinkSlug]
      expect(collection).toBeDefined()

      const fieldNames = collection.config.fields
        .filter((f) => 'name' in f)
        .map((f) => (f as { name: string }).name)

      expect(fieldNames).toContain('baAccountId')
      expect(fieldNames).toContain('baUserId')
      expect(fieldNames).toContain('email')
      expect(fieldNames).toContain('emailVerified')
      expect(fieldNames).toContain('user') // join field
    })

    it('should have BA collections grouped under Better Auth', () => {
      const emailPasswordCollection = payload.collections[emailPasswordSlug]
      const magicLinkCollection = payload.collections[magicLinkSlug]

      // When debug is true, the group is "Better Auth (DEBUG)"
      expect(emailPasswordCollection.config.admin?.group).toBe('Better Auth (DEBUG)')
      expect(magicLinkCollection.config.admin?.group).toBe('Better Auth (DEBUG)')
    })
  })
})

import { expect, test } from '@playwright/test'
import Database from 'better-sqlite3'

test.describe('Auth API', () => {
  const generateTestUser = () => ({
    name: 'Test User',
    email: `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`,
    password: 'TestPassword123!',
  })

  let db: Database.Database

  test.beforeAll(() => {
    const dbPath = process.env.BETTER_AUTH_DB_PATH || './better-auth.db'
    db = new Database(dbPath)
  })

  test.afterAll(() => {
    db.close()
  })

  function cleanupTestUser(userEmail: string) {
    try {
      const deleteUserStmt = db.prepare('DELETE FROM user WHERE email = ?')
      deleteUserStmt.run(userEmail)
    } catch {
      // Ignore cleanup errors
    }
  }

  test('should return available auth methods from /auth/methods endpoint', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/auth/auth/methods', {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    expect(response.ok()).toBe(true)
    const data = await response.json()

    expect(data).toBeDefined()
    expect(Array.isArray(data)).toBe(true)

    // Since emailAndPassword is enabled in the auth config, it should be included
    const authMethodNames = data.map((method: any) => method.method)
    expect(authMethodNames).toContain('emailAndPassword')
  })

  test('should handle locale in sign-up requests via middleware', async ({ request }) => {
    const testUser = generateTestUser()
    const testLocale = 'de-DE'

    try {
      const response = await request.post('http://localhost:3000/api/auth/sign-up/email', {
        data: {
          name: testUser.name,
          email: testUser.email,
          password: testUser.password,
        },
        headers: {
          'Content-Type': 'application/json',
          'User-Locale': testLocale,
        },
      })

      expect(response.ok()).toBe(true)
      const signUpResult = await response.json()

      expect(signUpResult).toBeDefined()
      expect(signUpResult.user).toBeDefined()
      expect(signUpResult.user.email).toBe(testUser.email)
      expect(signUpResult.user.name).toBe(testUser.name)
      expect(signUpResult.user.id).toBeDefined()

      const userId = signUpResult.user.id

      // Check if locale was stored in the database
      const getUserStmt = db.prepare('SELECT locale FROM user WHERE id = ?')
      const userRecord = getUserStmt.get(userId) as { locale: null | string } | undefined

      expect(userRecord).toBeDefined()
      expect(userRecord?.locale).toBe(testLocale)

      cleanupTestUser(testUser.email)
    } catch (error) {
      cleanupTestUser(testUser.email)
      throw error
    }
  })
})

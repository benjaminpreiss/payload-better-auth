import { expect, test } from '@playwright/test'

test.describe('Frontend', () => {
  test('admin auth page renders correctly', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/auth')

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle')

    // Take a screenshot snapshot
    await expect(page).toHaveScreenshot('admin-auth-page.png')
  })
})

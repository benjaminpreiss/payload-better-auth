import type { Payload } from 'payload'

/**
 * Triggers a full reconcile operation via the Better Auth reconcile API
 * This is typically called during Payload initialization to ensure data consistency
 */
export async function triggerFullReconcile(payload: Payload): Promise<void> {
  try {
    const reconcileToken = process.env.RECONCILE_TOKEN
    if (!reconcileToken) {
      payload.logger.warn('RECONCILE_TOKEN not set, skipping onInit reconcile trigger')
      return
    }

    // Determine the better-auth server URL
    const betterAuthUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000'
    const reconcileUrl = `${betterAuthUrl}/api/auth/reconcile/run`

    payload.logger.info('Triggering full reconcile from Payload onInit...')

    const response = await fetch(reconcileUrl, {
      headers: {
        'Content-Type': 'application/json',
        'x-reconcile-token': reconcileToken,
      },
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(`Reconcile request failed: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    payload.logger.info('Full reconcile triggered successfully from Payload onInit', { result })
  } catch (error) {
    payload.logger.error('Failed to trigger full reconcile from Payload onInit', { error })
    // Don't throw - we don't want to prevent Payload from starting if reconcile fails
  }
}

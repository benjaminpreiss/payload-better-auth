import type { Payload } from 'payload'

/**
 * Triggers a full reconcile operation via the Better Auth reconcile API
 * This is typically called during Payload initialization to ensure data consistency
 */
export async function triggerFullReconcile({
  additionalHeaders,
  betterAuthUrl,
  payload,
  reconcileToken,
}: {
  additionalHeaders?: HeadersInit
  betterAuthUrl: string
  payload: Payload
  reconcileToken?: string
}): Promise<void> {
  try {
    if (!reconcileToken) {
      payload.logger.warn('reconcile token not set, skipping onInit reconcile trigger')
      return
    }

    const reconcileUrl = `${betterAuthUrl}/api/auth/reconcile/run`

    payload.logger.info('Triggering full reconcile from Payload onInit...')

    const headers = new Headers(additionalHeaders)
    headers.append('Content-Type', 'application/json')
    headers.append('x-reconcile-token', reconcileToken)

    const response = await fetch(reconcileUrl, {
      body: JSON.stringify({}),
      headers,
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(`Reconcile request failed: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    payload.logger.info(
      `Full reconcile triggered successfully from Payload onInit: ${JSON.stringify(result)}`,
    )
  } catch (error) {
    payload.logger.error(`Failed to trigger full reconcile from Payload onInit: ${error}`)
    // Don't throw - we don't want to prevent Payload from starting if reconcile fails
  }
}

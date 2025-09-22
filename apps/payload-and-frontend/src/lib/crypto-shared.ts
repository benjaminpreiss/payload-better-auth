// crypto-shared.ts
import crypto from 'crypto'

/**
 * Type for serializable values that can be canonically stringified
 */
type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SerializableObject
  | SerializableArray

interface SerializableObject {
  [key: string]: SerializableValue
}

interface SerializableArray extends Array<SerializableValue> {}

/**
 * Signature object containing timestamp, nonce, and MAC
 */
export interface CryptoSignature {
  /** Unix timestamp as string */
  ts: string
  /** Unique nonce for this signature */
  nonce: string
  /** HMAC-SHA256 signature */
  mac: string
}

/**
 * Input parameters for signature verification
 */
export interface VerifySignatureInput {
  /** The data that was signed */
  body: unknown
  /** The signature to verify */
  signature: CryptoSignature
  /** Secret key for verification */
  secret: string
  /** Maximum allowed time skew in seconds (default: 300) */
  maxSkewSec?: number
}

/**
 * Input parameters for signature creation
 */
export interface SignCanonicalInput {
  /** The data to sign */
  body: unknown
  /** Secret key for signing */
  secret: string
}

/**
 * Converts an object to a canonical string representation
 * Handles circular references and ensures consistent ordering
 */
function canonicalStringify(obj: unknown): string {
  const seen = new WeakSet<object>()

  const walk = (v: unknown): string => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) {
        throw new Error('Circular reference detected in object')
      }
      seen.add(v)

      if (Array.isArray(v)) {
        const result = `[${v.map(walk).join(',')}]`
        seen.delete(v)
        return result
      }

      const keys = Object.keys(v).sort()
      const result = `{${keys.map((k) => `"${k}":${walk((v as Record<string, unknown>)[k])}`).join(',')}}`
      seen.delete(v)
      return result
    }
    return JSON.stringify(v)
  }

  return walk(obj)
}

/**
 * Creates a cryptographic signature for the given data
 * @param body - The data to sign
 * @param secret - Secret key for signing
 * @returns Signature object with timestamp, nonce, and MAC
 */
export function signCanonical(body: unknown, secret: string): CryptoSignature {
  if (!secret || typeof secret !== 'string') {
    throw new Error('Secret must be a non-empty string')
  }

  const ts = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomUUID()
  const payload = canonicalStringify(body)
  const mac = crypto.createHmac('sha256', secret).update(`${ts}.${nonce}.${payload}`).digest('hex')

  return { ts, nonce, mac }
}

/**
 * Verifies a cryptographic signature
 * @param body - The original data that was signed
 * @param sig - The signature to verify
 * @param secret - Secret key for verification
 * @param maxSkewSec - Maximum allowed time skew in seconds (default: 300)
 * @returns true if signature is valid, false otherwise
 */
export function verifyCanonical(
  body: unknown,
  sig: CryptoSignature,
  secret: string,
  maxSkewSec: number = 300,
) {
  if (!secret || typeof secret !== 'string') {
    return false
  }

  if (!sig || typeof sig !== 'object' || !sig.ts || !sig.nonce || !sig.mac) {
    return false
  }

  // Validate timestamp
  const now = Math.floor(Date.now() / 1000)
  const t = Number(sig.ts)
  if (!Number.isFinite(t) || Math.abs(now - t) > maxSkewSec) {
    return false
  }

  try {
    const payload = canonicalStringify(body)
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${sig.ts}.${sig.nonce}.${payload}`)
      .digest('hex')

    return crypto.timingSafeEqual(
      new Uint8Array(Buffer.from(sig.mac, 'hex')),
      new Uint8Array(Buffer.from(expected, 'hex')),
    )
  } catch {
    return false
  }
}

/**
 * Convenience function for verifying signatures with input object
 * @param input - Verification parameters
 * @returns true if signature is valid, false otherwise
 */
export function verifySignature(input: VerifySignatureInput) {
  return verifyCanonical(input.body, input.signature, input.secret, input.maxSkewSec)
}

/**
 * Convenience function for creating signatures with input object
 * @param input - Signing parameters
 * @returns Signature object
 */
export function createSignature(input: SignCanonicalInput) {
  return signCanonical(input.body, input.secret)
}

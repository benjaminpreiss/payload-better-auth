/**
 * Signature object containing timestamp, nonce, and MAC
 */
export interface CryptoSignature {
    /** HMAC-SHA256 signature */
    mac: string;
    /** Unique nonce for this signature */
    nonce: string;
    /** Unix timestamp as string */
    ts: string;
}
/**
 * Input parameters for signature verification
 */
export interface VerifySignatureInput {
    /** The data that was signed */
    body: unknown;
    /** Maximum allowed time skew in seconds (default: 300) */
    maxSkewSec?: number;
    /** Secret key for verification */
    secret: string;
    /** The signature to verify */
    signature: CryptoSignature;
}
/**
 * Input parameters for signature creation
 */
export interface SignCanonicalInput {
    /** The data to sign */
    body: unknown;
    /** Secret key for signing */
    secret: string;
}
/**
 * Creates a cryptographic signature for the given data
 * @param body - The data to sign
 * @param secret - Secret key for signing
 * @returns Signature object with timestamp, nonce, and MAC
 */
export declare function signCanonical(body: unknown, secret: string): CryptoSignature;
/**
 * Verifies a cryptographic signature
 * @param body - The original data that was signed
 * @param sig - The signature to verify
 * @param secret - Secret key for verification
 * @param maxSkewSec - Maximum allowed time skew in seconds (default: 300)
 * @returns true if signature is valid, false otherwise
 */
export declare function verifyCanonical(body: unknown, sig: CryptoSignature, secret: string, maxSkewSec?: number): boolean;
/**
 * Convenience function for verifying signatures with input object
 * @param input - Verification parameters
 * @returns true if signature is valid, false otherwise
 */
export declare function verifySignature(input: VerifySignatureInput): boolean;
/**
 * Convenience function for creating signatures with input object
 * @param input - Signing parameters
 * @returns Signature object
 */
export declare function createSignature(input: SignCanonicalInput): CryptoSignature;

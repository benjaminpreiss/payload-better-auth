// crypto-shared.ts
import crypto from 'crypto';
/**
 * Converts an object to a canonical string representation
 * Handles circular references and ensures consistent ordering
 */ function canonicalStringify(obj) {
    const seen = new WeakSet();
    const walk = (v)=>{
        if (v && typeof v === 'object') {
            if (seen.has(v)) {
                throw new Error('Circular reference detected in object');
            }
            seen.add(v);
            if (Array.isArray(v)) {
                const result = `[${v.map(walk).join(',')}]`;
                seen.delete(v);
                return result;
            }
            const keys = Object.keys(v).sort();
            const result = `{${keys.map((k)=>`"${k}":${walk(v[k])}`).join(',')}}`;
            seen.delete(v);
            return result;
        }
        return JSON.stringify(v);
    };
    return walk(obj);
}
/**
 * Creates a cryptographic signature for the given data
 * @param body - The data to sign
 * @param secret - Secret key for signing
 * @returns Signature object with timestamp, nonce, and MAC
 */ export function signCanonical(body, secret) {
    if (!secret || typeof secret !== 'string') {
        throw new Error('Secret must be a non-empty string');
    }
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const payload = canonicalStringify(body);
    const mac = crypto.createHmac('sha256', secret).update(`${ts}.${nonce}.${payload}`).digest('hex');
    return {
        mac,
        nonce,
        ts
    };
}
/**
 * Verifies a cryptographic signature
 * @param body - The original data that was signed
 * @param sig - The signature to verify
 * @param secret - Secret key for verification
 * @param maxSkewSec - Maximum allowed time skew in seconds (default: 300)
 * @returns true if signature is valid, false otherwise
 */ export function verifyCanonical(body, sig, secret, maxSkewSec = 300) {
    if (!secret || typeof secret !== 'string') {
        return false;
    }
    if (!sig || typeof sig !== 'object' || !sig.ts || !sig.nonce || !sig.mac) {
        return false;
    }
    // Validate timestamp
    const now = Math.floor(Date.now() / 1000);
    const t = Number(sig.ts);
    if (!Number.isFinite(t) || Math.abs(now - t) > maxSkewSec) {
        return false;
    }
    try {
        const payload = canonicalStringify(body);
        const expected = crypto.createHmac('sha256', secret).update(`${sig.ts}.${sig.nonce}.${payload}`).digest('hex');
        return crypto.timingSafeEqual(new Uint8Array(Buffer.from(sig.mac, 'hex')), new Uint8Array(Buffer.from(expected, 'hex')));
    } catch  {
        return false;
    }
}

//# sourceMappingURL=crypto-shared.js.map
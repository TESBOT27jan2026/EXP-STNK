import crypto from 'node:crypto';
import { SIGNAL_DEFAULTS } from './constants.js';
import type { LaravelEnvelope } from './types.js';

/**
 * Derive the AES-256 key used by Signal's encrypter.
 *
 * Kotlin path (from `AESEnDecryption.<init>`):
 *   key_bytes = key.utf8().toHex().toUpperCase().utf8()
 *
 * For the production native key `KAISERISAGI1011F` this yields the 32-byte
 * ASCII string `"4B41495345524953414749313031314 6"` (256 bits).
 */
export function deriveAesKey(nativeKey: string = SIGNAL_DEFAULTS.nativeKey): Buffer {
    const hexUpper = Buffer.from(nativeKey, 'utf8').toString('hex').toUpperCase();
    return Buffer.from(hexUpper, 'utf8');
}

/**
 * Laravel-style symmetric encrypter used by the Signal app.
 *
 *   payload = base64( JSON.stringify({
 *       iv:    base64(randomIV16),
 *       value: base64(AES-256-CBC.encrypt(plaintext, key, iv)),
 *       mac:   hex(HMAC-SHA256(key, iv_b64 + value_b64)),
 *       tag:   ""
 *   }) )
 */
export class Encrypter {
    readonly key: Buffer;

    constructor(nativeKey: string = SIGNAL_DEFAULTS.nativeKey) {
        this.key = deriveAesKey(nativeKey);
    }

    /** Encrypt a UTF-8 string and return the base64-wrapped Laravel envelope. */
    encrypt(plaintext: string): string {
        const ivRaw = crypto.randomBytes(16);
        const ivB64 = ivRaw.toString('base64');

        const cipher = crypto.createCipheriv('aes-256-cbc', this.key, ivRaw);
        const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const valueB64 = ct.toString('base64');

        const mac = crypto.createHmac('sha256', this.key)
            .update(ivB64 + valueB64, 'utf8')
            .digest('hex');

        const inner: LaravelEnvelope = { iv: ivB64, value: valueB64, mac, tag: '' };
        return Buffer.from(JSON.stringify(inner), 'utf8').toString('base64');
    }

    /** Decrypt a base64-wrapped Laravel envelope back to its UTF-8 plaintext. */
    decrypt(outerB64: string): string {
        const inner = JSON.parse(
            Buffer.from(outerB64, 'base64').toString('utf8'),
        ) as LaravelEnvelope;

        if (inner.mac) {
            const expected = crypto.createHmac('sha256', this.key)
                .update(inner.iv + inner.value, 'utf8')
                .digest('hex');
            if (!timingSafeEqualHex(expected, inner.mac)) {
                throw new Error('MAC mismatch — wrong key or tampered payload');
            }
        }

        const iv = Buffer.from(inner.iv, 'base64');
        const ct = Buffer.from(inner.value, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
        const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        return pt.toString('utf8');
    }
}

function timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

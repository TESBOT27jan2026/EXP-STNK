// Sanity test: round-trip encrypt/decrypt with a synthetic envelope.
// No real PII in this file — it generates its own ciphertext at runtime
// and verifies the SDK can decrypt it back.
//
//   npm run verify

import { Encrypter } from '../src/crypto.js';

const enc = new Encrypter();
console.log('aes-256 key (32 ASCII bytes):', enc.key.toString());

const sample = JSON.stringify({
    status: true,
    code: '00',
    message: 'success',
    data: { profile_name: 'Jane Doe', account_no: '08xxxxxxxxxx', profile_nik: '32xxxxxxxxxxxxxx' },
});

const ciphertext = enc.encrypt(sample);
console.log('ciphertext length:', ciphertext.length);

const plain = enc.decrypt(ciphertext);
console.log('decrypted:\n' + plain);

if (plain !== sample) throw new Error('round-trip mismatch');
console.log('round-trip: OK');

const parsed = JSON.parse(plain) as { status: boolean; data: { profile_name?: string } };
if (!parsed.status) throw new Error('decryption succeeded but response not status:true');
console.log('parsed profile_name =', parsed.data.profile_name);

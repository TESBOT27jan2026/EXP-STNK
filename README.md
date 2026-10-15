# signal-client

> Reverse-engineered TypeScript client for [SIGNAL](https://www.bombasignal.id) — Indonesia's national vehicle-tax app.

The phone is encrypted. The wire is not interesting. The plaintext is.
This is the plaintext, in TypeScript.

```
app.signal.id  v2.1.1  ->  src/
```

---

## What this is

A clean-room TS port of the request/response flow of `app.signal.id`.

- AES-256-CBC + HMAC-SHA256 (Laravel `Encrypter` on-the-wire shape)
- One typed `SignalClient` over both endpoints (`/middle/auth` + `/middle`)
- 96 `FN.*` actions enumerated verbatim from the APK
- Zero runtime deps, Node 18+
- Native key extracted via Frida — not guessed, not bruteforced, just yanked out of `libEncEngine.so`

This is a research artifact. Use it on your own account, your own data, your own car.

---

## Quick start

```bash
npm install
npm run verify          # round-trip sanity check (synthetic data)
```

```ts
import { SignalClient } from '@reverserid/signal-client';

const c = new SignalClient();

// no login needed
const pajak = await c.cekTax({
    area_code: 'B', tnkb_no: '1234', serial_back_code: 'ABC',
    vehicle_chassis_no: 'XXXXX',          // last 5 digits
    nik: '32xxxxxxxxxxxxxx',
});
console.log(pajak.data);
```

```ts
// with JWT (from examples/login.ts)
const c = new SignalClient({ token: process.env.SIGNAL_JWT });

const me       = await c.getProfile();
const vehicles = await c.getVehicles();
const tax      = await c.digitalTax(vehicles.data[0].vehicle_id);
const img      = await c.imageTax(tax.data[0].tax_history_id);

console.log(img.data.digital_tax_img);    // signed S3 URL, ~6h TTL
```

---

## Cek pajak — three tiers

Pick the lightest one that has what you need.

| Helper                      | `function`            | Login | Required fields                                                            | Returns                |
| --------------------------- | --------------------- | :---: | -------------------------------------------------------------------------- | ---------------------- |
| `c.cekRanmor(...)`          | `checkranmor`         |   no  | plate + chassis-last5                                                      | owner + vehicle info   |
| `c.cekTax(...)`             | `cektax`              |   no  | plate + chassis-last5 + **NIK**                                            | tax amount due         |
| `c.checkTax(vehicle_id)`    | `check-tax`           |  yes  | `vehicle_id` (from `getVehicles`)                                          | tax amount due         |
| `c.submissionCekTax(...)`   | `submission/cektax`   |   no  | plate + chassis-last5 + NIK + **email + phone** (creates pengajuan record) | tax + submission token |

```ts
// no login, plate only (ranmor / vehicle info)
await c.cekRanmor({ area_code, tnkb_no, serial_back_code, vehicle_chassis_no });

// no login, plate + NIK (tax amount due) — most people want this
await c.cekTax({ area_code, tnkb_no, serial_back_code, vehicle_chassis_no, nik });

// logged in, by saved vehicle
await c.checkTax(vehicle_id);
```

---

## Protocol, in 20 lines

Two endpoints. Everything else is a `function` field inside the envelope.

```
POST /v7/signal/middle/auth   ->  mints  { Authorization: "<b64>:<b64>" }
POST /v7/signal/middle        ->  Bearer <that>, returns encrypted body
```

Wire body (both endpoints):

```jsonc
{ "payload": "<base64(JSON({iv,value,mac,tag:""}))>" }
```

`iv`/`value`/`mac`/`tag` is Laravel `Crypt::encrypt` verbatim.

Plaintext inside `value`:

```jsonc
{
  "key":      "<API_KEY>",
  "function": "<one of FN.*>",
  "token":    "<JWT>",       // omit when absent (explicitNulls=false)
  "data":     { /* anything */ }
}
```

Response inside `outer.response`:

```jsonc
{ "status": true, "code": "00", "message": "success", "data": <whatever> }
```

`status:false` → `SignalApiError(code, message, data)`.

### Key derivation

```
nativeKey  =  "KAISERISAGI1011F"            // libEncEngine.so::getEncryptionKey()
aesKey     =  utf8( hex(utf8(nativeKey)).toUpperCase() )
           =  32 ASCII bytes  -> AES-256
mac        =  hex( HMAC_SHA256(aesKey, iv_b64 + value_b64) )
```

The IV is 16 random bytes per call. `tag` is always `""` (CBC, no AEAD).

---

## Examples

```bash
# cek pajak — anonymous, needs NIK (returns tax amount due)
npx tsx examples/cekpajak.ts "B XXXX XXX" XXXXX 32xxxxxxxxxxxxxx

# cek pajak — logged in, by saved vehicle_id
npx tsx examples/cekpajak.ts <vehicle_id>

# cek ranmor — plate-only vehicle lookup (no NIK, no login)
npx tsx examples/cekranmor.ts "B XXXX XXX" XXXXX

# submission/cektax — pengajuan flow (NIK + email + phone)
npx tsx examples/cektax.ts "B XXXX XXX" XXXXX 32xxxxxxxxxxxxxx you@mail.com 08xxxxxxxxxx

# login + persist JWT to .signal-token
npx tsx examples/login.ts 628xxxxxxxxxx <password>

# e-pengesahan (digital tax receipt) — uses .signal-token
npx tsx examples/epengesahan.ts                            # first vehicle, latest year
npx tsx examples/epengesahan.ts <vehicle_id> all           # every year
DOWNLOAD=1 npx tsx examples/epengesahan.ts <vid> all       # save jpegs to ./out/
```

`DEBUG=1` on any example prints the plaintext envelope going out and coming back.

---

## Layout

```
src/
  constants.ts   urls, api key, native crypto strings
  functions.ts   FN enum  +  ApiFunction type union
  types.ts       envelope types  +  SignalApiError
  crypto.ts      Encrypter  (AES-256-CBC + HMAC-SHA256, Laravel format)
  client.ts      SignalClient  — auth -> middle -> decrypt -> parse
  plate.ts       parsePlate("B XXXX XXX")  +  chassisLast5
  index.ts       public surface
examples/        cekpajak, cekranmor, cektax, login, epengesahan, init
scripts/verify.ts   round-trip sanity test (synthetic, no PII)
apk/             pulled base.apk + splits + extracted libEncEngine.so  (gitignored)
frida/           Frida 17 script to re-dump native secrets on key rotation
```

---

## Re-pulling keys when they rotate

If the native key changes (it has, between versions), don't guess — pull it:

```bash
frida -U -f app.signal.id -l frida/signal_dump.js
```

The script:

1. Prints `key` / `iv` / `secret` / `apiProd` / `apiDev` from `libEncEngine.so`
2. Hooks `encDecRequest` / `encDecResponse` — every encrypted call dumps its plaintext both directions, ciphertext stripped

Drop the new `key` into `SIGNAL_DEFAULTS.nativeKey` (`src/constants.ts`) or pass `nativeKey:` to `new SignalClient({...})`.

---

## Why

Because the API is on your phone, and the data it returns is yours,
and getting your e-TBPKP off your own vehicle should not require
re-installing the official app on a fresh ROM.

Also because reading other people's crypto is fun.

---

## Disclaimer

For research, education, and interop with **your own account**.
You are responsible for whatever ToS you agree to when you press *Install*.
Don't be a dick. Don't scrape, don't enumerate, don't sell.

---

## Contact

`cp@reverser.id` — patches welcome, opinions less so.

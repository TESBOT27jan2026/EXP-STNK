// Cek pajak (tax amount due).
//
// Two modes:
//
//   Anonymous (no login, needs NIK):
//     npx tsx examples/cekpajak.ts "B XXXX XXX" XXXXX 32xxxxxxxxxxxxxx
//
//   Logged-in (uses .signal-token; pass vehicle_id, no NIK):
//     npx tsx examples/cekpajak.ts <vehicle_id>
//
// Set DEBUG=1 to dump plaintext envelopes.

import fs from 'node:fs';
import path from 'node:path';
import { SignalApiError, SignalClient, parsePlate, chassisLast5 } from '../src/index.js';

const argv = process.argv.slice(2);
const debug = !!process.env['DEBUG'];

async function run() {
    if (argv.length === 1) {
        // logged-in mode
        const tokenPath = path.resolve('.signal-token');
        const jwt = process.env['SIGNAL_JWT'] ?? (fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '');
        if (!jwt) { console.error('logged-in mode needs JWT. Run examples/login.ts or set SIGNAL_JWT.'); process.exit(2); }
        const c = new SignalClient({ token: jwt, debug });

        const vehicleId = Number(argv[0]);
        if (!Number.isFinite(vehicleId)) { console.error('bad vehicle_id:', argv[0]); process.exit(2); }

        const r = await c.checkTax(vehicleId);
        print(r);
        return;
    }

    if (argv.length === 3) {
        // anonymous mode
        const [plate, chassis, nik] = argv;
        const parsed = parsePlate(plate!);
        if (!parsed) { console.error('unparseable plate:', plate); process.exit(2); }
        const c = new SignalClient({ debug });

        const r = await c.cekTax({
            ...parsed,
            vehicle_chassis_no: chassisLast5(chassis!),
            nik: nik!,
        });
        print(r);
        return;
    }

    console.error('usage:');
    console.error('  anonymous : tsx examples/cekpajak.ts "<plate>" <chassisLast5OrFull> <nik>');
    console.error('  logged-in : tsx examples/cekpajak.ts <vehicle_id>');
    process.exit(2);
}

function print(r: { code: string; message: string; data: unknown }): void {
    console.log('code   :', r.code);
    console.log('message:', r.message);
    console.log('data   :', JSON.stringify(r.data, null, 2));
}

run().catch((e: unknown) => {
    if (e instanceof SignalApiError) console.error(`API code=${e.code}  msg=${e.message}`);
    else console.error('FATAL:', e);
    process.exit(1);
});

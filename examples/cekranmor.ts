// Plate-only vehicle/tax lookup. No NIK, no email, no phone, no JWT.
//
//   npx tsx examples/cekranmor.ts "B XXXX XXX" XXXXX
//
// Args:
//   1. plate            (e.g. "B 1234 ABC")
//   2. chassisLast5     (last 5 chars of vehicle_chassis_no — full chassis also accepted; trimmed)

import { SignalApiError, SignalClient, parsePlate, chassisLast5 } from '../src/index.js';

const [plate, chassis] = process.argv.slice(2);
if (!plate || !chassis) {
    console.error('usage: tsx examples/cekranmor.ts "<plate>" <chassisLast5OrFull>');
    process.exit(2);
}

const parsed = parsePlate(plate);
if (!parsed) { console.error('unparseable plate:', plate); process.exit(2); }

const c = new SignalClient({ debug: !!process.env['DEBUG'] });

async function run() {
    const r = await c.cekRanmor({
        ...parsed!,
        vehicle_chassis_no: chassisLast5(chassis!),
    });
    console.log('code   :', r.code);
    console.log('message:', r.message);
    console.log('data   :', JSON.stringify(r.data, null, 2));
}

run().catch((e: unknown) => {
    if (e instanceof SignalApiError) console.error(`API code=${e.code}  msg=${e.message}`);
    else console.error('FATAL:', e);
    process.exit(1);
});

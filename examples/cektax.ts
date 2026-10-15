// Pre-login plate tax check via NIK. No login required.
// Run:
//   npx tsx examples/cektax.ts "F 3686 FIO" 80513 3201163108990001 taqin2731@gmail.com 085117822731

import { SignalApiError, SignalClient, parsePlate, chassisLast5 } from '../src/index.js';

const [plate, chassis, nik, email, phone] = process.argv.slice(2);
if (!plate || !chassis || !nik || !email || !phone) {
    console.error('usage: tsx examples/cektax.ts "<plate>" <chassisLast5OrFull> <nik> <email> <phone>');
    process.exit(2);
}

const parsed = parsePlate(plate);
if (!parsed) {
    console.error('unparseable plate:', plate);
    process.exit(2);
}

const c = new SignalClient({ debug: !!process.env['DEBUG'] });

async function run() {
    const result = await c.submissionCekTax({
        ...parsed!,
        vehicle_chassis_no: chassisLast5(chassis!),
        nik: nik!,
        account_email: email!,
        account_no: phone!,
    });
    console.log('code   :', result.code);
    console.log('message:', result.message);
    console.log('data   :', JSON.stringify(result.data, null, 2));
}

run().catch((e: unknown) => {
    if (e instanceof SignalApiError) {
        console.error(`API error  code=${e.code}  message=${e.message}`);
        if (e.data) console.error('data:', JSON.stringify(e.data, null, 2));
    } else {
        console.error('FATAL:', e);
    }
    process.exit(1);
});

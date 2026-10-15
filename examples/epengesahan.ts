// E-Pengesahan flow (digital-tax + image-tax).
//
// Requires a JWT in .signal-token (run examples/login.ts first) or
// pass via SIGNAL_JWT env var.
//
// Usage:
//   npx tsx examples/epengesahan.ts                   # use first vehicle
//   npx tsx examples/epengesahan.ts <vehicle_id>      # specific vehicle
//   npx tsx examples/epengesahan.ts <vehicle_id> <tax_history_id>
//   npx tsx examples/epengesahan.ts <vehicle_id> all  # fetch image for every tax_history_id
//   DOWNLOAD=1 npx tsx examples/epengesahan.ts ...    # also save images to ./out/

import fs from 'node:fs';
import path from 'node:path';
import { SignalApiError, SignalClient } from '../src/index.js';

interface Vehicle {
    vehicle_id: number;
    nrkb_no: string;
    owner_name: string;
    vehicle_brand_name: string;
    vehicle_model_name: string;
}
interface TaxHistory {
    tax_history_id: number;
    nrkb_no: string;
    tax_code: string;
    stnk_date: string;
    pkb_date_old: string;
    pkb_date_new: string;
    tax_history_year: string;
}
interface ImageTaxResp { digital_tax_img: string }

const TOKEN_FILE = path.resolve('.signal-token');
const jwt = process.env['SIGNAL_JWT'] ?? (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : '');
if (!jwt) {
    console.error('No JWT. Run examples/login.ts or set SIGNAL_JWT.');
    process.exit(2);
}

const c = new SignalClient({ token: jwt, debug: !!process.env['DEBUG'] });

const [arg1, arg2] = process.argv.slice(2);
const DOWNLOAD = process.env['DOWNLOAD'] === '1';

async function run() {
    let vehicleId: number;
    if (arg1) {
        vehicleId = Number(arg1);
        if (!Number.isFinite(vehicleId)) { console.error('bad vehicle_id:', arg1); process.exit(2); }
    } else {
        console.log('[1/3] getVehicles');
        const v = await c.getVehicles<Vehicle[]>();
        if (!v.data?.length) { console.error('no vehicles on this account'); process.exit(3); }
        vehicleId = v.data[0]!.vehicle_id;
        console.log('     using vehicle_id=' + vehicleId + '  plate=' + v.data[0]!.nrkb_no);
    }

    console.log('[2/3] digital-tax  vehicle_id=' + vehicleId);
    const tax = await c.digitalTax<TaxHistory[]>(vehicleId);
    console.log('     entries=' + tax.data.length);
    for (const t of tax.data) {
        console.log(`       - id=${t.tax_history_id}  year=${t.tax_history_year}  pkb_new=${t.pkb_date_new}  code=${t.tax_code}`);
    }

    let targets: TaxHistory[];
    if (arg2 === 'all')      targets = tax.data;
    else if (arg2)           targets = tax.data.filter(t => String(t.tax_history_id) === arg2);
    else                     targets = tax.data.length > 0 ? [tax.data[0]!] : [];

    if (!targets.length) { console.log('no matching tax_history_id'); return; }

    if (DOWNLOAD) fs.mkdirSync('out', { recursive: true });

    for (const t of targets) {
        console.log(`[3/3] image-tax  tax_history_id=${t.tax_history_id}`);
        const img = await c.imageTax<ImageTaxResp>(t.tax_history_id);
        console.log('     ' + img.data.digital_tax_img);

        if (DOWNLOAD) {
            const out = path.join('out', `epengesahan_${t.nrkb_no.replace(/\s+/g, '_')}_${t.tax_history_year}.jpeg`);
            const res = await fetch(img.data.digital_tax_img);
            if (!res.ok) { console.error('     download failed HTTP ' + res.status); continue; }
            fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
            console.log('     saved -> ' + out);
        }
    }
}

run().catch((e: unknown) => {
    if (e instanceof SignalApiError) console.error(`API code=${e.code}  msg=${e.message}`);
    else console.error('FATAL:', e);
    process.exit(1);
});

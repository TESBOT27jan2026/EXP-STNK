// Login test. Run with:
//   SIGNAL_PHONE=628xxxxxxxxxx SIGNAL_PASSWORD=secret npx tsx examples/login.ts
//
// Or pass args:
//   npx tsx examples/login.ts 628xxxxxxxxxx secret
//
// On success, writes JWT to .signal-token (gitignored) and follow-up calls
// (init, profile, vehicles, transactions) are exercised with that token.

import fs from 'node:fs';
import path from 'node:path';
import { SignalApiError, SignalClient } from '../src/index.js';

const TOKEN_FILE = path.resolve('.signal-token');

const phone    = process.argv[2] ?? process.env['SIGNAL_PHONE'];
const password = process.argv[3] ?? process.env['SIGNAL_PASSWORD'];

if (!phone || !password) {
    console.error('usage: tsx examples/login.ts <phone> <password>');
    console.error('   or: SIGNAL_PHONE=... SIGNAL_PASSWORD=... tsx examples/login.ts');
    process.exit(2);
}

const c = new SignalClient({ debug: !!process.env['DEBUG'] });

async function run() {
    console.log(`[1/5] init (anon)`);
    const init = await c.initWithoutLogin();
    console.log('     code=' + init.code + ' msg=' + init.message);

    console.log(`[2/5] login  phone=${maskPhone(phone)}  pwd=${'*'.repeat(password!.length)}`);
    interface LoginData {
        token?: string;
        access_token?: string;
        jwt?: string;
        profile?: Record<string, unknown>;
        user?: Record<string, unknown>;
    }
    const login = await c.login<LoginData>(phone!, password!);
    console.log('     code=' + login.code + ' msg=' + login.message);

    const token = extractToken(login.data);
    if (!token) {
        console.error('login OK but no JWT field found in response data:');
        console.error(JSON.stringify(login.data, null, 2));
        process.exit(3);
    }
    c.setToken(token);
    fs.writeFileSync(TOKEN_FILE, token, 'utf8');
    console.log('     token saved to ' + TOKEN_FILE + '  (' + token.length + ' chars)');

    console.log(`[3/5] init (authed)`);
    const init2 = await c.init();
    console.log('     code=' + init2.code + ' keys=' + Object.keys(init2.data ?? {}).join(','));

    console.log(`[4/5] profile`);
    interface ProfileData { profile_name?: string; profile_email?: string; account_no?: string; profile_nik?: string }
    const profile = await c.getProfile<ProfileData>();
    console.log('     name=' + profile.data?.profile_name);
    console.log('     email=' + profile.data?.profile_email);
    console.log('     acct=' + profile.data?.account_no);

    console.log(`[5/5] vehicles`);
    const vehicles = await c.getVehicles<unknown[] | { vehicles?: unknown[] }>();
    const list = Array.isArray(vehicles.data) ? vehicles.data : (vehicles.data?.vehicles ?? []);
    console.log('     count=' + (list?.length ?? 0));
}

function maskPhone(p: string): string {
    if (p.length < 6) return '***';
    return p.slice(0, 3) + '*'.repeat(p.length - 6) + p.slice(-3);
}

function extractToken(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    for (const k of ['token', 'access_token', 'jwt', 'authorization']) {
        const v = d[k];
        if (typeof v === 'string' && v.length > 40) return v;
    }
    // Look one level deep (profile.token etc.)
    for (const v of Object.values(d)) {
        if (v && typeof v === 'object') {
            const t = extractToken(v);
            if (t) return t;
        }
    }
    return null;
}

run().catch((e: unknown) => {
    if (e instanceof SignalApiError) {
        console.error(`API error  code=${e.code}  message=${e.message}`);
        console.error('data:', JSON.stringify(e.data, null, 2));
    } else {
        console.error('FATAL:', e);
    }
    process.exit(1);
});

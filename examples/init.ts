// Minimal usage. Run with:  npm run example
// Set SIGNAL_JWT env var to a captured token to hit logged-in endpoints.

import { SignalClient } from '../src/index.js';

const c = new SignalClient({
    token: process.env.SIGNAL_JWT ?? '',
    debug: true,
});

console.log('--- init ---');
console.log(await c.init());

if (process.env.SIGNAL_JWT) {
    console.log('--- profile ---');
    console.log(await c.getProfile());

    console.log('--- vehicles ---');
    console.log(await c.getVehicles());

    console.log('--- transactions ---');
    console.log(await c.getTransactions());
}

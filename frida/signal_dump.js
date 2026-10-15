// signal_dump.js — Frida 17 compatible
// Target: app.signal.id  (Signal / Bombasignal)
//
// Usage:
//   frida -U -f app.signal.id -l signal_dump.js
//   frida -U -n Signal       -l signal_dump.js
//
// Dumps native EncEngine secrets once, then hooks encDecRequest /
// encDecResponse / encDecResponseError / getContentStr and prints ONLY the
// plaintext side of every encrypted call.

'use strict';

let J;
try { J = Java; } catch (_) { J = require('frida-java-bridge'); }

function safe(fn) {
    try { return fn(); } catch (e) { return '<err:' + e.message + '>'; }
}

function installHooks() {
    J.perform(function () {
        const Eng = J.use('com.net2software.encengine.EncEngine');
        const e = Eng.$new();

        // ---------- 1. Dump native strings ----------
        const secrets = {
            apiProd: safe(() => e.getEncryptionApiProd()),
            apiDev:  safe(() => e.getEncryptionApiDev()),
            key:     safe(() => e.getEncryptionKey()),
            iv:      safe(() => e.getEncryptionIV()),
            secret:  safe(() => e.getEncryptionSecret()),
        };
        console.log('\n========== EncEngine native strings ==========');
        console.log(JSON.stringify(secrets, null, 2));
        console.log('==============================================\n');

        // ---------- 2. Plaintext-only taps ----------
        Eng.encDecRequest.implementation = function (params) {
            console.log('\n>>> REQ\n' + params);
            return this.encDecRequest(params);
        };

        Eng.encDecResponse.implementation = function (resp) {
            const out = this.encDecResponse(resp);
            console.log('\n<<< RES\n' + out);
            return out;
        };

        Eng.encDecResponseError.implementation = function (resp) {
            const out = this.encDecResponseError(resp);
            console.log('\n<<< RES-ERR\n' + out);
            return out;
        };

        Eng.getContentStr.implementation = function (data, bUrl) {
            const out = this.getContentStr(data, bUrl);
            console.log('\n=== AUTH-SIG  bUrl=' + bUrl + '\ndata: ' + data + '\nsig : ' + out);
            return out;
        };

        console.log('[+] hooks installed — plaintext only — exercise the app now\n');
    });
}

setTimeout(installHooks, 800);

import { SIGNAL_DEFAULTS } from './constants.js';
import { Encrypter } from './crypto.js';
import { FN, type ApiFunction } from './functions.js';
import {
    SignalApiError,
    type AuthResponseBody,
    type ClientOptions,
    type EncryptedRequestBody,
    type EncryptedResponseBody,
    type RequestEnvelope,
    type ResponseEnvelope,
} from './types.js';

export class SignalClient {
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly userAgent: string;
    readonly platform: string;
    readonly appVersion: string;
    readonly fcmToken: string | null;

    private latitude: string;
    private longitude: string;
    private permissionLatlong: string;
    /** null = no JWT yet (sent as JSON null to match Kotlin's nullable field). */
    private token: string | null;
    private readonly debug: boolean;
    private readonly fetchImpl: typeof fetch;
    private readonly encrypter: Encrypter;

    constructor(opts: ClientOptions = {}) {
        this.baseUrl = opts.baseUrl ?? SIGNAL_DEFAULTS.baseUrl;
        this.apiKey = opts.apiKey ?? SIGNAL_DEFAULTS.apiKey;
        this.userAgent = opts.userAgent ?? SIGNAL_DEFAULTS.userAgent;
        this.platform = opts.platform ?? SIGNAL_DEFAULTS.platform;
        this.appVersion = opts.appVersion ?? SIGNAL_DEFAULTS.appVersion;
        this.fcmToken = opts.fcmToken ?? null;
        this.latitude = opts.latitude ?? '0.0';
        this.longitude = opts.longitude ?? '0.0';
        this.permissionLatlong = opts.permissionLatlong ?? 'false';
        this.token = opts.token && opts.token.length > 0 ? opts.token : null;
        this.debug = opts.debug ?? false;
        this.fetchImpl = opts.fetch ?? globalThis.fetch;
        this.encrypter = new Encrypter(opts.nativeKey);
    }

    // ---------- session ----------

    getToken(): string | null { return this.token; }
    setToken(jwt: string | null): void { this.token = jwt && jwt.length > 0 ? jwt : null; }
    clearToken(): void { this.token = null; }

    setLocation(latitude: string, longitude: string, granted = true): void {
        this.latitude = latitude;
        this.longitude = longitude;
        this.permissionLatlong = granted ? 'true' : 'false';
    }

    // ---------- low level ----------

    /**
     * Build the plaintext envelope matching the Kotlin serializer config
     * `Json { explicitNulls = false }` from `JsonProvider` — null fields are
     * omitted from the JSON entirely, NOT serialized as `null`.
     */
    private buildEnvelope<TData extends object>(fn: ApiFunction, data: TData): RequestEnvelope<TData> {
        const env: RequestEnvelope<TData> = { key: this.apiKey, function: fn, token: this.token, data };
        if (env.token === null) delete (env as { token?: string | null }).token;
        return env;
    }

    /**
     * Serialize the envelope the same way the Kotlin client does:
     * fields with `null` values are dropped, not emitted as `null`.
     */
    private serializeEnvelope<TData extends object>(env: RequestEnvelope<TData>): string {
        return JSON.stringify(env, (_k, v) => (v === null ? undefined : v));
    }

    private headers(extra: Record<string, string> = {}): Record<string, string> {
        return {
            'User-Agent': this.userAgent,
            'X-Latitude': this.latitude,
            'X-Longitude': this.longitude,
            'X-Permission-Latlong': this.permissionLatlong,
            'Accept': 'application/json',
            'Accept-Charset': 'UTF-8',
            'Content-Type': 'application/json',
            ...extra,
        };
    }

    /**
     * Hit POST /middle/auth with the same encrypted envelope you intend to send
     * to /middle, and return the bearer string the server mints back.
     */
    async mintBearer<TData extends object>(envelope: RequestEnvelope<TData>): Promise<string> {
        const body: EncryptedRequestBody = {
            payload: this.encrypter.encrypt(this.serializeEnvelope(envelope)),
        };
        const res = await this.fetchImpl(this.baseUrl + SIGNAL_DEFAULTS.authPath, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`auth HTTP ${res.status}: ${await res.text()}`);
        const json = (await res.json()) as AuthResponseBody;
        if (!json.Authorization) throw new Error('auth response missing Authorization: ' + JSON.stringify(json));
        return json.Authorization;
    }

    /**
     * Single round-trip: mint bearer, send encrypted /middle call, decrypt & parse response.
     * Throws {@link SignalApiError} on `status:false` responses.
     */
    async call<TResp = unknown, TData extends object = object>(
        fn: ApiFunction,
        data: TData = {} as TData,
    ): Promise<ResponseEnvelope<TResp>> {
        const envelope = this.buildEnvelope(fn, data);
        if (this.debug) console.error('[REQ]', this.serializeEnvelope(envelope));

        const bearer = await this.mintBearer(envelope);
        const body: EncryptedRequestBody = {
            payload: this.encrypter.encrypt(this.serializeEnvelope(envelope)),
        };

        const res = await this.fetchImpl(this.baseUrl + SIGNAL_DEFAULTS.middlePath, {
            method: 'POST',
            headers: this.headers({ Authorization: 'Bearer ' + bearer }),
            body: JSON.stringify(body),
        });
        const text = await res.text();

        let outer: EncryptedResponseBody;
        try {
            outer = JSON.parse(text) as EncryptedResponseBody;
        } catch {
            throw new Error(`bad /middle response (HTTP ${res.status}): ${text.slice(0, 300)}`);
        }
        if (!outer.response) throw new Error('no .response field: ' + text.slice(0, 300));

        const plain = this.encrypter.decrypt(outer.response);
        if (this.debug) console.error('[RES]', plain);

        const parsed = JSON.parse(plain) as ResponseEnvelope<TResp>;
        if (parsed.status === false) {
            throw new SignalApiError(parsed.message ?? 'API error', parsed.code, parsed.data);
        }
        return parsed;
    }

    // ---------- typed shortcuts ----------

    init<T = unknown>(extra: Record<string, unknown> = {}) {
        return this.call<T>(FN.INITIALIZATION, {
            platform: this.platform,
            version: this.appVersion,
            fcm_token: this.fcmToken,
            ...extra,
        });
    }

    initWithoutLogin<T = unknown>(extra: Record<string, unknown> = {}) {
        return this.call<T>(FN.INIT_WITHOUT_LOGIN, { platform: this.platform, ...extra });
    }

    /**
     * Field names from `app.signal.id.domain.model.postData.auth.PostAuth`:
     *   account_no  = @SerialName phoneNumber
     *   account_pwd = @SerialName password
     */
    login<T = unknown>(account_no: string, account_pwd: string) {
        return this.call<T>(FN.LOGIN, { account_no, account_pwd, platform: this.platform });
    }

    register<T = unknown>(payload: Record<string, unknown>) {
        return this.call<T>(FN.REGISTER, payload);
    }

    requestOtp<T = unknown>(account_no: string) {
        return this.call<T>(FN.GET_OTP, { account_no });
    }

    validateOtp<T = unknown>(account_no: string, otp: string) {
        return this.call<T>(FN.VALIDATE_OTP, { account_no, otp });
    }

    getProfile<T = unknown>() {
        return this.call<T>(FN.PROFILE, { platform: this.platform, fcm_token: this.fcmToken });
    }

    getVehicles<T = unknown>() {
        return this.call<T>(FN.GET_VEHICLE, { platform: this.platform });
    }

    detailVehicle<T = unknown>(vehicle_id: string | number) {
        return this.call<T>(FN.DETAIL_VEHICLE, { vehicle_id });
    }

    /**
     * Logged-in cek pajak. Uses a vehicle already attached to the account.
     * Source: `PajakViewModel` -> `CheckVehicle(vehicle_id)` DTO.
     *
     * @param vehicle_id   from {@link getVehicles} response (`vehicle_id` field)
     */
    checkTax<T = unknown>(vehicle_id: number | string) {
        return this.call<T>(FN.CHECK_TAX, { vehicle_id });
    }

    /**
     * Anonymous cek pajak (no login, no email/phone). Returns tax amount due.
     * Source: `PajakViewModel` -> mapOf with exactly these 5 keys.
     */
    cekTax<T = unknown>(args: {
        area_code: string;
        tnkb_no: string;
        serial_back_code: string;
        vehicle_chassis_no: string;
        nik: string;
    }) {
        return this.call<T>(FN.CHECK_TAX_NON_LOGIN, args);
    }

    /** Back-compat alias matching the old name. */
    checkTaxNonLogin = this.cekTax;

    /**
     * Lightest-touch plate check. No NIK, no email, no phone, no login.
     * Returns owner/tax info for a vehicle given only its plate + last-5
     * chassis digits.
     *
     * Source: `CekRanmorViewModel.checkRanmor()` — payload is exactly:
     *   { area_code, tnkb_no, serial_back_code, vehicle_chassis_no }
     */
    cekRanmor<T = unknown>(args: {
        area_code: string;
        tnkb_no: string;
        serial_back_code: string;
        vehicle_chassis_no: string;
    }) {
        return this.call<T>(FN.CHECK_RANMOR, args);
    }

    /**
     * Pre-login plate check via NIK + last-5 chassis digits.
     * Verified plaintext shape (from captured `submission/cektax` traffic):
     *   { area_code, tnkb_no, serial_back_code, vehicle_chassis_no, nik,
     *     account_email, account_no }
     *
     * `vehicle_chassis_no` is only the last 5 digits of the chassis number.
     * Plate "F 3686 FIO" => area_code="F", tnkb_no="3686", serial_back_code="FIO".
     * Use {@link parsePlate} to split a printed plate string.
     */
    submissionCekTax<T = unknown>(args: {
        area_code: string;
        tnkb_no: string;
        serial_back_code: string;
        vehicle_chassis_no: string;
        nik: string;
        account_email: string;
        account_no: string;
    }) {
        return this.call<T>(FN.SUBMISSION_CEKTAX, args);
    }

    /** e-TBPKP history list for a vehicle. */
    digitalTbpkp<T = unknown>(vehicle_id: number | string) {
        return this.call<T>(FN.GET_ETBPKP, { vehicle_id });
    }

    /**
     * Signed S3 image URL for a tax-history entry.
     * NOTE: `tax_history_id` is a string on the wire, not a number.
     */
    imageTbpkp<T = unknown>(tax_history_id: number | string) {
        return this.call<T>(FN.GET_IMAGE_TBPKP, { tax_history_id: String(tax_history_id) });
    }

    /** Digital tax (pengesahan) history for a vehicle. */
    digitalTax<T = unknown>(vehicle_id: number | string) {
        return this.call<T>(FN.GET_EPENGESAHAN, { vehicle_id });
    }
    imageTax<T = unknown>(tax_history_id: number | string) {
        return this.call<T>(FN.GET_EPENGESAHAN_IMAGE, { tax_history_id: String(tax_history_id) });
    }

    /** Digital KD (kartu dafttar). */
    digitalKd<T = unknown>(vehicle_id: number | string) {
        return this.call<T>(FN.GET_EKD, { vehicle_id });
    }
    imageKd<T = unknown>(tax_history_id: number | string) {
        return this.call<T>(FN.GET_EKD_IMAGE, { tax_history_id: String(tax_history_id) });
    }

    getTransactions<T = unknown>() {
        return this.call<T>(FN.GET_TRANSACTIONS, { platform: this.platform });
    }

    getTransactionDetail<T = unknown>(transaction_id: string | number) {
        return this.call<T>(FN.GET_TRANSACTION_DETAIL, { transaction_id });
    }

    getProvince<T = unknown>()                       { return this.call<T>(FN.PROVINCE, {}); }
    getCity<T = unknown>(province_id: string | number)        { return this.call<T>(FN.CITY,        { province_id }); }
    getSubdistrict<T = unknown>(city_id: string | number)     { return this.call<T>(FN.SUBDISTRICT, { city_id }); }
    getVillage<T = unknown>(subdistrict_id: string | number)  { return this.call<T>(FN.VILLAGE,     { subdistrict_id }); }
    getPostalCode<T = unknown>(village_id: string | number)   { return this.call<T>(FN.POSTALCODE,  { village_id }); }

    getBank<T = unknown>()       { return this.call<T>(FN.GET_BANK, { platform: this.platform }); }
    getSamsat<T = unknown>()     { return this.call<T>(FN.GET_SAMSAT, {}); }
    getInfoSamsat<T = unknown>() { return this.call<T>(FN.GET_INFO_SAMSAT, {}); }
    getCaptcha<T = unknown>()    { return this.call<T>(FN.GET_CAPTCHA, {}); }
    getFaq<T = unknown>()        { return this.call<T>(FN.FAQ, {}); }
    getRules<T = unknown>()      { return this.call<T>(FN.RULE, {}); }
    getPolicy<T = unknown>()     { return this.call<T>(FN.POLICY, {}); }
    getAllNews<T = unknown>()    { return this.call<T>(FN.ALL_NEWS, {}); }
}

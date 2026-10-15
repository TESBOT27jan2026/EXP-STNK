import type { ApiFunction } from './functions.js';

/** Plaintext envelope sent inside every encrypted Signal API call.
 *
 *  Source: `app.signal.id.domain.model.postData.PostData`.
 *  `token` is nullable in the Kotlin model — send JSON `null` when the user
 *  has not authenticated yet, NOT an empty string (server returns
 *  `{"status":false,"code":"05","message":"invalid token"}` for empty string). */
export interface RequestEnvelope<TData extends object = object> {
    key: string;
    function: ApiFunction;
    token: string | null;
    data: TData;
}

/** Plaintext envelope returned from every Signal API call. */
export interface ResponseEnvelope<TData = unknown> {
    status: boolean;
    code: string;
    message: string;
    data: TData;
}

/** Inner JSON inside the base64 payload — matches Laravel's Encrypter on-wire format. */
export interface LaravelEnvelope {
    iv: string;
    value: string;
    mac: string;
    tag: string;
}

/** Outer wire body for /middle and /middle/auth. */
export interface EncryptedRequestBody { payload: string; }

/** Outer wire response from /middle. */
export interface EncryptedResponseBody { response: string; }

/** Outer wire response from /middle/auth. */
export interface AuthResponseBody { Authorization: string; }

export interface ClientOptions {
    baseUrl?: string;
    apiKey?: string;
    userAgent?: string;
    nativeKey?: string;
    /** JWT from a prior login; omit or null for first-time / anonymous flows. */
    token?: string | null;
    latitude?: string;
    longitude?: string;
    permissionLatlong?: string;
    platform?: string;
    appVersion?: string;
    fcmToken?: string | null;
    debug?: boolean;
    fetch?: typeof fetch;
}

export class SignalApiError extends Error {
    constructor(
        message: string,
        readonly code: string,
        readonly data: unknown,
    ) {
        super(message);
        this.name = 'SignalApiError';
    }
}

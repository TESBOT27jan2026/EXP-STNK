// Constants pulled verbatim from app.signal.id v2.1.1 (Bombasignal).
// Source classes:
//   - app.signal.id.helper.constant.RestConstant
//   - app.signal.id.helper.constant.SecretKeyConstant
//   - libEncEngine.so JNI strings (getEncryptionKey/IV/Secret)

export const SIGNAL_DEFAULTS = {
    baseUrl: 'https://api.bombasignal.id/v7/signal/',
    baseUrlIos: 'https://api.bombasignal.id/v7/signal/ios/',
    middlePath: 'middle',
    authPath: 'middle/auth',

    apiKey: 'L8Kc8UaOy2DBd4eiRG5CM81tUHkSs3RY107OphtC',
    userAgent: 'Signal/2.1.1',
    appVersion: '2.1.1 (10070530)',
    platform: 'android',

    // libEncEngine.so native strings
    nativeKey: 'KAISERISAGI1011F',
    nativeIv: 'UW00ZHNPVUtFZnAxcG5HdA==',
    nativeSecret: '123',

    // Cert pins (informational; Node doesn't pin by default)
    pinSha256: 'sha256/x4QzPSC810K5/cMjb05Qm4k3Bw5zBn4lTdO/nEW/Td4=',
    pinSha256Dev: 'sha256/WRunPS8619lhJwQOELy9SvPU/fItn+F0GjlITP78Nfg=',
} as const;

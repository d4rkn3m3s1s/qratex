/**
 * NATIVE PUSH gönderim katmanı — FCM HTTP v1 (Android) + APNs token tabanlı (.p8, iOS).
 *
 * Şema notu: `PushSubscription` modelinde platform/token alanı yok (bkz.
 * docs/audit/2026-10-08/SCHEMA-REQUESTS-ek.md). Geçici çözüm: native cihaz jetonu aynı modelde
 * `endpoint = "native:<fcm|apns>:<token>"` olarak saklanır (endpoint @unique → cihaz başına tek
 * kayıt), `p256dh`/`auth` alanlarına sabit "native" yazılır. Web-push katmanı bu önekli kayıtları
 * hiç görmez (lib/push.ts ayırır); dolayısıyla SSRF filtresi bunları pasifleştirmez.
 *
 * FAIL-SAFE: env yoksa ilgili sağlayıcı SESSİZCE atlanır (false döner, hata fırlatmaz).
 *   FCM : FCM_SERVICE_ACCOUNT_JSON (servis hesabı JSON'u; ham ya da base64)
 *   APNs: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 (PEM; "\n" kaçışları kabul), APNS_BUNDLE_ID,
 *         APNS_PRODUCTION ("true" → api.push.apple.com, aksi halde sandbox)
 */
import { createSign } from 'node:crypto';

export type NativePlatform = 'fcm' | 'apns';

export const NATIVE_ENDPOINT_PREFIX = 'native:';
export const NATIVE_KEY_PLACEHOLDER = 'native';
/** FCM jetonu ~150-250, APNs jetonu 64 hex karakter; üst sınır geniş tutulur. */
export const MAX_NATIVE_TOKEN_LENGTH = 1024;
const TOKEN_RE = /^[A-Za-z0-9:_\-.]+$/;

export interface NativePushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  kind?: string | null;
}

export type NativeSendResult = { ok: true } | { ok: false; stale: boolean; error: string };

export function isValidNativeToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 16 && token.length <= MAX_NATIVE_TOKEN_LENGTH && TOKEN_RE.test(token);
}

export function encodeNativeEndpoint(platform: NativePlatform, token: string): string {
  return `${NATIVE_ENDPOINT_PREFIX}${platform}:${token}`;
}

export function isNativeEndpoint(endpoint: string): boolean {
  return endpoint.startsWith(NATIVE_ENDPOINT_PREFIX);
}

export function decodeNativeEndpoint(endpoint: string): { platform: NativePlatform; token: string } | null {
  if (!isNativeEndpoint(endpoint)) return null;
  const rest = endpoint.slice(NATIVE_ENDPOINT_PREFIX.length);
  const i = rest.indexOf(':');
  if (i < 0) return null;
  const platform = rest.slice(0, i);
  const token = rest.slice(i + 1);
  if ((platform !== 'fcm' && platform !== 'apns') || !isValidNativeToken(token)) return null;
  return { platform, token };
}

// ── yardımcılar ──────────────────────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function normalizePem(pem: string): string {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

// ── FCM HTTP v1 ──────────────────────────────────────────────────────────────

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function readFcmServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(text) as Partial<ServiceAccount>;
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    return { project_id: sa.project_id, client_email: sa.client_email, private_key: normalizePem(sa.private_key), token_uri: sa.token_uri };
  } catch {
    return null;
  }
}

let fcmTokenCache: { token: string; exp: number; email: string } | null = null;

/** Testler için önbelleği sıfırlar. */
export function __resetNativePushCaches(): void {
  fcmTokenCache = null;
  apnsJwtCache = null;
}

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmTokenCache && fcmTokenCache.email === sa.client_email && fcmTokenCache.exp - 60 > now) return fcmTokenCache.token;
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`FCM oauth ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('FCM oauth: access_token yok');
  fcmTokenCache = { token: json.access_token, exp: now + (json.expires_in ?? 3600), email: sa.client_email };
  return json.access_token;
}

export async function sendFcm(token: string, payload: NativePushPayload): Promise<NativeSendResult | null> {
  const sa = readFcmServiceAccount();
  if (!sa) return null; // yapılandırılmamış → atla
  try {
    const accessToken = await getFcmAccessToken(sa);
    const data: Record<string, string> = {};
    if (payload.url) data.url = payload.url;
    if (payload.kind) data.kind = payload.kind;
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data,
          android: { priority: 'HIGH', notification: { click_action: 'FCM_PLUGIN_ACTIVITY' } },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    let code = '';
    try {
      const j = (await res.json()) as { error?: { status?: string; details?: Array<{ errorCode?: string }> } };
      code = j.error?.details?.find((d) => d.errorCode)?.errorCode || j.error?.status || '';
    } catch {
      /* gövde yok */
    }
    // UNREGISTERED (404) ya da geçersiz jeton → kayıt kalıcı olarak ölü.
    const stale = res.status === 404 || code === 'UNREGISTERED' || (res.status === 400 && code === 'INVALID_ARGUMENT');
    return { ok: false, stale, error: `FCM ${res.status} ${code}`.trim() };
  } catch (e) {
    return { ok: false, stale: false, error: e instanceof Error ? e.message : 'FCM hata' };
  }
}

// ── APNs (token tabanlı, HTTP/2) ─────────────────────────────────────────────

interface ApnsConfig {
  keyId: string;
  teamId: string;
  key: string;
  bundleId: string;
  host: string;
}

export function readApnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const key = process.env.APNS_KEY_P8?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim();
  if (!keyId || !teamId || !key || !bundleId) return null;
  const host = process.env.APNS_PRODUCTION === 'true' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  return { keyId, teamId, key: normalizePem(key), bundleId, host };
}

let apnsJwtCache: { jwt: string; iat: number; keyId: string } | null = null;

function getApnsJwt(cfg: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  // Apple: jeton 20-60 dk arasında yenilenmeli; 40 dk kullan.
  if (apnsJwtCache && apnsJwtCache.keyId === cfg.keyId && now - apnsJwtCache.iat < 40 * 60) return apnsJwtCache.jwt;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: now }));
  const signer = createSign('SHA256');
  signer.update(`${header}.${claims}`);
  const sig = signer.sign({ key: cfg.key, dsaEncoding: 'ieee-p1363' });
  const jwt = `${header}.${claims}.${b64url(sig)}`;
  apnsJwtCache = { jwt, iat: now, keyId: cfg.keyId };
  return jwt;
}

export interface ApnsRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}
export type ApnsTransport = (req: ApnsRequest) => Promise<{ status: number; body: string }>;

/** APNs yalnız HTTP/2 konuşur (fetch/undici HTTP/1.1) → node:http2 ile tek istek. */
const http2Transport: ApnsTransport = async (req) => {
  const http2 = await import('node:http2');
  const u = new URL(req.url);
  return new Promise((resolve, reject) => {
    const client = http2.connect(u.origin);
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('APNs zaman aşımı'));
    }, 8000);
    client.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    const stream = client.request({ ':method': 'POST', ':path': u.pathname, ...req.headers });
    let status = 0;
    let body = '';
    stream.setEncoding('utf8');
    stream.on('response', (h) => {
      status = Number(h[':status']) || 0;
    });
    stream.on('data', (c: string) => {
      body += c;
    });
    stream.on('end', () => {
      clearTimeout(timer);
      client.close();
      resolve({ status, body });
    });
    stream.on('error', (e) => {
      clearTimeout(timer);
      client.close();
      reject(e);
    });
    stream.end(req.body);
  });
};

let apnsTransport: ApnsTransport = http2Transport;
/** Testler için taşıma katmanını değiştirir (null → varsayılan http2). */
export function __setApnsTransport(t: ApnsTransport | null): void {
  apnsTransport = t ?? http2Transport;
}

export async function sendApns(token: string, payload: NativePushPayload): Promise<NativeSendResult | null> {
  const cfg = readApnsConfig();
  if (!cfg) return null; // yapılandırılmamış → atla
  try {
    const jwt = getApnsJwt(cfg);
    const res = await apnsTransport({
      url: `${cfg.host}/3/device/${token}`,
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': cfg.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
        ...(payload.url ? { url: payload.url } : {}),
        ...(payload.kind ? { kind: payload.kind } : {}),
      }),
    });
    if (res.status === 200) return { ok: true };
    let reason = '';
    try {
      reason = (JSON.parse(res.body) as { reason?: string }).reason ?? '';
    } catch {
      /* gövde yok */
    }
    const stale = res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
    return { ok: false, stale, error: `APNs ${res.status} ${reason}`.trim() };
  } catch (e) {
    return { ok: false, stale: false, error: e instanceof Error ? e.message : 'APNs hata' };
  }
}

/** Tek native jetona gönderim; sağlayıcı yapılandırılmamışsa null (atlandı). */
export function sendNative(platform: NativePlatform, token: string, payload: NativePushPayload): Promise<NativeSendResult | null> {
  return platform === 'fcm' ? sendFcm(token, payload) : sendApns(token, payload);
}

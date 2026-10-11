'use client';

/**
 * NATIVE PUSH istemcisi (Capacitor). Web'de hiçbir şey yapmaz; `isNativePushPlatform()` false döner
 * ve çağıran mevcut web-push (VAPID) akışını kullanır. Paketler dinamik import edilir → web
 * paketine/SSR'a yük bindirmez.
 *
 * Sunucu ucu: POST/DELETE `/api/push/native` (tüm roller).
 */

const TOKEN_KEY = 'qx-native-push-token';

export type NativePushState = 'unsupported' | 'denied' | 'ready';

async function core() {
  return (await import('@capacitor/core')).Capacitor;
}
async function plugin() {
  return (await import('@capacitor/push-notifications')).PushNotifications;
}

export function isNativePushPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function storeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* depolama yok */
  }
}

async function platformName(): Promise<'android' | 'ios' | null> {
  const p = (await core()).getPlatform();
  return p === 'android' || p === 'ios' ? p : null;
}

/** İzin durumu + bu cihazda kayıtlı jeton (yerel önbellekten). */
export async function getNativePushStatus(): Promise<{ state: NativePushState; token: string | null }> {
  if (!isNativePushPlatform() || !(await platformName())) return { state: 'unsupported', token: null };
  const perm = await (await plugin()).checkPermissions();
  if (perm.receive === 'denied') return { state: 'denied', token: null };
  return { state: 'ready', token: perm.receive === 'granted' ? readStoredToken() : null };
}

let tapHandlerInstalled = false;
/** Bildirime dokununca `data.url` (yalnız uygulama içi yol) açılır. */
async function installTapHandler() {
  if (tapHandlerInstalled) return;
  tapHandlerInstalled = true;
  await (await plugin()).addListener('pushNotificationActionPerformed', (action) => {
    const url = (action.notification?.data as { url?: unknown } | undefined)?.url;
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) window.location.assign(url);
  });
}

export class NativePushError extends Error {
  constructor(public code: 'PUSH_DENIED' | 'PUSH_ERROR', public status = 0) {
    super(code);
  }
}

/** İzin ister, FCM/APNs jetonunu alır ve sunucuya kaydeder. Jetonu döner. */
export async function registerNativePush(): Promise<string> {
  const platform = await platformName();
  if (!platform) throw new NativePushError('PUSH_ERROR');
  const PN = await plugin();
  let perm = await PN.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PN.requestPermissions();
  if (perm.receive !== 'granted') throw new NativePushError('PUSH_DENIED', 403);

  const token = await new Promise<string>((resolve, reject) => {
    const handles: Array<Promise<{ remove: () => Promise<void> }>> = [];
    const done = () => handles.forEach((h) => void h.then((x) => x.remove()).catch(() => undefined));
    const timer = window.setTimeout(() => {
      done();
      reject(new NativePushError('PUSH_ERROR'));
    }, 15000);
    handles.push(
      PN.addListener('registration', (t) => {
        window.clearTimeout(timer);
        done();
        resolve(t.value);
      }),
      PN.addListener('registrationError', () => {
        window.clearTimeout(timer);
        done();
        reject(new NativePushError('PUSH_ERROR'));
      }),
    );
    void PN.register().catch(() => {
      window.clearTimeout(timer);
      done();
      reject(new NativePushError('PUSH_ERROR'));
    });
  });

  const res = await fetch('/api/push/native', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, token }),
  });
  if (!res.ok) throw new NativePushError('PUSH_ERROR', res.status);
  storeToken(token);
  void installTapHandler().catch(() => undefined);
  return token;
}

/** Sunucu kaydını bırakır ve cihazı FCM/APNs'ten çıkarır. */
export async function unregisterNativePush(): Promise<void> {
  const platform = await platformName();
  const token = readStoredToken();
  const res = await fetch('/api/push/native', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(platform && token ? { platform, token } : {}),
  });
  if (!res.ok) throw new NativePushError('PUSH_ERROR', res.status);
  storeToken(null);
  await (await plugin()).unregister().catch(() => undefined);
}

/**
 * Çıkış / hesap değişimi ÖNCESİ (oturum hâlâ geçerliyken) çağrılır: bu cihazın jetonunu sunucuda
 * mevcut kullanıcıdan koparır ve yerel önbelleği siler → sonraki kişinin telefonuna eski hesabın
 * bildirimleri gitmez. Web'de/jeton yoksa no-op; hata çıkışı ENGELLEMEZ.
 */
export async function releaseNativePush(): Promise<void> {
  if (!isNativePushPlatform()) return;
  const token = readStoredToken();
  storeToken(null);
  if (!token) return;
  try {
    const platform = await platformName();
    await fetch('/api/push/native', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(platform ? { platform, token } : {}),
    });
  } catch {
    /* ağ yok → sunucu tarafı oturum iptali / yeni girişin devri yine korur */
  }
}

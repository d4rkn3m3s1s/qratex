/**
 * Cihazda tutulan kullanıcıya bağlı veri — anahtarlar ve temizlik (saf; jest ile test edilir).
 *
 * Rapor offline bulgu 2: SW (artık panellerde kayıtlı) `others` önbelleğine oturumlu sayfaların
 * HTML'ini 24 saat yazıyor; Kartım da çevrimdışı kart anlık görüntüsünü `localStorage`'a yazıyor.
 * Paylaşılan cihazda çıkış yapan A'nın verisi, sonra gelen B'ye çevrimdışıyken görünebilirdi.
 *
 * Kural (SessionDeviceGuard uygular):
 *  - Oturum açan kullanıcı öncekinden FARKLIYSA → kişisel çalışma anı önbellekleri silinir,
 *    diğer kullanıcıların kart anlık görüntüleri silinir.
 *  - Sunucu "oturum yok" dediğinde (çevrimiçiyken, kesin yanıtla) → hepsi silinir.
 *  - Çevrimdışı sayfa yalnız `SESSION_UID_KEY`'in gösterdiği kullanıcının görüntüsünü okur.
 */
import { SNAPSHOT_VERSION } from '@/lib/wallet-card/snapshot';

/** Son doğrulanmış oturum sahibinin kullanıcı id'si (çevrimdışı sayfa bunu okur). */
export const SESSION_UID_KEY = 'qx:session-uid';
/** Kartım anlık görüntüleri (lib/wallet-card/snapshot `snapshotKey`) — sürüm önekiyle. */
export const WALLET_SNAPSHOT_PREFIX = `qx:wallet-card:v${SNAPSHOT_VERSION}:`;
/** Kartım eski anahtar ailesi (`legacySnapshotKey`). */
export const LEGACY_SNAPSHOT_PREFIX = 'qx:my-card:';
/** Çevrimdışı yedek sayfa gösterim günlüğü (bağlantı gelince analitiğe gider). */
export const OFFLINE_LOG_KEY = 'qx:offline-fallback-log';
export const OFFLINE_LOG_MAX = 20;

/**
 * Kişiye özel içerik taşıyan SW önbellekleri (config/pwa.js `cacheName`'leri + next-pwa'nın
 * başlangıç sayfası önbelleği). Hash'li statik varlık önbellekleri (next-static, fontlar,
 * görseller) kişisel değildir, silinmez.
 */
export const USER_RUNTIME_CACHES = ['others', 'start-url', 'next-data', 'static-data-assets'] as const;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key'> & { readonly length: number };

export function readSessionUid(storage: Pick<Storage, 'getItem'> | null): string | null {
  try {
    const v = storage?.getItem(SESSION_UID_KEY);
    return v && /^[A-Za-z0-9_-]{1,191}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeSessionUid(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, uid: string | null): void {
  try {
    if (!storage) return;
    if (uid) storage.setItem(SESSION_UID_KEY, uid);
    else storage.removeItem(SESSION_UID_KEY);
  } catch {
    // depolama kapalı
  }
}

function allKeys(storage: StorageLike): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k) out.push(k);
  }
  return out;
}

function isSnapshotKey(key: string): boolean {
  return key.startsWith('qx:wallet-card:') || key.startsWith(LEGACY_SNAPSHOT_PREFIX);
}

/** `keepUid` dışındaki tüm kart anlık görüntülerini siler; silinen anahtar sayısını döner. */
export function purgeSnapshots(storage: StorageLike | null, keepUid: string | null): number {
  if (!storage) return 0;
  let removed = 0;
  try {
    for (const k of allKeys(storage)) {
      if (!isSnapshotKey(k)) continue;
      if (keepUid && k === `${WALLET_SNAPSHOT_PREFIX}${keepUid}`) continue;
      storage.removeItem(k);
      removed += 1;
    }
  } catch {
    // yut
  }
  return removed;
}

/** Kişisel SW önbelleklerini siler (destek yoksa 0). */
export async function clearUserRuntimeCaches(cachesApi: CacheStorage | null | undefined): Promise<number> {
  if (!cachesApi) return 0;
  let removed = 0;
  for (const name of USER_RUNTIME_CACHES) {
    try {
      if (await cachesApi.delete(name)) removed += 1;
    } catch {
      // yut
    }
  }
  return removed;
}

export interface OfflineLogEntry {
  path: string;
  at: number;
}

export function readOfflineLog(storage: Pick<Storage, 'getItem'> | null): OfflineLogEntry[] {
  try {
    const raw = storage?.getItem(OFFLINE_LOG_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((e): e is OfflineLogEntry => !!e && typeof e.path === 'string' && typeof e.at === 'number')
      .slice(-OFFLINE_LOG_MAX);
  } catch {
    return [];
  }
}

export function clearOfflineLog(storage: Pick<Storage, 'removeItem'> | null): void {
  try {
    storage?.removeItem(OFFLINE_LOG_KEY);
  } catch {
    // yut
  }
}

/** Telemetri için yolu sadeleştirir: kart/QR kodları gibi kişisel parçalar maskelenir. */
export function redactPath(path: string): string {
  const p = path.split('?')[0] || '/';
  return p
    .replace(/^\/c\/[^/]+/, '/c/:token')
    .replace(/^\/feedback\/[^/]+/, '/feedback/:code')
    .replace(/^\/experience\/[^/]+/, '/experience/:id')
    .replace(/^\/surveys\/[^/]+/, '/surveys/:id')
    .slice(0, 120);
}

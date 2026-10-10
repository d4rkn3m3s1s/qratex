/**
 * An Motoru — istemci genel API'si (spec §2 `client.ts`).
 *
 *   moments.points({ points, xp })  → küçük, kaydedilmeyen puan kapsülü
 *   moments.refresh()               → Host bekleyen büyük anları (seviye/lig/rozet) hemen çeker
 *
 * Çağıranlar konfeti/“SEVİYE ATLADIN” bloklarını kendileri çalmaz; ödül veren isteğin
 * yanıtı geldikten sonra bu ikisini çağırır. Seviye/lig/rozet anları sunucuda
 * `CustomerMoment` olarak kaydedildiği için sekme kapansa bile kaybolmaz, bir kez oynar.
 *
 * `points()` bir Host sayfada değilse `false` döner; çağıran o durumda kendi
 * yedek bildirimini (toast) gösterir → bildirim ne kaybolur ne ikilenir.
 */
import type { PointsMoment } from './types';
import { MOMENTS_SEEN_MAX_IDS } from './types';
import { momentQueue, normalizePoints, type MomentQueue } from './queue';

/** Host'u bekleyen anları hemen çekmeye zorlayan pencere olayı. */
export const MOMENTS_REFRESH_EVENT = 'qratex:moments-refresh';

/**
 * Host kaydı. Aynı anda birden çok Host bağlanabilir (ör. sayfa geçişinde eski ve yeni
 * ağaç kısa süre birlikte); kuyruğu YALNIZ lider (ilk kaydolan, hâlâ bağlı olan) oynatır
 * ve sunucudan çeker → aynı an iki kez çizilmez. Lider ayrılınca sıradaki devralır.
 */
let hosts: symbol[] = [];
const hostListeners = new Set<() => void>();

function emitHosts() {
  for (const l of Array.from(hostListeners)) {
    try {
      l();
    } catch {
      /* yoksay */
    }
  }
}

export type MomentHostHandle = {
  /** Bu Host şu an lider mi? */
  isLeader(): boolean;
  /** Ayrılır (birden çok çağrı güvenli). */
  release(): void;
};

/** Host bağlanınca çağırır. */
export function registerMomentHost(): MomentHostHandle {
  const token = Symbol('moment-host');
  hosts = [...hosts, token];
  emitHosts();
  let done = false;
  return {
    isLeader: () => !done && hosts[0] === token,
    release: () => {
      if (done) return;
      done = true;
      hosts = hosts.filter((h) => h !== token);
      emitHosts();
    },
  };
}

/** Host kaydı değişimine abone olur (liderlik devri için). */
export function subscribeMomentHosts(listener: () => void): () => void {
  hostListeners.add(listener);
  return () => {
    hostListeners.delete(listener);
  };
}

/** Sayfada çalışan bir Host var mı? */
export function hasMomentHost(): boolean {
  return hosts.length > 0;
}

// ─── Oynatma kapısı (Host kullanır; saf, test edilebilir) ─────────────────────

export type StartGate = {
  /** Büyük (kayıtlı) an şimdi başlayabilir mi? (sekme görünür ve açık dialog yok) */
  canStartRecord: () => boolean;
  /** Büyük an GÖSTERİLMEYE BAŞLADIĞINDA (ör. `seen` POST'u için) çağrılır. */
  onRecordStart: (id: string) => void;
};

/**
 * Etkin an yoksa sıradakini başlatır.
 *  - `idle`: oynatılacak bir şey yok ya da zaten bir an oynuyor.
 *  - `blocked`: sıradaki büyük an bekliyor (dialog açık / sekme gizli) → çağıran tekrar dener.
 *  - `started`: an etkinleşti; büyük ansa `onRecordStart(id)` TAM BİR KEZ çağrıldı.
 * Puan kapsülü akışı kesmediği için kapıya takılmaz.
 */
export function tryStartNextMoment(queue: MomentQueue, gate: StartGate): 'idle' | 'blocked' | 'started' {
  if (queue.current()) return 'idle';
  const next = queue.peek();
  if (!next) return 'idle';
  if (next.lane === 'record' && !gate.canStartRecord()) return 'blocked';
  const started = queue.start();
  if (!started) return 'idle';
  if (started.lane === 'record') {
    try {
      gate.onRecordStart(started.data.id);
    } catch {
      /* görüldü bildirimi kritik değil */
    }
  }
  return 'started';
}

// ─── Sunucu uçları (Host kullanır) ───────────────────────────────────────────

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

/**
 * Görülmemiş anları çeker (`GET /api/customer/moments`). Ham dizi döner — doğrulama
 * kuyrukta (`parseMoment`). 401/403/ağ hatası/bozuk yanıt → boş dizi (sessiz).
 */
export async function fetchPendingMoments(fetchImpl: FetchLike = defaultFetch): Promise<unknown[]> {
  try {
    const res = await fetchImpl('/api/customer/moments', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as
      | { moments?: unknown; data?: { moments?: unknown } }
      | null;
    const list = json?.moments ?? json?.data?.moments;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Anları "görüldü" işaretler (`POST /api/customer/moments/seen`). An GÖSTERİLMEYE
 * BAŞLADIĞINDA çağrılır; `keepalive` sayesinde sekme hemen kapansa da istek gider.
 * Hata sessizce yutulur (en kötü durumda an bir sonraki ziyarette bir kez daha oynar;
 * aynı sekmede ise kuyruğun tekil-id hafızası tekrarı engeller).
 */
export async function markMomentsSeen(ids: readonly string[], fetchImpl: FetchLike = defaultFetch): Promise<boolean> {
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))).slice(
    0,
    MOMENTS_SEEN_MAX_IDS,
  );
  if (unique.length === 0) return false;
  try {
    const res = await fetchImpl('/api/customer/moments/seen', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unique }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const moments = {
  /**
   * Puan kapsülünü kuyruğa ekler. Host yoksa ya da değer geçersizse (0/negatif/NaN) `false`.
   * Azaltılmış harekette de kapsül görünür (sade, hareketsiz) — bilgi kaybolmaz.
   */
  points(input: PointsMoment): boolean {
    if (typeof window === 'undefined' || !hasMomentHost()) return false;
    if (!normalizePoints(input)) return false;
    return momentQueue.enqueuePoints(input);
  },

  /** Bekleyen seviye/lig/rozet anlarını çekmesi için Host'u uyarır. */
  refresh(): void {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent(MOMENTS_REFRESH_EVENT));
    } catch {
      /* eski tarayıcı: Host yine sekme görünür olduğunda çeker */
    }
  },

  /** Sayfada Host var mı (çağıran yedek bildirime karar verirken). */
  hasHost: hasMomentHost,
};

export type Moments = typeof moments;

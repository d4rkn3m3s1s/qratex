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
import { momentQueue, normalizePoints } from './queue';

/** Host'u bekleyen anları hemen çekmeye zorlayan pencere olayı. */
export const MOMENTS_REFRESH_EVENT = 'qratex:moments-refresh';

/** Host'un kayıt sayacı (aynı anda birden çok Host bağlanabilir; ör. layout + sayfa). */
let hostCount = 0;

/** Host bağlanınca çağırır; dönüş: ayrılma fonksiyonu. */
export function registerMomentHost(): () => void {
  hostCount += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    hostCount = Math.max(0, hostCount - 1);
  };
}

/** Sayfada çalışan bir Host var mı? */
export function hasMomentHost(): boolean {
  return hostCount > 0;
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

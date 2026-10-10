/**
 * An Motoru sahneleri — saf yardımcılar (React/three/DOM yok; jest ile test edilir).
 *
 * Zaman çizelgeleri burada TEK yerde durur: 3B sahne (`moment-stage-3d.tsx`) ve DOM
 * katmanı (sahne kabukları) aynı sabitleri okur, böylece "halka kapandığı anda sayaç
 * döner", "taş indiği anda lig adı belirir", "madalyon döndüğü anda ikon açılır" senkronu
 * tahminle değil sözleşmeyle kurulur.
 */
import { DURATION_MS } from '@/lib/motion/tokens';
import { calculateLevel, calculateLevelProgress, calculateXpToNextLevel } from '@/lib/utils';
import type { LevelUpPayload } from '@/lib/moments/types';

// ───────────────────────────── Süreler ─────────────────────────────

export type SceneKind = 'level_up' | 'league_up' | 'badge';

/** Sahne süreleri (ms). Hepsi `DURATION_MS.moment` (4,5 sn) sınırının içinde (spec §3). */
export const SCENE_DURATION_MS: Record<SceneKind, number> = {
  level_up: 4000,
  league_up: DURATION_MS.moment,
  badge: 3000,
};

/** Sahne açılır açılmaz gelen kazara dokunuş sahneyi kapatmasın. */
export const MIN_DISMISS_MS = 350;

/** 3B parça yüklenmezse DOM zaman çizelgesi en geç bu kadar bekler, sonra 2B yedekle başlar. */
export const STAGE_READY_TIMEOUT_MS = 700;

/** Çıkış solması (ms) — `DURATION_MS.base`. */
export const SCENE_EXIT_MS = DURATION_MS.base;

// ───────────────────────────── Zaman çizelgeleri (sn) ─────────────────────────────

/** Seviye: parçacıklar halkada toplanır; kapanış anında ışın patlaması + sayaç döner. */
export const RING_TIMELINE = {
  assembleEnd: 1.3,
  burstAt: 1.3,
} as const;

/** Lig: eski amblem dağılır, yeni lig taşı kamera yaklaşırken iner; inişte patlama. */
export const GEM_TIMELINE = {
  holdOld: 0.45,
  scatterEnd: 1.35,
  descendStart: 0.85,
  landAt: 2.0,
  dollyEnd: 2.7,
  /** Zemin eski lig renginden yenisine bu aralıkta geçer. */
  backdropFrom: 0.9,
  backdropTo: 1.9,
} as const;

/** Rozet: madalyon dönerek gelir, takla atar, yüzü kameraya dönerken ikon açılır. */
export const MEDALLION_TIMELINE = {
  enterEnd: 0.55,
  flipStart: 0.45,
  flipEnd: 1.25,
  revealAt: 1.1,
  burstAt: 1.2,
} as const;

/**
 * Halkanın ekrandaki yarıçapı = bu oran × min(genişlik, yükseklik) / 2.
 * 3B sahne kamerayı buna göre kurar, DOM sayacı aynı oranla halkanın İÇİNE yerleşir.
 */
export const RING_SCREEN_FRACTION = 0.56;

/** Taşın ekrandaki yaklaşık yarı yüksekliği (min boyut oranı) — lig metni bunun altına oturur. */
export const GEM_SCREEN_FRACTION = 0.42;

// ───────────────────────────── Matematik ─────────────────────────────

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  const k = clamp01(t);
  return 1 - Math.pow(1 - k, 3);
}

export function easeInOutCubic(t: number): number {
  const k = clamp01(t);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** Hafif aşmalı yerleşme (taş inişi). */
export function easeOutBack(t: number, overshoot = 1.4): number {
  const k = clamp01(t);
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + overshoot * Math.pow(k - 1, 2);
}

/** a..b aralığında 0→1 ilerleme (aralık dışında kırpılır). */
export function progressBetween(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  return clamp01((t - a) / (b - a));
}

/**
 * Işın patlaması zarfı: `at` anında başlar, ~0,3 sn'de tepeye çıkar, yavaşça söner.
 * `at`'tan önce 0.
 */
export function burstEnvelope(t: number, at: number): number {
  const s = t - at;
  if (!(s >= 0)) return 0;
  return Math.min(1, s / 0.3) * Math.exp(-Math.max(0, s - 0.6) * 1.15);
}

/** Cihaz piksel oranı tavanı (spec: DPR ≤ 1.5). */
export const MAX_STAGE_DPR = 1.5;

export function stageDpr(devicePixelRatio: number | undefined): number {
  const d = typeof devicePixelRatio === 'number' && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(d, MAX_STAGE_DPR);
}

/**
 * Dikey görüş açısı (derece): yatay ekranda `baseFov` aynen; dikey (portre) ekranda
 * YATAY görüş `baseFov` olacak şekilde genişletilir → nesne telefonda yanlardan taşmaz.
 * Böylece sahnenin "küçük kenarı" her en-boy oranında aynı dünya ölçüsünü görür.
 */
export function fitVerticalFov(aspect: number, baseFovDeg: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return baseFovDeg;
  if (aspect >= 1) return baseFovDeg;
  const half = (baseFovDeg * Math.PI) / 360;
  const v = (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI;
  return Math.min(v, 120);
}

/** Kamera mesafesinde, küçük kenarın yarısına denk gelen dünya ölçüsü. */
export function halfExtentAt(distance: number, baseFovDeg: number): number {
  return distance * Math.tan((baseFovDeg * Math.PI) / 360);
}

/** Kanvas arka tampon boyutu: CSS boyutu × DPR, en az 1 piksel. */
export function backbufferSize(cssWidth: number, cssHeight: number, dpr: number): { w: number; h: number } {
  const w = Math.max(1, Math.floor((Number.isFinite(cssWidth) ? Math.max(0, cssWidth) : 0) * dpr) || 1);
  const h = Math.max(1, Math.floor((Number.isFinite(cssHeight) ? Math.max(0, cssHeight) : 0) * dpr) || 1);
  return { w, h };
}

// ───────────────────────────── Seviye modeli ─────────────────────────────

export interface LevelSceneModel {
  from: number;
  to: number;
  /** Sonraki seviyeye ilerleme (0–100) — XP formülü `to` ile tutarsızsa null. */
  progressPct: number | null;
  /** Sonraki seviyeye kalan XP — tutarsızsa null. */
  xpToNext: number | null;
}

/**
 * `level_up` yükünden sahne modeli. `xp` artış sonrası toplam XP'dir; ilerleme yalnız
 * `calculateLevel(xp) === to` iken gösterilir (formül değişmiş ya da yük bozuksa yanlış
 * çubuk göstermektense hiç göstermeyiz).
 */
export function levelSceneModel(payload: Partial<LevelUpPayload> | null | undefined): LevelSceneModel {
  const toRaw = Math.floor(Number(payload?.to));
  const to = Number.isFinite(toRaw) && toRaw > 0 ? toRaw : 1;
  const fromRaw = Math.floor(Number(payload?.from));
  const from = Number.isFinite(fromRaw) && fromRaw > 0 && fromRaw < to ? fromRaw : Math.max(1, to - 1);
  const xp = Number(payload?.xp);
  if (!Number.isFinite(xp) || xp < 0 || calculateLevel(xp) !== to) {
    return { from, to, progressPct: null, xpToNext: null };
  }
  const pct = Math.max(0, Math.min(100, Math.round(calculateLevelProgress(xp))));
  const xpToNext = Math.max(0, Math.round(calculateXpToNextLevel(xp)));
  return { from, to, progressPct: pct, xpToNext };
}

/**
 * Odometre basamakları: `to`'nun basamak sayısına göre soldan sağa.
 * `from` daha kısaysa baştaki sütunlar `null` (o sütun girişte görünmez, sonra belirir).
 */
export function odometerColumns(from: number, to: number): Array<{ from: number | null; to: number }> {
  const t = String(Math.max(0, Math.floor(to)));
  const fRaw = String(Math.max(0, Math.floor(from)));
  const f = fRaw.length > t.length ? fRaw.slice(-t.length) : fRaw;
  const pad = t.length - f.length;
  return t.split('').map((d, i) => ({
    from: i < pad ? null : Number(f[i - pad]),
    to: Number(d),
  }));
}

// ───────────────────────────── Rozet ikonu ─────────────────────────────

export type BadgeIconKind = 'image' | 'emoji' | 'none';

const IMAGE_EXT_RE = /\.(svg|png|jpe?g|webp|gif|avif)(\?.*)?$/i;

/**
 * Rozet `icon` alanı: görsel yolu/URL'si (`/badges/X.svg`, `https://…`) ya da emoji/kısa metin.
 * Tehlikeli şemalar (javascript:, data:text…) görsel sayılmaz.
 */
export function classifyBadgeIcon(icon: unknown): BadgeIconKind {
  if (typeof icon !== 'string') return 'none';
  const v = icon.trim();
  if (!v) return 'none';
  // Protokol-göreli (`//host/x.png`) ve ters bölüye dönen (`/\host`, `\\host`) yollar
  // tarayıcıda HARİCİ sunucuya gider → görsel sayılmaz (izleme pikseli / karışık içerik).
  if (/^[\\/]{2}|^\/\\/.test(v)) return 'none';
  if (v.startsWith('/')) return 'image';
  if (/^https:\/\//i.test(v)) return 'image';
  if (/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml)[;,]/i.test(v)) return 'image';
  if (IMAGE_EXT_RE.test(v) && !/^[a-z]+:/i.test(v)) return 'image';
  // Emoji ya da en fazla birkaç karakterlik kısa simge.
  return Array.from(v).length <= 4 ? 'emoji' : 'none';
}

// ───────────────────────────── Odak tuzağı ─────────────────────────────

/**
 * Tab / Shift+Tab ile odaklanabilir öğeler arasında döngü. `current` listede yoksa
 * (odak kabın kendisinde ya da dışarıda) ileri → ilk, geri → son.
 */
export function nextFocusIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  if (backwards) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

/**
 * Otomatik kapanma sayacı: duraklatılabilen kalan süre hesabı.
 * `elapsedBefore` önceki koşularda biriken süre; koşu sürerken `runningSince` dolu.
 */
export function remainingMs(totalMs: number, elapsedBefore: number, runningSince: number | null, now: number): number {
  const live = runningSince == null ? 0 : Math.max(0, now - runningSince);
  return Math.max(0, totalMs - elapsedBefore - live);
}

// ───────────────────────────── Sahne saati ─────────────────────────────

/**
 * Duraklatılabilen sahne saati. DOM zaman çizelgesi (sahne kabuğu) ve 3B sahne AYNI
 * saati okur: sekme gizlenince kabuk saati durdurur, 3B sahne de aynı karede donar;
 * geri gelindiğinde ikisi kaldığı yerden birlikte devam eder (senkron sözleşmeyle).
 *
 * `now` dışarıdan verilir (`performance.now()`): saf ve test edilebilir.
 */
export interface SceneClock {
  /** İlk başlatma (sonraki çağrılar no-op). */
  start(now: number): void;
  /** Duraklat (çalışmıyorsa no-op). */
  pause(now: number): void;
  /** Devam et (başlamamış ya da zaten çalışıyorsa no-op). */
  resume(now: number): void;
  /** Başladığından bu yana geçen ETKİN süre (ms). Başlamadıysa 0. */
  elapsedMs(now: number): number;
  started(): boolean;
  running(): boolean;
}

export function createSceneClock(): SceneClock {
  let before = 0;
  let since: number | null = null;
  let begun = false;
  return {
    start(now) {
      if (begun) return;
      begun = true;
      since = now;
    },
    pause(now) {
      if (since == null) return;
      before += Math.max(0, now - since);
      since = null;
    },
    resume(now) {
      if (!begun || since != null) return;
      since = now;
    },
    elapsedMs(now) {
      return before + (since == null ? 0 : Math.max(0, now - since));
    },
    started: () => begun,
    running: () => since != null,
  };
}

/**
 * Zaman çizelgesi işaretleri: `elapsed` anından sonra gelecek işaretlerin kaç ms
 * sonra tetikleneceği (artan sırada, tekrarsız). Geçmiş işaretler listede yer almaz.
 */
export function upcomingMarks(marksMs: readonly number[], elapsed: number): Array<{ mark: number; inMs: number }> {
  const uniq = Array.from(new Set(marksMs.filter((m) => Number.isFinite(m) && m > elapsed))).sort((a, b) => a - b);
  return uniq.map((mark) => ({ mark, inMs: mark - elapsed }));
}

/** Saniye cinsinden zaman çizelgesi değerini ms işaretine çevirir. */
export function secToMs(sec: number): number {
  return Math.round(sec * 1000);
}

/**
 * Azaltılmış harekette sade kartın ekranda kalma süresi: okunabilsin diye normal
 * sahneden kısa olmaz, en az 5 sn.
 */
export function reducedSceneDurationMs(kind: SceneKind): number {
  return Math.max(SCENE_DURATION_MS[kind], 5000);
}

/** Türkçe binlik ayraçlı tam sayı (sunucu/istemci aynı çıktı: Intl yerine sabit kural). */
export function formatSceneInt(value: number): string {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

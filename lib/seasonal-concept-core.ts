/**
 * Dönemsel konsept çekirdeği. Bir tarih penceresinde aktif olan konsepti çözer ve
 * Settings['activeSeasonalConcept'] anahtarına yazar (günlük cron + admin kaydında).
 * İstemci bu anahtarı okuyup arka plan efekti + palet + banner uygular.
 *
 * Çakışan konseptlerde: priority (büyük öncelikli) → daha geç başlayan kazanır.
 *
 * Önbellek "tek kazanan + bitiş" değil, "kazanan + bir sonraki değişim anı" (`nextChangeAt`)
 * saklar: kazananın bitişi ile bugünden sonra başlayan ilk etkin konseptin başlangıcının
 * küçüğü. Böylece sonradan başlayan yüksek öncelikli konsept cron'u beklemeden görünür.
 * Okuma hatası "konsept yok" sayılmaz: senkron yalnız başarılı okumada yazar.
 */
import { prisma } from '@/lib/prisma';

export const ACTIVE_SEASONAL_CONCEPT_KEY = 'activeSeasonalConcept';

export interface ActiveSeasonalConcept {
  id: string;
  name: string;
  backgroundEffect: string | null;
  themePresetId: string | null;
  bannerText: string | null;
  bannerEmoji: string | null;
  endDate: string; // ISO
}

export interface SeasonalConceptResolution {
  concept: ActiveSeasonalConcept | null;
  /** Kazananın değişebileceği ilk an (ISO); null = öngörülen değişim yok. */
  nextChangeAt: string | null;
}

const SELECT = {
  id: true,
  name: true,
  backgroundEffect: true,
  themePresetId: true,
  bannerText: true,
  bannerEmoji: true,
  endDate: true,
} as const;

/** Kazananı ve bir sonraki değişim anını çözer. Hata FIRLATIR (çağıran ayırt eder). */
export async function resolveSeasonalConcept(now: Date = new Date()): Promise<SeasonalConceptResolution> {
  const [c, nextStart] = await Promise.all([
    prisma.seasonalConcept.findFirst({
      where: { isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: [{ priority: 'desc' }, { startDate: 'desc' }],
      select: SELECT,
    }),
    prisma.seasonalConcept.findFirst({
      where: { isActive: true, startDate: { gt: now } },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    }),
  ]);
  const concept: ActiveSeasonalConcept | null = c
    ? {
        id: c.id,
        name: c.name,
        backgroundEffect: c.backgroundEffect,
        themePresetId: c.themePresetId,
        bannerText: c.bannerText,
        bannerEmoji: c.bannerEmoji,
        endDate: c.endDate.toISOString(),
      }
    : null;
  const candidates = [c?.endDate?.getTime(), nextStart?.startDate?.getTime()].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v)
  );
  const next = candidates.length > 0 ? new Date(Math.min(...candidates)).toISOString() : null;
  return { concept, nextChangeAt: next };
}

/** Verilen anda aktif (penceresi açık, isActive) en öncelikli konsepti döndürür; hata → null. */
export async function getActiveSeasonalConcept(now: Date = new Date()): Promise<ActiveSeasonalConcept | null> {
  try {
    return (await resolveSeasonalConcept(now)).concept;
  } catch {
    return null;
  }
}

/**
 * Aktif konsepti hesaplar ve Settings'e yazar (cache kaynağı). Cron + admin kaydı sonrası
 * çağrılır. Okuma başarısızsa YAZMAZ (geçici DB hatası canlı konsepti silmesin) ve null döner.
 */
export async function syncActiveSeasonalConcept(now: Date = new Date()): Promise<ActiveSeasonalConcept | null> {
  let resolved: SeasonalConceptResolution;
  try {
    resolved = await resolveSeasonalConcept(now);
  } catch (err) {
    console.error('[seasonal-concept] senkron okuması başarısız; önbellek korunuyor:', err);
    return null;
  }
  const value = resolved.concept
    ? { ...resolved.concept, nextChangeAt: resolved.nextChangeAt }
    : { none: true, nextChangeAt: resolved.nextChangeAt };
  await prisma.settings.upsert({
    where: { key: ACTIVE_SEASONAL_CONCEPT_KEY },
    create: { key: ACTIVE_SEASONAL_CONCEPT_KEY, category: 'seasonal', value: value as object },
    update: { value: value as object },
  });
  return resolved.concept;
}

/** Settings'ten okunmuş ham değeri tip-güvenli ActiveSeasonalConcept'e çevirir. */
export function parseActiveSeasonalConcept(raw: unknown): ActiveSeasonalConcept | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null;
  return {
    id: o.id,
    name: o.name,
    backgroundEffect: typeof o.backgroundEffect === 'string' ? o.backgroundEffect : null,
    themePresetId: typeof o.themePresetId === 'string' ? o.themePresetId : null,
    bannerText: typeof o.bannerText === 'string' ? o.bannerText : null,
    bannerEmoji: typeof o.bannerEmoji === 'string' ? o.bannerEmoji : null,
    endDate: typeof o.endDate === 'string' ? o.endDate : '',
  };
}

/**
 * Önbellek hâlâ geçerli mi? Geçerliyse `{ concept }` (konsept null olabilir), değilse null.
 *  - Yeni biçim: `nextChangeAt` gelecekte (ya da null = değişim öngörülmüyor) → geçerli.
 *  - Eski biçim (nextChangeAt yok): konsept var ve bitişi gelecekteyse geçerli.
 */
export function readValidSeasonalCache(raw: unknown, now: Date): { concept: ActiveSeasonalConcept | null } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if ('nextChangeAt' in o) {
    const next = o.nextChangeAt;
    if (next !== null && (typeof next !== 'string' || !(new Date(next).getTime() > now.getTime()))) return null;
    return { concept: o.none === true ? null : parseActiveSeasonalConcept(o) };
  }
  const legacy = parseActiveSeasonalConcept(o);
  if (legacy && legacy.endDate && new Date(legacy.endDate).getTime() > now.getTime()) return { concept: legacy };
  return null;
}

/**
 * Yılım hikâyesinin slayt planı — SAF (test edilebilir). Her slayt tek bir gerçeği anlatır;
 * verisi olmayan slayt hiç gösterilmez (sıfır göstermek yerine anlatı kısalır, denetim bulgu 7).
 */
import type { YearSummary } from '@/lib/customer-year/contract';

export const SLIDE_IDS = ['intro', 'visits', 'favorite', 'ratings', 'impact', 'badges', 'journey', 'rhythm', 'outro'] as const;
export type SlideId = (typeof SLIDE_IDS)[number];

/** Slayt başına vurgu (QDL `--category-*` sırası); aura ve ilerleme çubuğu bu rengi alır. */
export const SLIDE_ACCENT: Record<SlideId, [number, number]> = {
  intro: [1, 8],
  visits: [2, 1],
  favorite: [4, 7],
  ratings: [4, 5],
  impact: [3, 2],
  badges: [8, 4],
  journey: [6, 1],
  rhythm: [5, 8],
  outro: [1, 3],
};

/** Otomatik ilerleme süresi (ms). Azaltılmış harekette otomatik ilerleme YOK. */
export const SLIDE_DURATION_MS = 6500;

export function hasJourney(s: YearSummary): boolean {
  const j = s.journey;
  return j.leagueUps.length > 0 || j.levelUps > 0 || j.endLeague !== null || j.peakLeague !== null;
}

export function buildSlides(s: YearSummary): SlideId[] {
  const out: SlideId[] = ['intro'];
  if (s.visits.total > 0) out.push('visits');
  if (s.favorites.length > 0) out.push('favorite');
  if (s.reviews.total > 0) out.push('ratings');
  if (s.impact.repliedReviews > 0) out.push('impact');
  if (s.badges.total > 0) out.push('badges');
  if (hasJourney(s)) out.push('journey');
  if (s.visits.activeDays >= 2 && s.rhythm.peak !== null) out.push('rhythm');
  out.push('outro');
  return out;
}

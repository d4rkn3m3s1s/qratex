/**
 * Katkı skoru (eski "Yolculuk skoru") — saf fonksiyon, jest ile test edilir.
 *
 * Eski formül (journey-score bulgu 1) skorun ~%91'ini VERİLEN YILDIZDAN türetiyordu: tek bir
 * 5★ yorum 92 puan, on dürüst 2★ yorum 40 puan. Dürüst geri bildirimi cezalandıran ters teşvikti.
 *
 * Yeni tanım — yalnız KATKI ölçülür, puanın yönü hiçbir bileşene girmez (değişmez, testli):
 *  - Katılım     (35): son 90 günde yazılan yorum sayısı (QR geri bildirimi + tüketim yorumu), tavan 12
 *  - Ayrıntı     (25): son 90 günde 100+ karakterlik, işaretlenmemiş yorum, tavan 8
 *  - Düzenlilik  (25): son 12 haftanın kaçında yorum yazıldı (İstanbul haftası), tavan 8
 *  - Etki        (15): son 90 günde işletmenin yanıt verdiği yorum, tavan 4
 *
 * Aşamalar 0/25/50/75 eşikleriyle 4 kademe. "Sonraki aşama" planı sunucuda hesaplanır ve
 * yalnız kullanıcının yapabileceği eylemlerden oluşur (işletme yanıtı plana girmez).
 */
import { addDays, dayToUTCDate, istanbulDay } from '@/components/ds/page/date-range';

/** lib/quests/mechanics → DETAILED_MIN_LENGTH ile aynı ("100+ karakter" görevleriyle tutarlı). */
export const DETAILED_MIN_CHARS = 100;
export const CONTRIBUTION_WINDOW_DAYS = 90;
export const CONTRIBUTION_WEEKS = 12;

export type ContributionComponentKey = 'participation' | 'detail' | 'regularity' | 'impact';

export const CONTRIBUTION_RULES: Readonly<Record<ContributionComponentKey, { cap: number; max: number }>> = {
  participation: { cap: 12, max: 35 },
  detail: { cap: 8, max: 25 },
  regularity: { cap: 8, max: 25 },
  impact: { cap: 4, max: 15 },
};

export const CONTRIBUTION_STAGES = [0, 25, 50, 75] as const;
export type ContributionStage = 0 | 1 | 2 | 3;

/** Yorum sinyali. `rating` bilerek YOK: skor yıldızın yönünü görmez. */
export type ReviewSignal = {
  at: Date;
  textLength: number;
  /** Toksik ya da güven filtresine takılmış yorum: ayrıntı bileşenine sayılmaz. */
  flagged: boolean;
  repliedAt: Date | null;
};

export type ContributionCounts = Record<ContributionComponentKey, number>;

export type ContributionComponent = {
  key: ContributionComponentKey;
  count: number;
  cap: number;
  points: number;
  max: number;
};

export type ContributionPlan = {
  /** Toplam yazılacak yorum. */
  reviews: number;
  /** Bunlardan kaçı 100+ karakter olmalı. */
  detailed: number;
  /** Bunlardan kaçı şimdiye dek yorum yazılmamış bir haftaya düşmeli. */
  newWeeks: number;
};

export type ContributionResult = {
  score: number;
  stage: ContributionStage;
  components: ContributionComponent[];
  next: { stage: ContributionStage; at: number; pointsNeeded: number; plan: ContributionPlan | null } | null;
};

const DAY_MS = 86_400_000;

/** İstanbul haftasının Pazartesi günü (`YYYY-MM-DD`). */
export function istanbulWeekKey(at: Date): string {
  const day = istanbulDay(at);
  const dow = dayToUTCDate(day).getUTCDay(); // 0 = Pazar
  return addDays(day, -((dow + 6) % 7));
}

/** Bir an itibarıyla sayaçlar (geçmiş anlar için de: haftalık değişim ve eğilim). */
export function contributionCounts(reviews: readonly ReviewSignal[], asOf: Date): ContributionCounts {
  const asOfMs = asOf.getTime();
  const windowStart = asOfMs - CONTRIBUTION_WINDOW_DAYS * DAY_MS;
  const currentWeek = istanbulWeekKey(asOf);
  const oldestWeek = addDays(currentWeek, -7 * (CONTRIBUTION_WEEKS - 1));
  let participation = 0;
  let detail = 0;
  let impact = 0;
  const weeks = new Set<string>();
  for (const r of reviews) {
    const t = r.at.getTime();
    if (!(t <= asOfMs)) continue;
    const wk = istanbulWeekKey(r.at);
    if (wk >= oldestWeek && wk <= currentWeek) weeks.add(wk);
    if (t < windowStart) continue;
    participation += 1;
    if (!r.flagged && r.textLength >= DETAILED_MIN_CHARS) detail += 1;
    if (r.repliedAt && r.repliedAt.getTime() <= asOfMs) impact += 1;
  }
  return { participation, detail, regularity: weeks.size, impact };
}

function componentPoints(key: ContributionComponentKey, count: number): number {
  const rule = CONTRIBUTION_RULES[key];
  return (Math.min(Math.max(0, count), rule.cap) / rule.cap) * rule.max;
}

export function scoreFromCounts(c: ContributionCounts): number {
  const raw =
    componentPoints('participation', c.participation) +
    componentPoints('detail', c.detail) +
    componentPoints('regularity', c.regularity) +
    componentPoints('impact', c.impact);
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export function stageFor(score: number): ContributionStage {
  let s: ContributionStage = 0;
  for (let i = 0; i < CONTRIBUTION_STAGES.length; i++) if (score >= CONTRIBUTION_STAGES[i]) s = i as ContributionStage;
  return s;
}

type Action = { reviews: 1; detailed: 0 | 1; newWeek: 0 | 1 };
const ACTIONS: readonly Action[] = [
  // Eşit kazançta yeni hafta gerektirmeyen (daha hızlı) eylem önce denenir.
  { reviews: 1, detailed: 1, newWeek: 0 },
  { reviews: 1, detailed: 0, newWeek: 0 },
  { reviews: 1, detailed: 1, newWeek: 1 },
  { reviews: 1, detailed: 0, newWeek: 1 },
];

/**
 * Hedef skora ulaşmak için en az eylemli yol (açgözlü; her adımda en çok puan getiren
 * eylem). İşletme yanıtı kullanıcının elinde olmadığı için plana girmez. Ulaşılamıyorsa null.
 */
export function planToReach(counts: ContributionCounts, target: number, maxSteps = 40): ContributionPlan | null {
  const s = { ...counts };
  const plan: ContributionPlan = { reviews: 0, detailed: 0, newWeeks: 0 };
  let score = scoreFromCounts(s);
  let steps = 0;
  while (score < target && steps < maxSteps) {
    let best: { a: Action; gain: number } | null = null;
    for (const a of ACTIONS) {
      const nextScore = scoreFromCounts({
        participation: s.participation + a.reviews,
        detail: s.detail + a.detailed,
        regularity: s.regularity + a.newWeek,
        impact: s.impact,
      });
      const gain = nextScore - score;
      // Tamsayıya yuvarlanmış skor küçük adımlarda kıpırdamayabilir; ham katkıyla karşılaştır.
      const rawGain =
        componentPoints('participation', s.participation + a.reviews) -
        componentPoints('participation', s.participation) +
        componentPoints('detail', s.detail + a.detailed) -
        componentPoints('detail', s.detail) +
        componentPoints('regularity', s.regularity + a.newWeek) -
        componentPoints('regularity', s.regularity);
      const g = Math.max(gain, rawGain);
      if (g > 1e-9 && (!best || g > best.gain + 1e-9)) best = { a, gain: g };
    }
    if (!best) return null;
    s.participation += best.a.reviews;
    s.detail += best.a.detailed;
    s.regularity += best.a.newWeek;
    plan.reviews += 1;
    plan.detailed += best.a.detailed;
    plan.newWeeks += best.a.newWeek;
    score = scoreFromCounts(s);
    steps += 1;
  }
  return score >= target ? plan : null;
}

export function contributionScore(reviews: readonly ReviewSignal[], asOf: Date): ContributionResult {
  const counts = contributionCounts(reviews, asOf);
  const score = scoreFromCounts(counts);
  const stage = stageFor(score);
  const components: ContributionComponent[] = (Object.keys(CONTRIBUTION_RULES) as ContributionComponentKey[]).map((key) => ({
    key,
    count: counts[key],
    cap: CONTRIBUTION_RULES[key].cap,
    points: Math.round(componentPoints(key, counts[key]) * 10) / 10,
    max: CONTRIBUTION_RULES[key].max,
  }));
  const nextStage = stage < 3 ? ((stage + 1) as ContributionStage) : null;
  const next =
    nextStage == null
      ? null
      : {
          stage: nextStage,
          at: CONTRIBUTION_STAGES[nextStage],
          pointsNeeded: CONTRIBUTION_STAGES[nextStage] - score,
          plan: planToReach(counts, CONTRIBUTION_STAGES[nextStage]),
        };
  return { score, stage, components, next };
}

/** Son `weeks` haftanın skoru (eski → yeni) — haftalık anlık görüntü tablosu olmadan, veriden. */
export function contributionHistory(reviews: readonly ReviewSignal[], asOf: Date, weeks = 8): number[] {
  const out: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    out.push(scoreFromCounts(contributionCounts(reviews, new Date(asOf.getTime() - i * 7 * DAY_MS))));
  }
  return out;
}

/** Geçmiş hesapları için gereken veri penceresi (gün). */
export function contributionLookbackDays(historyWeeks = 8): number {
  return Math.max(CONTRIBUTION_WINDOW_DAYS, CONTRIBUTION_WEEKS * 7) + historyWeeks * 7 + 1;
}

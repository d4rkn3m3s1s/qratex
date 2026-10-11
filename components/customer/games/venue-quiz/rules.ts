/**
 * Mekân Bilgi Yarışması — saf kurallar (React'sız; istemci + sunucu ortak).
 *
 * Puanlama (sunucu otoriter; istemci yalnız pratikte aynı fonksiyonla yerel puanlar):
 *   doğru cevap  = 10
 *   hız bonusu   = 0..5 (≤ 3 sn → 5; 15 sn'de 0'a doğrusal iner)
 *   seri bonusu  = +2 (art arda 3. doğrudan itibaren)
 *   süre doldu / yanlış = 0 ve seri sıfırlanır
 *
 * Zaman: cevap süresi = `tMs_i − (tMs_{i−1} + TRANSITION_MS)` (ilk soruda `tMs_0`). `tMs` ilk
 * sorunun gösterildiği andan ms. Sıralıda soru süresi duraklatmada DA işler (sunucu duvar
 * saatine bakar); pratikte duraklatma süreyi dondurur.
 */

export const QUESTION_MS = 15_000;
/** Cevap sonrası sonraki soruya geçiş (sıralı + düello; istemci tam bu kadar bekler). */
export const TRANSITION_MS = 1_100;
/** Sunucunun süre aşımı toleransı (ağ/zamanlayıcı titremesi). */
export const TIMEOUT_SLACK_MS = 1_500;
/** Bundan hızlı cevap "insanüstü" sayılır (soruyu okumak gerekir). */
export const MIN_ANSWER_MS = 400;
/** Sıralı tur soru sayısı. */
export const RANKED_COUNT = 10;
/** Pratik ve düello turu soru sayısı. */
export const PRACTICE_COUNT = 8;
export const DUEL_COUNT = 8;
/** Süre dolduğunda gönderilen karar (hiçbir şıkla eşleşmez). */
export const TIMEOUT_VERDICT = 'timeout';

export const BASE_POINTS = 10;
export const MAX_SPEED_BONUS = 5;
export const STREAK_BONUS = 2;
export const STREAK_FROM = 3;

export type CategoryId = 'kahve' | 'mutfak' | 'tatli' | 'icecek' | 'sehir' | 'mekan';

export const CATEGORIES: readonly { id: CategoryId; title: string; emoji: string; blurb: string }[] = [
  { id: 'kahve', title: 'Kahve & Çay', emoji: '☕', blurb: 'Demleme, çekirdek, gelenek' },
  { id: 'mutfak', title: 'Türk Mutfağı', emoji: '🍲', blurb: 'Yöresel yemekler ve teknikler' },
  { id: 'tatli', title: 'Tatlı & Fırın', emoji: '🥐', blurb: 'Pastane, şerbet, hamur işi' },
  { id: 'icecek', title: 'İçecekler', emoji: '🥤', blurb: 'Şerbetten ayrana' },
  { id: 'sehir', title: 'Şehir Kültürü', emoji: '🏙️', blurb: 'Şehirler, semtler, lezzet durakları' },
  { id: 'mekan', title: 'Mekân Bilgisi', emoji: '🍽️', blurb: 'Servis, menü, mutfak dili' },
];

export function isCategory(v: unknown): v is CategoryId {
  return typeof v === 'string' && CATEGORIES.some((c) => c.id === v);
}

export function categoryMeta(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? { id: 'mekan' as CategoryId, title: 'Genel', emoji: '❓', blurb: '' };
}

/** Hız bonusu: ≤ 3 sn → 5, 15 sn → 0 (doğrusal, yukarı yuvarlanır). */
export function speedBonus(answerMs: number): number {
  if (!Number.isFinite(answerMs) || answerMs >= QUESTION_MS) return 0;
  const fast = 3_000;
  if (answerMs <= fast) return MAX_SPEED_BONUS;
  return Math.max(0, Math.min(MAX_SPEED_BONUS, Math.ceil((MAX_SPEED_BONUS * (QUESTION_MS - answerMs)) / (QUESTION_MS - fast))));
}

export interface TimedAnswer {
  id: string;
  verdict: string;
  tMs: number;
}

export interface ScoredAnswer {
  id: string;
  correct: boolean;
  timedOut: boolean;
  answerMs: number;
  points: number;
  streak: number;
}

export interface RunScore {
  score: number;
  correct: number;
  answers: ScoredAnswer[];
  /** MIN_ANSWER_MS'ten hızlı cevap sayısı. */
  fast: number;
}

/**
 * Bir turun saf puanlaması (sunucu doğrulayıcısı, düello ve pratik aynı fonksiyonu kullanır).
 * `key`: soru → doğru şık kimliği. Sıra/kimlik denetimi çağıranda (doğrulayıcı).
 */
export function scoreRun(answers: readonly TimedAnswer[], key: Readonly<Record<string, string>>): RunScore {
  let score = 0;
  let correctCount = 0;
  let streak = 0;
  let fast = 0;
  let prevT = -1;
  const out: ScoredAnswer[] = [];
  for (const a of answers) {
    const answerMs = Math.max(0, prevT < 0 ? a.tMs : a.tMs - (prevT + TRANSITION_MS));
    prevT = a.tMs;
    if (a.verdict !== TIMEOUT_VERDICT && answerMs < MIN_ANSWER_MS) fast += 1;
    const timedOut = a.verdict === TIMEOUT_VERDICT || answerMs > QUESTION_MS + TIMEOUT_SLACK_MS;
    const correct = !timedOut && key[a.id] !== undefined && a.verdict === key[a.id];
    streak = correct ? streak + 1 : 0;
    const points = correct ? BASE_POINTS + speedBonus(answerMs) + (streak >= STREAK_FROM ? STREAK_BONUS : 0) : 0;
    if (correct) correctCount += 1;
    score += points;
    out.push({ id: a.id, correct, timedOut, answerMs, points, streak });
  }
  return { score, correct: correctCount, answers: out, fast };
}

/** n soruluk turun teorik tavanı (hepsi doğru + en hızlı + seri). */
export function maxPossibleScore(n: number): number {
  let s = 0;
  for (let i = 1; i <= n; i++) s += BASE_POINTS + MAX_SPEED_BONUS + (i >= STREAK_FROM ? STREAK_BONUS : 0);
  return s;
}

/** 0–3 yıldız: eşik = 1, eşik ile tavan arası %55 = 2, %80 = 3. */
export function starsFor(score: number, threshold: number, max: number): 0 | 1 | 2 | 3 {
  if (score < threshold) return 0;
  const span = Math.max(1, max - threshold);
  const f = (score - threshold) / span;
  return f >= 0.8 ? 3 : f >= 0.55 ? 2 : 1;
}

/** "Mehmet Yılmaz" → "Mehmet Y." (düello kartında gizlilik). */
export function shortDisplayName(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return 'Bir oyuncu';
  const parts = t.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 20);
  return `${parts[0].slice(0, 20)} ${parts[parts.length - 1][0].toLocaleUpperCase('tr-TR')}.`;
}

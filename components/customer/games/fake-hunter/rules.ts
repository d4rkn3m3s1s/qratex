/**
 * Sahte Avcısı — SAF kurallar (istemci + sunucu ortak). React'sız, içeriksiz.
 *
 * Puan: doğru = +2, her 3'lü seride +1 bonus; yanlış / süre doldu = −1. Toplam 0'ın altına
 * düşmez (sunucu da `runVerifier`'da 0..maxScore'a kırpar). 12 öğede tavan 28.
 * Sunucu doğrulayıcısı (`lib/games/validators/fake-hunter.ts`) AYNI `scoreAnswer`'ı kullanır;
 * istemcinin gösterdiği skor ile sunucunun hesapladığı skor birebir aynıdır.
 */

export type FakeHunterMode = 'kaydir' | 'dosya' | 'kelime' | 'profil';
export const MODE_ORDER: readonly FakeHunterMode[] = ['kaydir', 'dosya', 'kelime', 'profil'];

/** Sıralı turda mod başına öğe. */
export const RANKED_PER_MODE = 3;
export const RANKED_TOTAL = RANKED_PER_MODE * MODE_ORDER.length;

/** Süre dolduğunda gönderilen karar (her zaman yanlış sayılır). */
export const TIMEOUT_VERDICT = 'timeout';

/** Sıralı turda öğe başına süre (ms). Pratikte süre yok. */
export const ITEM_TIME_MS: Record<FakeHunterMode, number> = {
  kaydir: 9000,
  dosya: 16000,
  kelime: 13000,
  profil: 16000,
};

export function scoreAnswer(ctx: { correct: boolean; streak: number }): number {
  if (!ctx.correct) return -1;
  return 2 + (ctx.streak > 0 && ctx.streak % 3 === 0 ? 1 : 0);
}

/** Sıralı cevaplardan toplam skor (istemci HUD'u; sunucu aynı formülü kullanır). */
export function totalScore(correctness: readonly boolean[]): number {
  let streak = 0;
  let s = 0;
  for (const c of correctness) {
    streak = c ? streak + 1 : 0;
    s += scoreAnswer({ correct: c, streak });
  }
  return Math.max(0, s);
}

/** 12 öğede ulaşılabilir en yüksek skor. */
export function maxPossibleScore(n: number): number {
  return totalScore(Array.from({ length: n }, () => true));
}

/** Yıldız: eşiğe göre 0–3 (kozmetik; ödül kararı sunucuda). */
export function starsFor(score: number, threshold: number, max: number): 0 | 1 | 2 | 3 {
  if (score < threshold) return 0;
  const top = Math.max(threshold + 1, max);
  if (score >= top - 2) return 3;
  if (score >= threshold + Math.ceil((top - threshold) / 2)) return 2;
  return 1;
}

// ───────────────────────────── Elo zorluk ─────────────────────────────

export const ELO_START = 1000;
const K = 24;
export const ITEM_RATING: Record<1 | 2 | 3, number> = { 1: 850, 2: 1050, 3: 1250 };

export function expectedWin(player: number, item: number): number {
  return 1 / (1 + Math.pow(10, (item - player) / 400));
}

export function updateElo(player: number, difficulty: 1 | 2 | 3, correct: boolean): number {
  const e = expectedWin(player, ITEM_RATING[difficulty]);
  const next = player + K * ((correct ? 1 : 0) - e);
  return Math.round(Math.max(400, Math.min(2400, next)));
}

/** Unvan basamağı (0 = Çaylak … 4 = Baş Müfettiş); metinler `copy.ts → eloTitles`. */
export function eloLevel(elo: number): 0 | 1 | 2 | 3 | 4 {
  if (elo >= 1300) return 4;
  if (elo >= 1150) return 3;
  if (elo >= 1000) return 2;
  if (elo >= 880) return 1;
  return 0;
}

const ELO_TITLES_TR = ['Çaylak', 'Stajyer Dedektif', 'Dedektif', 'Kıdemli Dedektif', 'Baş Müfettiş'] as const;

export function eloTitle(elo: number): string {
  return ELO_TITLES_TR[eloLevel(elo)];
}

/** Pratikte Elo'ya en yakın zorluktaki öğeyi seç (eşitlikte ilk gelen; deterministik). */
export function pickAdaptive<T extends { difficulty?: unknown }>(items: readonly T[], elo: number): number {
  let best = -1;
  let bestGap = Infinity;
  items.forEach((it, i) => {
    const d = (it.difficulty === 1 || it.difficulty === 3 ? it.difficulty : 2) as 1 | 2 | 3;
    const gap = Math.abs(ITEM_RATING[d] - elo);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return best;
}

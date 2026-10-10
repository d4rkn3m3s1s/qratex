/**
 * Haftalık mini oyun turnuvası — sıralama, öne çıkan oyun ve ödül uygunluğu (saf mantık).
 * Pencere/anahtar hesapları lib/tournament-core.ts'te; DB okuma + claim route'ta.
 *
 * P0-17 / oyun-ekosistemi K4 düzeltmeleri:
 *  1. **Belirli sıralama:** `(bestScore desc, achievedAt asc, userId asc)`. Eşit skorda o
 *     skoru ÖNCE yapan önde; tam eşitlikte deterministik. Eskiden yalnız `_max desc`
 *     vardı → Postgres eşitlerde sıra garanti etmediği için iki kişi kendini 1. görebiliyordu.
 *  2. **Tek öne çıkan oyun:** 20 paralel turnuva (haftada 19.000 puanlık havuz) yerine
 *     haftada TEK ödüllü turnuva; oyun ISO haftasına göre görünür portföyde döner.
 *     Diğer oyunların haftalık sıralaması gösterilir ama ödülsüzdür.
 *  3. **minParticipants:** sıralamaya giren oyuncu sayısı eşiğin altındaysa ödül yok
 *     (rakipsiz 500 puan kapalı).
 */
import { TOURNAMENT_PRIZES, prizeForRank } from '@/lib/tournament-core';

/** Ödüllerin dağıtılması için haftalık sıralamadaki en az oyuncu sayısı. */
export const TOURNAMENT_MIN_PARTICIPANTS = 5;

export interface SessionScoreRow {
  userId: string;
  starsCollected: number;
  completedAt: Date | null;
}

export interface RankedEntry {
  userId: string;
  best: number;
  /** En iyi skora İLK ulaşılan an (eşitlik kırıcı). */
  achievedAt: Date;
}

/** Kullanıcı başına en iyi skor + ona ilk ulaşma anı; belirli sırada. Skor ≤ 0 dışarıda. */
export function rankWeekly(rows: readonly SessionScoreRow[]): RankedEntry[] {
  const best = new Map<string, RankedEntry>();
  for (const r of rows) {
    if (!r.completedAt || r.starsCollected <= 0) continue;
    const cur = best.get(r.userId);
    if (
      !cur ||
      r.starsCollected > cur.best ||
      (r.starsCollected === cur.best && r.completedAt.getTime() < cur.achievedAt.getTime())
    ) {
      best.set(r.userId, { userId: r.userId, best: r.starsCollected, achievedAt: r.completedAt });
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      b.best - a.best ||
      a.achievedAt.getTime() - b.achievedAt.getTime() ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
  );
}

/** "2026-W41" → { year: 2026, week: 41 }; geçersizse null. */
export function parseWeekKey(weekKey: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]) };
}

/**
 * Haftanın öne çıkan oyunu: aday listesinde (registry sırası, gizliler hariç) ISO hafta
 * numarasına göre döner. Aynı hafta için her çağrıda aynı sonuç (claim, haftayı yeniden
 * hesaplar). Aday listesi kod sabitidir — admin aç/kapat rotasyonu kaydırmaz.
 */
export function featuredGameTypeForWeek(weekKey: string, candidates: readonly string[]): string | null {
  if (candidates.length === 0) return null;
  const p = parseWeekKey(weekKey);
  if (!p) return candidates[0];
  const idx = (p.year * 53 + p.week) % candidates.length;
  return candidates[idx];
}

/** Bir sıranın ödülü — katılım eşiği sağlanmadıysa 0. */
export function prizeFor(rank: number, participants: number): number {
  if (participants < TOURNAMENT_MIN_PARTICIPANTS) return 0;
  return prizeForRank(rank);
}

/** Yanıttaki ödül tablosu (öne çıkan değilse ya da eşik altıysa sıfırlar). */
export function prizeTable(active: boolean): Record<1 | 2 | 3, number> {
  return {
    1: active ? TOURNAMENT_PRIZES[1] ?? 0 : 0,
    2: active ? TOURNAMENT_PRIZES[2] ?? 0 : 0,
    3: active ? TOURNAMENT_PRIZES[3] ?? 0 : 0,
  };
}

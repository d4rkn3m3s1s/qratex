/**
 * Haftalık mini-oyun turnuvası çekirdeği (saf mantık). Turnuva "dönemi" ISO haftadır
 * (Pazartesi 00:00 UTC → Pazar 23:59 UTC). Bu hafta oynanan skorlar CANLI sıralamayı;
 * geçen hafta (kapanmış) sıralaması ödülü belirler. Ödül, sıraya göre sabit puandır ve
 * hafta kapandıktan sonra atomik tek-claim ile verilir (TournamentRewardClaim).
 *
 * DB burada YOK — pencere/anahtar/ödül hesabı saf; okuma+claim route'ta.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** İlk 3'e turnuva ödülü (puan). Sıra 1→3; diğerleri ödülsüz. */
export const TOURNAMENT_PRIZES: Record<number, number> = { 1: 500, 2: 300, 3: 150 };

/** Bir sıranın ödülü (yoksa 0). */
export function prizeForRank(rank: number): number {
  return TOURNAMENT_PRIZES[rank] ?? 0;
}

/** Verilen UTC anına ait ISO hafta Pazartesi 00:00:00.000Z başlangıcı. */
export function isoWeekStart(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: 0=Pazar..6=Cumartesi → Pazartesi başlangıç için kaydır.
  const dow = d.getUTCDay();
  const diff = dow === 0 ? 6 : dow - 1; // Pazartesi'ye kadar geri
  return new Date(d.getTime() - diff * DAY_MS);
}

/** Verilen UTC anının bir sonraki hafta başlangıcı (bu haftanın bitişi). */
export function isoWeekEnd(now: Date): Date {
  return new Date(isoWeekStart(now).getTime() + 7 * DAY_MS);
}

/**
 * ISO hafta anahtarı "YYYY-Www" (UTC). ISO 8601: haftanın Perşembesi hangi yıla
 * düşerse hafta o yıla aittir; W01 yılın ilk Perşembesini içeren haftadır.
 */
export function isoWeekKey(now: Date): string {
  const weekStart = isoWeekStart(now);
  // Haftanın Perşembesi (weekStart + 3 gün) → yıl + hafta numarası bu güne göre.
  const thursday = new Date(weekStart.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  // Yılın ilk Perşembesini içeren haftanın Pazartesi'si = W01 başlangıcı.
  const jan4 = new Date(Date.UTC(year, 0, 4)); // 4 Ocak her zaman W01 içindedir
  const w01Start = isoWeekStart(jan4);
  const weekNo = Math.round((weekStart.getTime() - w01Start.getTime()) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

/** Geçen (kapanmış) haftanın anahtarı — ödül bu haftanın sıralamasından verilir. */
export function previousIsoWeekKey(now: Date): string {
  return isoWeekKey(new Date(isoWeekStart(now).getTime() - DAY_MS));
}

/** Bu haftanın bitişine kalan milisaniye (geri sayım için). */
export function msUntilWeekEnd(now: Date): number {
  return Math.max(0, isoWeekEnd(now).getTime() - now.getTime());
}

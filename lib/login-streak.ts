import { prisma } from '@/lib/prisma';
import { mintPoints } from '@/lib/economy';
import { getDefaultPointsMatrix, getPointsMatrix } from '@/lib/points-rules';
import { addDays, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';

/**
 * GÜNLÜK GİRİŞ SERİSİ (login / aktivite streak).
 *
 * Müşteri Ana Sayfası açıldığında `POST /api/customer/streak` ile "dokunulur" ve günde
 * YALNIZCA BİR KEZ ilerler. Kilometre taşlarında (3/7/14/30 gün) tek seferlik puan ödülü verir.
 *
 * Gün sınırı Europe/Istanbul'dur (§4.4 ilke 10). Önceden UTC idi: 00:00–03:00 arası
 * giriş yapan kullanıcı "dünün" günü sayılıyordu.
 *
 * Bu sistem şunlardan TAMAMEN BAĞIMSIZDIR:
 *  - MİNİ OYUN serisi (MiniGameSession / GameStreakClaim, app/api/customer/games/streak).
 *  - UserStreak loyalty tablosu (eski /api/streak ucu kaldırıldı; tabloyu yazan yol yok).
 * Veri, User modelindeki loginStreak* alanlarında tutulur. Kilometre taşları puan matrisinden
 * (`getLoginStreakMilestones`) — yönetici "Seri" ayarını değiştirince ödeme de değişir.
 *
 * Puan ekonomisi değişmezleri (lib/economy README):
 *  - Ödül yalnız `mintPoints` ile (kilit + defter + `points_credited` aynı tx'te).
 *  - Tek-kez: gün ilerlemesi koşullu `updateMany` guard'ı ile; kilometre taşı hem
 *    `claimedMilestones` bayrağı hem defterin `idempotencyKey`'i ile (ömür boyu bir kez).
 */

export type LoginStreakMilestone = { days: number; points: number };

/**
 * Ödüllü kilometre taşları — puan matrisinden (`/admin/economy` → Puan matrisi → Seri) okunur;
 * `getLoginStreakMilestones()` canlı değerleri döner. Bu sabit yalnız matris VARSAYILANIDIR
 * (ayar yokken / okunamazken) ve aynı listeyi `lib/points-rules.ts` tanımlar (tek kaynak).
 */
export const LOGIN_STREAK_MILESTONES: ReadonlyArray<LoginStreakMilestone> = getDefaultPointsMatrix().streak.milestones;

/** Matris satırlarını ödenebilir taşlara indirger: tam sayı gün ≥ 1, puan > 0, gün başına tek, artan. */
export function normalizeLoginStreakMilestones(raw: ReadonlyArray<{ days: unknown; points: unknown }>): LoginStreakMilestone[] {
  const byDay = new Map<number, number>();
  for (const row of raw) {
    const days = Math.floor(Number(row?.days));
    const points = Math.floor(Number(row?.points));
    if (!Number.isFinite(days) || days < 1 || !Number.isFinite(points) || points <= 0) continue;
    if (!byDay.has(days)) byDay.set(days, points);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([days, points]) => ({ days, points }));
}

/**
 * Canlı kilometre taşları (puan matrisi, 60 sn önbellekli). Matris okunamazsa varsayılan —
 * seri ilerlemesi ayar okumasına bağlı olarak düşmez. Ödemeyi yapan `touchLoginStreak`,
 * ekrandaki "sıradaki taş" ve tanıtım sayfası aynı listeyi kullanır.
 */
export async function getLoginStreakMilestones(): Promise<LoginStreakMilestone[]> {
  try {
    const matrix = await getPointsMatrix();
    const list = normalizeLoginStreakMilestones(matrix.streak.milestones);
    return list.length > 0 ? list : [...LOGIN_STREAK_MILESTONES];
  } catch {
    return [...LOGIN_STREAK_MILESTONES];
  }
}

/** "YYYY-MM-DD" (Europe/Istanbul) — serinin gün anahtarı. */
export function loginDayKey(d: Date): string {
  return istanbulDay(d);
}

/** Kilometre taşı ödülünün defter anahtarı (ömür boyu bir kez — claimedMilestones ile aynı anlam). */
export function loginStreakMilestoneKey(userId: string, days: number): string {
  return `streak:login:${userId}:${days}`;
}

/** claimedMilestones JSON'unu güvenli biçimde number[]'a çevir. */
function parseClaimedMilestones(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'number' ? Math.floor(v) : Number.NaN))
    .filter((v) => Number.isFinite(v));
}

export type MilestoneReward = {
  days: number;
  points: number;
};

export type TouchLoginStreakResult = {
  /** Güncel ardışık gün sayısı. */
  streak: number;
  /** Ulaşılan en uzun seri. */
  longest: number;
  /** Bu çağrıda gün ilk kez mi sayıldı (bugün ilk dokunuş)? */
  isNewDay: boolean;
  /** Bu çağrıda YENİ kazanılan kilometre taşı ödülü (varsa; gölge banda 0 kredi olabilir). */
  milestoneReward?: MilestoneReward;
  /** Şu ana dek ödüllenmiş kilometre taşları (idempotent bayrak). */
  claimedMilestones: number[];
};

/** Saf karar: son sayılan güne göre bugünkü seri değeri (test edilir). */
export function nextStreakValue(lastDay: Date | null, currentCount: number, now: Date): { today: string; next: number; alreadyCounted: boolean } {
  const today = loginDayKey(now);
  if (!lastDay) return { today, next: 1, alreadyCounted: false };
  const last = loginDayKey(lastDay);
  if (last === today) return { today, next: currentCount, alreadyCounted: true };
  if (last === addDays(today, -1)) return { today, next: currentCount + 1, alreadyCounted: false };
  return { today, next: 1, alreadyCounted: false };
}

/**
 * Kullanıcının günlük giriş serisini "dokunur":
 *  - Son sayılan gün bugünse (İstanbul): NO-OP, mevcut durumu döner.
 *  - Dünse: streak++ (seri devam). Daha eski / null: streak=1 (seri yeniden başladı).
 *  - Yeni streak ödüllenmemiş bir kilometre taşına TAM eşitse: `mintPoints` + bayrak + bildirim
 *    (aynı tx). Kaçırılan kilometre taşı geri ödenmez.
 *
 * Hata FIRLATIR (çağıran route görünür hata döndürür; "200 + sıfırlar" yasak).
 */
export async function touchLoginStreak(userId: string, now: Date = new Date()): Promise<TouchLoginStreakResult> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      loginStreakCount: true,
      loginStreakLongest: true,
      loginStreakLastDay: true,
      loginStreakClaimedMilestones: true,
    },
  });

  if (!existing) {
    return { streak: 0, longest: 0, isNewDay: false, claimedMilestones: [] };
  }

  const claimedBefore = parseClaimedMilestones(existing.loginStreakClaimedMilestones);
  const decision = nextStreakValue(existing.loginStreakLastDay, existing.loginStreakCount, now);

  if (decision.alreadyCounted) {
    return {
      streak: existing.loginStreakCount,
      longest: existing.loginStreakLongest,
      isNewDay: false,
      claimedMilestones: claimedBefore,
    };
  }

  const nextStreak = decision.next;
  const nextLongest = Math.max(existing.loginStreakLongest, nextStreak);
  const todayStart = istanbulDayStart(decision.today);
  const milestones = await getLoginStreakMilestones();
  const milestone = milestones.find((m) => m.days === nextStreak && !claimedBefore.includes(m.days));

  const result = await prisma.$transaction(async (tx) => {
    // ATOMİK gün guard'ı: yalnızca son gün bugünden (İstanbul) ÖNCE ya da null iken ilerlet.
    // İki eşzamanlı dokunuştan yalnızca biri count=1 alır → ödül tek kez.
    const guard = await tx.user.updateMany({
      where: {
        id: userId,
        OR: [{ loginStreakLastDay: null }, { loginStreakLastDay: { lt: todayStart } }],
      },
      data: {
        loginStreakCount: nextStreak,
        loginStreakLongest: nextLongest,
        loginStreakLastDay: now,
      },
    });

    if (guard.count === 0) {
      return { isNewDay: false as const, milestoneReward: undefined };
    }

    if (!milestone) return { isNewDay: true as const, milestoneReward: undefined };

    const minted = await mintPoints(tx, {
      userId,
      points: milestone.points,
      source: 'streak',
      sourceId: `login:${milestone.days}`,
      idempotencyKey: loginStreakMilestoneKey(userId, milestone.days),
      reason: `${milestone.days} günlük giriş serisi`,
      meta: { kind: 'login_streak', milestone: milestone.days },
      now,
    });

    const nextClaimed = Array.from(new Set([...claimedBefore, milestone.days])).sort((a, b) => a - b);
    await tx.user.update({
      where: { id: userId },
      data: { loginStreakClaimedMilestones: nextClaimed },
    });

    if (!minted.duplicate && minted.credited > 0) {
      await tx.notification.create({
        data: {
          userId,
          type: 'success',
          title: `🔥 ${milestone.days} günlük serin!`,
          message: `Harika! ${milestone.days} gün üst üste geldin ve +${minted.credited} puan kazandın.`,
          data: { kind: 'login_streak_milestone', days: milestone.days, points: minted.credited },
        },
      });
    }

    return {
      isNewDay: true as const,
      milestoneReward: minted.duplicate ? undefined : { days: milestone.days, points: minted.credited },
    };
  });

  if (!result.isNewDay) {
    // Yarışı kaybettik → güncel durumu yeniden oku.
    const fresh = await prisma.user.findUnique({
      where: { id: userId },
      select: { loginStreakCount: true, loginStreakLongest: true, loginStreakClaimedMilestones: true },
    });
    return {
      streak: fresh?.loginStreakCount ?? existing.loginStreakCount,
      longest: fresh?.loginStreakLongest ?? existing.loginStreakLongest,
      isNewDay: false,
      claimedMilestones: parseClaimedMilestones(fresh?.loginStreakClaimedMilestones),
    };
  }

  const claimedAfter = milestone
    ? Array.from(new Set([...claimedBefore, milestone.days])).sort((a, b) => a - b)
    : claimedBefore;

  return {
    streak: nextStreak,
    longest: nextLongest,
    isNewDay: true,
    milestoneReward: result.milestoneReward,
    claimedMilestones: claimedAfter,
  };
}

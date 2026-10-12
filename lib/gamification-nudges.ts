/**
 * Oyunlaştırma dürtmeleri — retention döngüsünün "tetik" halkası (oyunlaştırma-ekonomi D3).
 *
 * Önceki durum: hatırlatma işi yalnız "uzun süredir yorum yok" ve "puan verdin ama yorum boş"
 * dürtmelerini yapıyordu; seri kırılmak üzereyken ya da yöneticinin gönderdiği sürpriz kutu
 * günlerce açılmadan dururken müşteriye hiçbir şey söylenmiyordu.
 *
 * Bu modül (günlük işte, İstanbul 06:00 — `vercel.json` 03:00 UTC):
 *  - SERİ TEHLİKEDE: giriş serisi ≥ 2 gün olan ve son sayılan günü DÜN (İstanbul) olan müşteriye
 *    "bugün uğra, serin kopmasın" + sıradaki kilometre taşı ödülü (puan matrisinden; ödeyen kodla
 *    aynı liste). Kullanıcı başına günde en fazla bir.
 *  - AÇILMAMIŞ KUTU: yöneticinin gönderdiği (günlük otomatik kutu değil) ve 24 saattir açılmamış
 *    sürpriz kutu için kutu başına BİR kez hatırlatma (14 günden eski kutular dürtülmez).
 *
 * Kurallar: "Hatırlatmalar" bildirim tercihi (uygulama içi kanal) kapalıysa gönderilmez; askıdaki,
 * anonimleştirilmiş ve demo hesaplar hariç; tüm sorgular küme bazlı (kullanıcı başına sorgu yok),
 * imleçle sayfalı (ilk 1000 ile sınırlı değil); tekilleştirme `data.kind` + gün/kutu anahtarıyla
 * aynı koşuda ve tekrar koşuda çift bildirim üretmez. Puan BASMAZ — yalnız bildirim yazar.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isChannelEnabled } from '@/lib/notification-prefs';
import { addDays, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import { getLoginStreakMilestones, type LoginStreakMilestone } from '@/lib/login-streak';

const REMINDER_GROUP = 'reminder';
const PAGE = 500;
export const STREAK_RISK_MIN_DAYS = 2;
export const BOX_NUDGE_AFTER_HOURS = 24;
export const BOX_NUDGE_MAX_AGE_DAYS = 14;

export const STREAK_RISK_KIND = 'reminder-streak-risk';
export const BOX_NUDGE_KIND = 'reminder-surprise-box';

const ELIGIBLE_CUSTOMER: Prisma.UserWhereInput = {
  role: 'CUSTOMER',
  suspendedAt: null,
  anonymizedAt: null,
  isDemo: false,
};

type Db = typeof prisma;

/** Saf: serisi `current` gün olan kullanıcı için sıradaki ödüllü taş (alınmamış). */
export function nextMilestoneFor(
  current: number,
  claimed: readonly number[],
  milestones: readonly LoginStreakMilestone[]
): LoginStreakMilestone | null {
  return milestones.find((m) => m.days > current && !claimed.includes(m.days)) ?? null;
}

/** Saf: seri tehlikede bildirim metni. */
export function streakRiskMessage(current: number, next: LoginStreakMilestone | null): { title: string; message: string } {
  const title = `🔥 ${current} günlük serin bugün kopmasın`;
  if (!next) {
    return { title, message: 'Bugün uygulamaya uğrarsan serin devam eder. Gün bitince seri sıfırlanır.' };
  }
  const left = next.days - current;
  return {
    title,
    message:
      left === 1
        ? `Bugün uğrarsan ${next.days}. güne ulaşır ve +${next.points.toLocaleString('tr-TR')} puan kazanırsın.`
        : `Bugün uğrarsan serin devam eder; ${left} gün sonra ${next.days}. günde +${next.points.toLocaleString('tr-TR')} puan seni bekliyor.`,
  };
}

function claimedOf(value: unknown): number[] {
  return Array.isArray(value) ? value.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
}

/** Bugün (İstanbul) bu türde bildirimi zaten almış kullanıcılar. */
async function alreadyNudged(db: Db, userIds: string[], kind: string, since: Date): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.notification.findMany({
    where: { userId: { in: userIds }, createdAt: { gte: since }, data: { path: ['kind'], equals: kind } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

export async function runStreakRiskNudges(db: Db = prisma, now: Date = new Date()): Promise<{ checked: number; sent: number }> {
  const today = istanbulDay(now);
  const todayStart = istanbulDayStart(today);
  const yesterdayStart = istanbulDayStart(addDays(today, -1));
  const milestones = await getLoginStreakMilestones();

  let cursor: string | undefined;
  let checked = 0;
  let sent = 0;
  for (;;) {
    const users = await db.user.findMany({
      where: {
        ...ELIGIBLE_CUSTOMER,
        loginStreakCount: { gte: STREAK_RISK_MIN_DAYS },
        loginStreakLastDay: { gte: yesterdayStart, lt: todayStart },
      },
      select: { id: true, loginStreakCount: true, loginStreakClaimedMilestones: true, notificationPrefs: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1].id;
    checked += users.length;

    const eligible = users.filter((u) => isChannelEnabled(u.notificationPrefs, REMINDER_GROUP, 'app'));
    const done = await alreadyNudged(db, eligible.map((u) => u.id), STREAK_RISK_KIND, todayStart);
    const data: Prisma.NotificationCreateManyInput[] = [];
    for (const u of eligible) {
      if (done.has(u.id)) continue;
      const next = nextMilestoneFor(u.loginStreakCount, claimedOf(u.loginStreakClaimedMilestones), milestones);
      const { title, message } = streakRiskMessage(u.loginStreakCount, next);
      data.push({
        userId: u.id,
        type: 'info',
        title,
        message,
        data: {
          kind: STREAK_RISK_KIND,
          module: 'customer_reminder',
          nudgeType: `streak_risk:${today}`,
          day: today,
          streak: u.loginStreakCount,
          ...(next ? { nextMilestone: { days: next.days, points: next.points } } : {}),
          ctaPath: '/customer',
        },
      });
    }
    if (data.length) {
      const r = await db.notification.createMany({ data });
      sent += r.count;
    }
    if (users.length < PAGE) break;
  }
  return { checked, sent };
}

export async function runSurpriseBoxNudges(db: Db = prisma, now: Date = new Date()): Promise<{ checked: number; sent: number }> {
  const openBefore = new Date(now.getTime() - BOX_NUDGE_AFTER_HOURS * 3_600_000);
  const notOlderThan = new Date(now.getTime() - BOX_NUDGE_MAX_AGE_DAYS * 86_400_000);

  let cursor: string | undefined;
  let checked = 0;
  let sent = 0;
  for (;;) {
    const boxes = await db.userSurpriseBox.findMany({
      where: {
        openedAt: null,
        withdrawnAt: null,
        dayKey: null, // yalnız yöneticinin gönderdiği kutular (günlük otomatik kutu değil)
        createdAt: { lt: openBefore, gte: notOlderThan },
        user: ELIGIBLE_CUSTOMER,
      },
      select: { id: true, userId: true, title: true, user: { select: { notificationPrefs: true } } },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (boxes.length === 0) break;
    cursor = boxes[boxes.length - 1].id;
    checked += boxes.length;

    const eligible = boxes.filter((b) => isChannelEnabled(b.user.notificationPrefs, REMINDER_GROUP, 'app'));
    const prior = eligible.length
      ? await db.notification.findMany({
          where: {
            userId: { in: [...new Set(eligible.map((b) => b.userId))] },
            createdAt: { gte: notOlderThan },
            data: { path: ['kind'], equals: BOX_NUDGE_KIND },
          },
          select: { data: true },
        })
      : [];
    const nudgedBoxes = new Set(
      prior.map((n) => (n.data as { boxId?: unknown } | null)?.boxId).filter((v): v is string => typeof v === 'string')
    );
    const data: Prisma.NotificationCreateManyInput[] = eligible
      .filter((b) => !nudgedBoxes.has(b.id))
      .map((b) => ({
        userId: b.userId,
        type: 'info',
        title: '🎁 Açılmamış bir sürpriz kutun var',
        message: `"${b.title}" kutun seni bekliyor. Cüzdan → Ödüllerim → Kutularım'dan açabilirsin.`,
        data: {
          kind: BOX_NUDGE_KIND,
          module: 'customer_reminder',
          nudgeType: `surprise_box:${b.id}`,
          boxId: b.id,
          ctaPath: '/customer/wallet/owned?tab=boxes',
        },
      }));
    if (data.length) {
      const r = await db.notification.createMany({ data });
      sent += r.count;
    }
    if (boxes.length < PAGE) break;
  }
  return { checked, sent };
}

/** Günlük iş girişi: iki dürtme bağımsız (biri düşerse diğeri yine çalışır, hata yukarı taşınır). */
export async function runGamificationNudges(now: Date = new Date()): Promise<{
  streakRisk: { checked: number; sent: number };
  surpriseBox: { checked: number; sent: number };
  errors: string[];
}> {
  const errors: string[] = [];
  const empty = { checked: 0, sent: 0 };
  const [streakRisk, surpriseBox] = await Promise.all([
    runStreakRiskNudges(prisma, now).catch((e: unknown) => {
      console.error('[gamification-nudges] seri dürtmesi başarısız', e);
      errors.push('streak_risk');
      return empty;
    }),
    runSurpriseBoxNudges(prisma, now).catch((e: unknown) => {
      console.error('[gamification-nudges] kutu dürtmesi başarısız', e);
      errors.push('surprise_box');
      return empty;
    }),
  ]);
  return { streakRisk, surpriseBox, errors };
}

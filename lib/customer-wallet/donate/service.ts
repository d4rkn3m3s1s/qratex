/**
 * Bağış (Cüzdan → Bağış) — sunucu servisi.
 *
 * Denetim (docs/audit/2026-10-08/musteri/customer_donations.md) kapanışları:
 *  - B3: gerçek sıra + "bir üst sıraya X puan" (ilk 10 dışında da).
 *  - B4: kişisel etki katalog filtresinden BAĞIMSIZ; pasif/arşivli projelere yapılan bağışlar da sayılır.
 *  - B5: hedef, başlangıç/bitiş, aktiflik ve arşiv TEK koşullu UPDATE ile transaction içinde
 *        (yarış yok; aşırı fonlama yok; süresi geçmiş projeye bağış yok).
 *  - B9: herkese açık görünümde ad maskeli ("Ayşe Y."), fotoğraf yok, başka kullanıcının
 *        `userId`'si istemciye gitmez (`isMe` sunucuda); görünürlük varsayılanı son tercihten.
 *  - B11: bağımsız sorgular paralel; topluluk verisi kısa TTL'li önbellekte, bağışta sürümlenir.
 *  - #53/#57: puan düşümü `debitPoints(source: 'donation', idempotencyKey)` → PointsLedger
 *        satırı = makbuz; aynı istek anahtarıyla ikinci gönderim ikinci kez düşmez.
 */
import { Prisma } from '@prisma/client';
import type { prisma as prismaClient } from '@/lib/prisma';
import { debitPoints, InsufficientPointsError } from '@/lib/economy';
import { ApiError } from '@/lib/http/define-route';
import { publicDisplayName } from '@/lib/http/dto';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { decodeCursor, encodeCursor } from '../cursor';
import { impactValue, normalizeCategory, parseImpact, parseTags, projectProgress, type ImpactRule, type KnownCategory, type ProjectProgress } from './impact';

type Db = typeof prismaClient;

export const DONATION_MAX_POINTS = 100_000;
export const DONATION_MESSAGE_MAX = 280;

export type DonationProjectDto = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: KnownCategory | 'other';
  rawCategory: string;
  goal: number;
  current: number;
  progress: ProjectProgress;
  impact: ImpactRule | null;
  tags: string[];
  featured: boolean;
  startDate: string;
  endDate: string | null;
  donationCount: number;
  myDonation: number;
};

export type MyImpact = {
  projectId: string;
  name: string;
  icon: string;
  category: KnownCategory | 'other';
  points: number;
  impact: { value: number; unit: string; label: string } | null;
  /** Proje artık bağış almıyor (kapandı/arşivlendi/süresi doldu) — geçmiş yine görünür. */
  closed: boolean;
};

export type DonorStanding = {
  /** Herkese açık toplam (sıralamaya giren). */
  publicTotal: number;
  rank: number | null;
  donors: number;
  /** Bir üst sıraya geçmek için gereken puan (zaten 1. ise null). */
  gapToNext: number | null;
};

export type DonateOverview = {
  balance: number;
  projects: DonationProjectDto[];
  me: {
    totalDonated: number;
    donationCount: number;
    projectsSupported: number;
    impacts: MyImpact[];
    standing: DonorStanding;
    /** Görünürlük varsayılanı: son bağıştaki tercih (hiç yoksa kapalı — gizlilik önce). */
    defaultPublic: boolean;
  };
  platform: { totalDonated: number; donors: number };
  recommendedProjectId: string | null;
};

const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  icon: true,
  category: true,
  goal: true,
  current: true,
  impact: true,
  tags: true,
  isActive: true,
  isFeatured: true,
  archivedAt: true,
  startDate: true,
  endDate: true,
} satisfies Prisma.DonationProjectSelect;

type ProjectRow = Prisma.DonationProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

export function isProjectOpen(p: Pick<ProjectRow, 'isActive' | 'archivedAt' | 'startDate' | 'endDate'>, now: Date): boolean {
  if (!p.isActive || p.archivedAt) return false;
  if (p.startDate && p.startDate.getTime() > now.getTime()) return false;
  if (p.endDate && p.endDate.getTime() <= now.getTime()) return false;
  return true;
}

function toProjectDto(p: ProjectRow, donationCount: number, myDonation: number): DonationProjectDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    icon: p.icon,
    category: normalizeCategory(p.category),
    rawCategory: p.category,
    goal: p.goal,
    current: p.current,
    progress: projectProgress(p.current, p.goal),
    impact: parseImpact(p.impact),
    tags: parseTags(p.tags),
    featured: p.isFeatured,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate ? p.endDate.toISOString() : null,
    donationCount,
    myDonation,
  };
}

type StandingRow = { mine: number | bigint | null; ahead: number | bigint | null; next_total: number | bigint | null; donors: number | bigint | null };

export async function getDonorStanding(db: Pick<Db, '$queryRaw'>, userId: string): Promise<DonorStanding> {
  const rows = await db.$queryRaw<StandingRow[]>(Prisma.sql`
    WITH totals AS (
      SELECT "userId", SUM("points")::bigint AS total
        FROM "Donation"
       WHERE "isPublic" = true
       GROUP BY "userId"
    ),
    me AS (SELECT COALESCE((SELECT total FROM totals WHERE "userId" = ${userId}), 0)::bigint AS total)
    SELECT (SELECT total FROM totals WHERE "userId" = ${userId}) AS mine,
           (SELECT COUNT(*) FROM totals, me WHERE totals.total > me.total)::bigint AS ahead,
           (SELECT MIN(totals.total) FROM totals, me WHERE totals.total > me.total)::bigint AS next_total,
           (SELECT COUNT(*) FROM totals)::bigint AS donors
  `);
  const r = rows[0];
  const mine = Number(r?.mine ?? 0);
  const nextTotal = r?.next_total == null ? null : Number(r.next_total);
  return {
    publicTotal: mine,
    rank: mine > 0 ? Number(r?.ahead ?? 0) + 1 : null,
    donors: Number(r?.donors ?? 0),
    gapToNext: mine > 0 && nextTotal != null ? nextTotal - mine + 1 : null,
  };
}

/** Önerilen proje: en çok bağış yaptığın kategoride (yoksa herhangi) hedefe en yakın açık proje. */
export function pickRecommended(projects: DonationProjectDto[], favouriteCategory: string | null): string | null {
  const open = projects.filter((p) => !p.progress.completed);
  if (open.length === 0) return null;
  const pool = favouriteCategory ? open.filter((p) => p.rawCategory === favouriteCategory) : [];
  const candidates = pool.length > 0 ? pool : open;
  const ranked = [...candidates].sort((a, b) => {
    const pa = a.progress.percent ?? -1;
    const pb = b.progress.percent ?? -1;
    if (pb !== pa) return pb - pa;
    return Number(b.featured) - Number(a.featured);
  });
  return ranked[0]?.id ?? null;
}

export async function getDonateOverview(db: Db, userId: string, now: Date = new Date()): Promise<DonateOverview> {
  const [user, projectsRaw, myByProject, myAgg, lastDonation, perProjectCount, platformAgg, donorCountRows, standing] =
    await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { points: true } }),
      db.donationProject.findMany({
        where: {
          isActive: true,
          archivedAt: null,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gt: now } }],
        },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        take: 150,
        select: PROJECT_SELECT,
      }),
      db.donation.groupBy({ by: ['projectId'], where: { userId }, _sum: { points: true } }),
      db.donation.aggregate({ where: { userId }, _sum: { points: true }, _count: { _all: true } }),
      db.donation.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { isPublic: true } }),
      db.donation.groupBy({ by: ['projectId'], _count: { _all: true } }),
      db.donation.aggregate({ _sum: { points: true } }),
      db.$queryRaw<Array<{ n: number | bigint }>>(Prisma.sql`SELECT COUNT(DISTINCT "userId")::bigint AS n FROM "Donation"`),
      getDonorStanding(db, userId),
    ]);

  const mine = new Map(myByProject.map((r) => [r.projectId, r._sum.points ?? 0]));
  const counts = new Map(perProjectCount.map((r) => [r.projectId, r._count._all ?? 0]));
  const projects = projectsRaw.map((p) => toProjectDto(p, counts.get(p.id) ?? 0, mine.get(p.id) ?? 0));

  // Kişisel etki: katalogdan BAĞIMSIZ (kapanmış/arşivli projeler de) — B4.
  const myProjectIds = [...mine.keys()];
  const myProjects =
    myProjectIds.length > 0
      ? await db.donationProject.findMany({ where: { id: { in: myProjectIds } }, select: PROJECT_SELECT })
      : [];
  const impacts: MyImpact[] = myProjects
    .map((p) => {
      const points = mine.get(p.id) ?? 0;
      const rule = parseImpact(p.impact);
      const value = impactValue(points, rule);
      return {
        projectId: p.id,
        name: p.name,
        icon: p.icon,
        category: normalizeCategory(p.category),
        points,
        impact: rule && value != null ? { value, unit: rule.unit, label: rule.label } : null,
        closed: !isProjectOpen(p, now),
      };
    })
    .filter((i) => i.points > 0)
    .sort((a, b) => b.points - a.points);

  const categoryTotals = new Map<string, number>();
  for (const p of myProjects) categoryTotals.set(p.category, (categoryTotals.get(p.category) ?? 0) + (mine.get(p.id) ?? 0));
  const favourite = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    balance: Math.max(0, user?.points ?? 0),
    projects,
    me: {
      totalDonated: myAgg._sum.points ?? 0,
      donationCount: myAgg._count._all ?? 0,
      projectsSupported: impacts.length,
      impacts,
      standing,
      defaultPublic: lastDonation?.isPublic ?? false,
    },
    platform: { totalDonated: platformAgg._sum.points ?? 0, donors: Number(donorCountRows[0]?.n ?? 0) },
    recommendedProjectId: pickRecommended(projects, favourite),
  };
}

// ───────────────────────────── Topluluk ─────────────────────────────

export type CommunityDonor = { rank: number; name: string | null; level: number; total: number; isMe: boolean };
export type CommunityActivity = { id: string; name: string | null; projectName: string; projectIcon: string; points: number; at: string; isMe: boolean };
export type DonationCommunity = {
  leaderboard: CommunityDonor[];
  feed: CommunityActivity[];
  me: DonorStanding;
  generatedAt: string;
};

type CachedCommunity = {
  leaderboard: Array<Omit<CommunityDonor, 'isMe'> & { uid: string }>;
  feed: Array<Omit<CommunityActivity, 'isMe'> & { uid: string }>;
  generatedAt: string;
};

const COMMUNITY_VERSION_KEY = 'donations:community:ver';
const COMMUNITY_TTL_S = 60;

async function loadCommunity(db: Db): Promise<CachedCommunity> {
  const [top, recent] = await Promise.all([
    db.donation.groupBy({
      by: ['userId'],
      where: { isPublic: true },
      _sum: { points: true },
      orderBy: { _sum: { points: 'desc' } },
      take: 10,
    }),
    db.donation.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        userId: true,
        points: true,
        createdAt: true,
        user: { select: { name: true } },
        project: { select: { name: true, icon: true } },
      },
    }),
  ]);
  const users = top.length
    ? await db.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, name: true, level: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    leaderboard: top.map((t, i) => {
      const u = byId.get(t.userId);
      return {
        uid: t.userId,
        rank: i + 1,
        name: u?.name ? publicDisplayName(u.name) : null,
        level: u?.level ?? 1,
        total: t._sum.points ?? 0,
      };
    }),
    feed: recent.map((d) => ({
      uid: d.userId,
      id: d.id,
      name: d.user?.name ? publicDisplayName(d.user.name) : null,
      projectName: d.project.name,
      projectIcon: d.project.icon,
      points: d.points,
      at: d.createdAt.toISOString(),
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function getDonationCommunity(db: Db, userId: string): Promise<DonationCommunity> {
  const version = (await redisGetJson<number>(COMMUNITY_VERSION_KEY)) ?? 0;
  const key = `donations:community:${version}`;
  const [standing, data] = await Promise.all([
    getDonorStanding(db, userId),
    (async (): Promise<CachedCommunity> => {
      const cached = await redisGetJson<CachedCommunity>(key);
      if (cached) return cached;
      const fresh = await loadCommunity(db);
      await redisSetJson(key, fresh, COMMUNITY_TTL_S);
      return fresh;
    })(),
  ]);
  return {
    leaderboard: data.leaderboard.map(({ uid, ...rest }) => ({ ...rest, isMe: uid === userId })),
    feed: data.feed.map(({ uid, ...rest }) => ({ ...rest, isMe: uid === userId })),
    me: standing,
    generatedAt: data.generatedAt,
  };
}

/** Bağış sonrası topluluk önbelleğini sürümle (eski anahtar TTL ile kendiliğinden düşer). */
export async function bumpCommunityVersion(): Promise<void> {
  await redisSetJson(COMMUNITY_VERSION_KEY, Date.now(), 7 * 24 * 3600);
}

// ───────────────────────────── Bağış geçmişi / makbuz ─────────────────────────────

export type DonationReceipt = {
  id: string;
  receiptNo: string;
  at: string;
  points: number;
  message: string | null;
  isPublic: boolean;
  project: { id: string; name: string; icon: string; category: KnownCategory | 'other' };
  impact: { value: number; unit: string; label: string } | null;
  /** Puan defteri satırı (yalnız defterli bağışlarda). */
  ledgerEntryId: string | null;
  balanceAfter: number | null;
};

export function receiptNumber(donationId: string): string {
  return `QX-B-${donationId.slice(-8).toUpperCase()}`;
}

const DONATION_SELECT = {
  id: true,
  points: true,
  message: true,
  isPublic: true,
  createdAt: true,
  project: { select: { id: true, name: true, icon: true, category: true, impact: true } },
} satisfies Prisma.DonationSelect;

type DonationRow = Prisma.DonationGetPayload<{ select: typeof DONATION_SELECT }>;

function toReceipt(d: DonationRow, ledger: { id: string; balanceAfter: number | null } | undefined): DonationReceipt {
  const rule = parseImpact(d.project.impact);
  const value = impactValue(d.points, rule);
  return {
    id: d.id,
    receiptNo: receiptNumber(d.id),
    at: d.createdAt.toISOString(),
    points: d.points,
    message: d.message?.trim() || null,
    isPublic: d.isPublic,
    project: { id: d.project.id, name: d.project.name, icon: d.project.icon, category: normalizeCategory(d.project.category) },
    impact: rule && value != null ? { value, unit: rule.unit, label: rule.label } : null,
    ledgerEntryId: ledger ? `l_${ledger.id}` : null,
    balanceAfter: ledger?.balanceAfter ?? null,
  };
}

async function ledgerFor(db: Pick<Db, 'pointsLedger'>, userId: string, donationIds: string[]) {
  if (donationIds.length === 0) return new Map<string, { id: string; balanceAfter: number | null }>();
  const rows = await db.pointsLedger.findMany({
    where: { userId, source: 'donation', sourceId: { in: donationIds } },
    select: { id: true, sourceId: true, balanceAfter: true },
  });
  return new Map(rows.filter((r) => r.sourceId).map((r) => [r.sourceId as string, { id: r.id, balanceAfter: r.balanceAfter }]));
}

export const HISTORY_PAGE_SIZE = 20;

export async function getDonationHistory(
  db: Db,
  userId: string,
  cursorRaw?: string | null,
  limit = HISTORY_PAGE_SIZE,
): Promise<{ items: DonationReceipt[]; nextCursor: string | null }> {
  const cursor = decodeCursor(cursorRaw);
  const take = Math.min(50, Math.max(1, Math.floor(limit)));
  const rows = await db.donation.findMany({
    where: {
      userId,
      ...(cursor
        ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    select: DONATION_SELECT,
  });
  const page = rows.slice(0, take);
  const ledger = await ledgerFor(db, userId, page.map((d) => d.id));
  const last = page[page.length - 1];
  return {
    items: page.map((d) => toReceipt(d, ledger.get(d.id))),
    nextCursor: rows.length > take && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export async function getDonationReceipt(db: Db, userId: string, donationId: string): Promise<DonationReceipt | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(donationId)) return null;
  const row = await db.donation.findFirst({ where: { id: donationId, userId }, select: DONATION_SELECT });
  if (!row) return null;
  const ledger = await ledgerFor(db, userId, [row.id]);
  return toReceipt(row, ledger.get(row.id));
}

// ───────────────────────────── Bağış yap ─────────────────────────────

export type MakeDonationInput = {
  userId: string;
  projectId: string;
  points: number;
  message?: string | null;
  isPublic: boolean;
  /** İstemcinin ürettiği tek-kez anahtarı (çift dokunuş / yeniden gönderim → tek bağış). */
  requestKey: string;
  now?: Date;
};

export type MakeDonationResult = {
  receipt: DonationReceipt;
  balance: number;
  project: { id: string; current: number; goal: number; progress: ProjectProgress };
  /** Bu bağış hedefi tamamladı. */
  goalReached: boolean;
  duplicate: boolean;
};

const NOTIFY_COPY = {
  tr: (name: string, points: string) => ({
    title: 'Bağışın ulaştı',
    message: `${name} projesine ${points} puan bağışladın. Teşekkürler!`,
  }),
  en: (name: string, points: string) => ({
    title: 'Your donation arrived',
    message: `You donated ${points} points to ${name}. Thank you!`,
  }),
};

/**
 * Bağış — tek transaction:
 *  1. Tek-kez: anahtar defterde varsa önceki bağışı döndür (ikinci düşüm yok).
 *  2. Koşullu proje artışı (aktif, arşivsiz, tarih penceresinde, hedefi aşmıyor) — satır kilidiyle.
 *  3. Bağış satırı.
 *  4. `debitPoints(source:'donation')` — eksi bakiye imkânsız; yetersizse her şey geri alınır.
 *  5. Bildirim (kullanıcının dilinde).
 */
export async function makeDonation(db: Db, input: MakeDonationInput): Promise<MakeDonationResult> {
  const now = input.now ?? new Date();
  const points = Math.floor(input.points);
  if (!Number.isFinite(points) || points < 1 || points > DONATION_MAX_POINTS) {
    throw new ApiError('VALIDATION', 'Bağış tutarı geçersiz.');
  }
  const idempotencyKey = `donation:${input.userId}:${input.requestKey}`;
  const message = input.message?.trim() ? input.message.trim().slice(0, DONATION_MESSAGE_MAX) : null;

  return db.$transaction(async (tx) => {
    const existing = await tx.pointsLedger.findUnique({
      where: { idempotencyKey },
      select: { userId: true, sourceId: true, balanceAfter: true },
    });
    if (existing) {
      if (existing.userId !== input.userId || !existing.sourceId) throw new ApiError('CONFLICT');
      const prior = await tx.donation.findFirst({ where: { id: existing.sourceId, userId: input.userId }, select: DONATION_SELECT });
      if (!prior) throw new ApiError('CONFLICT');
      const proj = await tx.donationProject.findUnique({ where: { id: prior.project.id }, select: { id: true, current: true, goal: true } });
      const ledger = await ledgerFor(tx as unknown as Db, input.userId, [prior.id]);
      const wallet = await tx.user.findUnique({ where: { id: input.userId }, select: { points: true } });
      return {
        receipt: toReceipt(prior, ledger.get(prior.id)),
        balance: wallet?.points ?? 0,
        project: {
          id: prior.project.id,
          current: proj?.current ?? 0,
          goal: proj?.goal ?? 0,
          progress: projectProgress(proj?.current ?? 0, proj?.goal ?? 0),
        },
        goalReached: false,
        duplicate: true,
      };
    }

    const project = await tx.donationProject.findUnique({ where: { id: input.projectId }, select: PROJECT_SELECT });
    if (!project) throw new ApiError('NOT_FOUND', 'Proje bulunamadı.');
    if (!isProjectOpen(project, now)) {
      throw new ApiError('PROJECT_CLOSED', 'Bu proje şu an bağış kabul etmiyor.', { status: 409 });
    }

    // Koşullu artış: kontrol ve yazma tek ifadede (eşzamanlı bağış / admin kapatması yarışı yok).
    const updated = await tx.$queryRaw<Array<{ current: number; goal: number }>>(Prisma.sql`
      UPDATE "DonationProject"
         SET "current" = "current" + ${points}, "updatedAt" = ${now}
       WHERE "id" = ${project.id}
         AND "isActive" = true
         AND "archivedAt" IS NULL
         AND "startDate" <= ${now}
         AND ("endDate" IS NULL OR "endDate" > ${now})
         AND ("goal" <= 0 OR "current" + ${points} <= "goal")
      RETURNING "current", "goal"
    `);
    if (updated.length === 0) {
      const fresh = await tx.donationProject.findUnique({ where: { id: project.id }, select: PROJECT_SELECT });
      if (!fresh || !isProjectOpen(fresh, now)) {
        throw new ApiError('PROJECT_CLOSED', 'Bu proje şu an bağış kabul etmiyor.', { status: 409 });
      }
      const progress = projectProgress(fresh.current, fresh.goal);
      if (progress.completed) {
        throw new ApiError('GOAL_REACHED', 'Bu projenin hedefi tamamlandı.', { status: 409, details: { remaining: 0 } });
      }
      throw new ApiError('GOAL_EXCEEDED', `Hedefe ${progress.remaining ?? 0} puan kaldı; en fazla bu kadar bağışlayabilirsin.`, {
        status: 409,
        details: { remaining: progress.remaining ?? 0 },
      });
    }
    const after = updated[0] as { current: number; goal: number };

    const donation = await tx.donation.create({
      data: { userId: input.userId, projectId: project.id, points, message, isPublic: input.isPublic },
      select: DONATION_SELECT,
    });

    let wallet;
    try {
      wallet = await debitPoints(tx, {
        userId: input.userId,
        points,
        source: 'donation',
        sourceId: donation.id,
        idempotencyKey,
        reason: `Bağış: ${project.name}`.slice(0, 200),
        meta: { projectId: project.id },
      });
    } catch (e) {
      if (e instanceof InsufficientPointsError) {
        throw new ApiError('INSUFFICIENT_POINTS', undefined, { details: { balance: e.currentPoints, required: e.requiredPoints } });
      }
      throw e;
    }

    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { preferredLanguage: true } });
    const lang = user?.preferredLanguage === 'en' ? 'en' : 'tr';
    const copy = NOTIFY_COPY[lang](project.name, new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'tr-TR').format(points));
    await tx.notification.create({
      data: {
        userId: input.userId,
        title: copy.title,
        message: copy.message,
        type: 'success',
        data: { kind: 'donation', donationId: donation.id, projectId: project.id, points, href: `/customer/wallet/donate?tab=history&receipt=${donation.id}` },
      },
    });

    const progress = projectProgress(after.current, after.goal);
    const before = projectProgress(after.current - points, after.goal);
    return {
      receipt: toReceipt(donation, wallet.ledgerId ? { id: wallet.ledgerId, balanceAfter: wallet.points } : undefined),
      balance: wallet.points,
      project: { id: project.id, current: after.current, goal: after.goal, progress },
      goalReached: progress.completed && !before.completed,
      duplicate: false,
    };
  });
}

/**
 * Hedef tamamlandığında katkı veren herkese (bağışı yapan hariç) tek seferlik bildirim.
 * Yanıt sonrası çalışır; hata bağışı etkilemez.
 */
export async function notifyGoalReached(db: Db, projectId: string, exceptUserId: string): Promise<number> {
  const project = await db.donationProject.findUnique({ where: { id: projectId }, select: { name: true } });
  if (!project) return 0;
  const donors = await db.donation.findMany({
    where: { projectId, userId: { not: exceptUserId } },
    distinct: ['userId'],
    select: { userId: true, user: { select: { preferredLanguage: true } } },
    take: 1000,
  });
  if (donors.length === 0) return 0;
  const res = await db.notification.createMany({
    data: donors.map((d) => {
      const en = d.user?.preferredLanguage === 'en';
      return {
        userId: d.userId,
        title: en ? 'Goal reached together' : 'Hedefe birlikte ulaştık',
        message: en
          ? `${project.name} reached its goal. Your contribution made it happen.`
          : `${project.name} hedefine ulaştı. Senin katkınla oldu.`,
        type: 'success',
        data: { kind: 'donation_goal', projectId, href: '/customer/wallet/donate?tab=history' },
      };
    }),
  });
  return res.count;
}

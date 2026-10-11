/**
 * Kullanıcı 360 — özet ve sekme verileri (sunucu, salt okuma; GET'te LLM yok).
 *
 * Kapanan bulgular: seviye ilerlemesi kanonik geometrik formülle (B4), rozetler admin'e özel
 * hafif uçtan ve karakter/gizli rozetler dahil (B6), puan defteri görünür (eksik özellik 2),
 * kullanıcıya dair denetim izi ve aktivite tek ekranda (eksik özellik 1).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { calculateLevel, calculateLevelProgress, calculateXpToNextLevel } from '@/lib/utils';
import {
  deriveStatus,
  type ActivityRow,
  type AuditRow,
  type CatalogBadge,
  type CatalogReward,
  type EarnedBadge,
  type LedgerPage,
  type Paged,
  type User360,
  type UserFeedbackRow,
  type UserRewardRow,
} from './contract';

export const ELEVATION_REQUEST_ACTION = 'ROLE_ELEVATION_REQUESTED';
export const ELEVATION_DECIDED_ACTIONS = ['ROLE_ELEVATION_APPROVED', 'ROLE_ELEVATION_REJECTED'] as const;
/** Bekleyen yükseltme talebinin geçerlilik süresi. */
export const ELEVATION_TTL_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000; // 2016'dan beri sabit UTC+3

/** İstanbul gününün başlangıcı (UTC anı), `daysAgo` gün öncesi. */
export function istanbulDayStart(now: Date, daysAgo = 0): Date {
  const local = now.getTime() + ISTANBUL_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - ISTANBUL_OFFSET_MS - daysAgo * DAY_MS);
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function snapshotLabel(snap: unknown, fallback: string): string {
  if (snap && typeof snap === 'object') {
    const s = snap as { name?: unknown; email?: unknown };
    if (typeof s.name === 'string' && s.name) return s.name;
    if (typeof s.email === 'string' && s.email) return s.email;
  }
  return fallback;
}

/** Bekleyen (karara bağlanmamış, süresi dolmamış) en son ADMIN yükseltme talebi. */
export async function findPendingElevation(userId: string, now = new Date()) {
  const req = await prisma.auditLog.findFirst({
    where: {
      action: ELEVATION_REQUEST_ACTION,
      entity: 'User',
      entityId: userId,
      createdAt: { gte: new Date(now.getTime() - ELEVATION_TTL_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userId: true, createdAt: true, actorSnapshot: true, newData: true },
  });
  if (!req) return null;
  const decided = await prisma.auditLog.findFirst({
    where: {
      action: { in: [...ELEVATION_DECIDED_ACTIONS] },
      entity: 'User',
      entityId: userId,
      createdAt: { gte: req.createdAt },
    },
    select: { id: true },
  });
  if (decided) return null;
  const data = (req.newData ?? {}) as { reason?: unknown; role?: unknown };
  return {
    requestId: req.id,
    requestedAt: req.createdAt.toISOString(),
    requesterId: req.userId,
    requesterLabel: snapshotLabel(req.actorSnapshot, 'Bilinmeyen yönetici'),
    reason: typeof data.reason === 'string' ? data.reason : '',
  };
}

export async function getUser360(userId: string, viewerId: string, now = new Date()): Promise<User360 | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
      role: true,
      isDemo: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      suspendedAt: true,
      suspendedReason: true,
      anonymizedAt: true,
      preferredLanguage: true,
      points: true,
      xp: true,
      level: true,
      loginStreakCount: true,
      loginStreakLongest: true,
      loginStreakLastDay: true,
      isHallOfFame: true,
      trustScore: true,
      trustTier: true,
      trustUpdatedAt: true,
      fraudStatus: true,
      fraudScore: true,
      twoFactorEnabled: true,
      sessionVersion: true,
      password: true,
      featuredCharacterBadgeId: true,
      businessName: true,
      businessDesc: true,
      businessCategory: true,
      address: true,
      latitude: true,
      longitude: true,
      pricingPlan: { select: { id: true, name: true } },
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      adminDepartment: true,
      adminTeamRole: true,
      staffProfile: {
        select: { dealerId: true, jobTitle: true, isActive: true, dealer: { select: { businessName: true, name: true } } },
      },
      _count: { select: { feedbacks: { where: { deletedAt: null } }, badges: true, rewards: true, customerConsumptions: true, staffMembers: true } },
    },
  });
  if (!u) return null;
  const role = String(u.role);

  const [activeAdminCount, openSuspicious, unread, lastEvent, activeQr, pendingElevation] = await Promise.all([
    prisma.user.count({ where: { role: 'ADMIN', suspendedAt: null, anonymizedAt: null } }),
    prisma.suspiciousActivity.count({ where: { userId, isResolved: false } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.analyticsEvent.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    role === 'DEALER' ? prisma.qRCode.count({ where: { dealerId: userId, archivedAt: null } }) : Promise.resolve(0),
    role !== 'ADMIN' ? findPendingElevation(userId, now) : Promise.resolve(null),
  ]);

  const seen = [u.loginStreakLastDay, lastEvent?.createdAt ?? null].filter((d): d is Date => !!d);
  const lastSeenAt = seen.length ? new Date(Math.max(...seen.map((d) => d.getTime()))) : null;

  return {
    viewerId,
    isSelf: viewerId === u.id,
    activeAdminCount,
    identity: {
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      phone: u.phone,
      role,
      status: deriveStatus(u),
      isDemo: u.isDemo,
      emailVerifiedAt: iso(u.emailVerified),
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      suspendedAt: iso(u.suspendedAt),
      suspendedReason: u.suspendedReason,
      anonymizedAt: iso(u.anonymizedAt),
      preferredLanguage: u.preferredLanguage,
    },
    gamification: {
      points: u.points,
      xp: u.xp,
      level: u.level,
      derivedLevel: calculateLevel(u.xp),
      levelProgress: Math.round(calculateLevelProgress(u.xp)),
      xpToNextLevel: calculateXpToNextLevel(u.xp),
      loginStreak: u.loginStreakCount,
      loginStreakLongest: u.loginStreakLongest,
      isHallOfFame: u.isHallOfFame,
    },
    trust: {
      score: u.trustScore,
      tier: u.trustTier,
      updatedAt: iso(u.trustUpdatedAt),
      fraudStatus: u.fraudStatus,
      fraudScore: u.fraudScore,
      openSuspicious,
    },
    security: {
      twoFactorEnabled: u.twoFactorEnabled,
      sessionVersion: u.sessionVersion,
      hasPassword: !!u.password,
      lastSeenAt: iso(lastSeenAt),
    },
    counts: {
      feedbacks: u._count.feedbacks,
      badges: u._count.badges,
      rewards: u._count.rewards,
      qrCodes: activeQr,
      consumptions: u._count.customerConsumptions,
      unreadNotifications: unread,
    },
    dealer:
      role === 'DEALER'
        ? {
            businessName: u.businessName,
            businessDesc: u.businessDesc,
            businessCategory: u.businessCategory,
            address: u.address,
            latitude: u.latitude,
            longitude: u.longitude,
            plan: u.pricingPlan ? { id: u.pricingPlan.id, name: u.pricingPlan.name } : null,
            subscriptionStatus: u.subscriptionStatus,
            subscriptionCurrentPeriodEnd: iso(u.subscriptionCurrentPeriodEnd),
            activeQrCodes: activeQr,
            staffCount: u._count.staffMembers,
          }
        : null,
    staff: u.staffProfile
      ? {
          dealerId: u.staffProfile.dealerId,
          dealerName: u.staffProfile.dealer.businessName || u.staffProfile.dealer.name || null,
          jobTitle: u.staffProfile.jobTitle,
          isActive: u.staffProfile.isActive,
        }
      : null,
    team: role === 'ADMIN' ? { department: u.adminDepartment, teamRole: u.adminTeamRole } : null,
    pendingElevation,
  };
}

function paged<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

// ───────────────────────────── Puan defteri ─────────────────────────────

export async function getLedger(userId: string, page: number, pageSize: number, now = new Date()): Promise<LedgerPage> {
  const where = { userId } satisfies Prisma.PointsLedgerWhereInput;
  const since = istanbulDayStart(now, 29);
  const [total, rows, earned, spent] = await Promise.all([
    prisma.pointsLedger.count({ where }),
    prisma.pointsLedger.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        createdAt: true,
        currency: true,
        delta: true,
        xpDelta: true,
        balanceAfter: true,
        source: true,
        status: true,
        reason: true,
        actorId: true,
      },
    }),
    prisma.pointsLedger.aggregate({
      where: { userId, status: 'posted', currency: 'POINTS', delta: { gt: 0 }, createdAt: { gte: since } },
      _sum: { delta: true, xpDelta: true },
    }),
    prisma.pointsLedger.aggregate({
      where: { userId, status: 'posted', currency: 'POINTS', delta: { lt: 0 }, createdAt: { gte: since } },
      _sum: { delta: true },
    }),
  ]);
  const actorIds = Array.from(new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x)));
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true, businessName: true } })
    : [];
  const label = new Map(actors.map((a) => [a.id, a.businessName || a.name || a.email]));
  return {
    ...paged(
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        currency: r.currency,
        delta: r.delta,
        xpDelta: r.xpDelta,
        balanceAfter: r.balanceAfter,
        source: r.source,
        status: r.status,
        reason: r.reason,
        actorLabel: r.actorId ? label.get(r.actorId) ?? 'Silinmiş hesap' : null,
      })),
      total,
      page,
      pageSize
    ),
    last30: {
      earned: earned._sum.delta ?? 0,
      spent: Math.abs(spent._sum.delta ?? 0),
      xp: earned._sum.xpDelta ?? 0,
    },
  };
}

// ───────────────────────────── Rozet ve ödül ─────────────────────────────

export async function getEarnedBadges(userId: string): Promise<EarnedBadge[]> {
  const [owner, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { featuredCharacterBadgeId: true } }),
    prisma.userBadge.findMany({
      where: { userId },
      orderBy: { earnedAt: 'desc' },
      take: 500,
      select: {
        earnedAt: true,
        badge: {
          select: { id: true, name: true, icon: true, rarity: true, category: true, color: true, hiddenUntilEarned: true, archivedAt: true },
        },
      },
    }),
  ]);
  return rows.map((r) => ({
    badgeId: r.badge.id,
    name: r.badge.name,
    icon: r.badge.icon,
    rarity: r.badge.rarity,
    category: r.badge.category,
    color: r.badge.color,
    hidden: r.badge.hiddenUntilEarned,
    archived: !!r.badge.archivedAt,
    earnedAt: r.earnedAt.toISOString(),
    featured: owner?.featuredCharacterBadgeId === r.badge.id,
  }));
}

/** Verilebilir rozetler: arşivli olmayan; gizli ve karakter rozetleri dahil (admin modu). */
export async function getBadgeCatalog(): Promise<CatalogBadge[]> {
  const rows = await prisma.badge.findMany({
    where: { archivedAt: null },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 1000,
    select: { id: true, name: true, icon: true, rarity: true, category: true, hiddenUntilEarned: true, isActive: true },
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    icon: b.icon,
    rarity: b.rarity,
    category: b.category,
    hidden: b.hiddenUntilEarned,
    isActive: b.isActive,
  }));
}

/** Verilebilir ödüller: etkin, arşivsiz, stoğu olan. */
export async function getRewardCatalog(): Promise<CatalogReward[]> {
  const rows = await prisma.reward.findMany({
    where: { isActive: true, archivedAt: null, OR: [{ stock: -1 }, { stock: { gt: 0 } }] },
    orderBy: [{ cost: 'asc' }, { name: 'asc' }],
    take: 500,
    select: { id: true, name: true, icon: true, type: true, cost: true, stock: true },
  });
  return rows;
}

export async function getUserRewards(userId: string, page: number, pageSize: number): Promise<Paged<UserRewardRow>> {
  const where = { userId } satisfies Prisma.UserRewardWhereInput;
  const [total, rows] = await Promise.all([
    prisma.userReward.count({ where }),
    prisma.userReward.findMany({
      where,
      orderBy: { redeemedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, code: true, redeemedAt: true, claimedAt: true, reward: { select: { name: true, type: true, icon: true } } },
    }),
  ]);
  return paged(
    rows.map((r) => ({
      id: r.id,
      rewardName: r.reward.name,
      rewardType: r.reward.type,
      icon: r.reward.icon,
      codeTail: r.code ? r.code.slice(-4) : null,
      redeemedAt: r.redeemedAt.toISOString(),
      claimedAt: iso(r.claimedAt),
    })),
    total,
    page,
    pageSize
  );
}

// ───────────────────────────── Geri bildirim ─────────────────────────────

export async function getUserFeedbacks(userId: string, page: number, pageSize: number): Promise<Paged<UserFeedbackRow>> {
  const where = { userId } satisfies Prisma.FeedbackWhereInput;
  const [total, rows] = await Promise.all([
    prisma.feedback.count({ where }),
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        rating: true,
        text: true,
        sentiment: true,
        isToxic: true,
        deletedAt: true,
        dealerReply: true,
        createdAt: true,
        qrCode: { select: { dealer: { select: { businessName: true, name: true } } } },
      },
    }),
  ]);
  return paged(
    rows.map((f) => ({
      id: f.id,
      rating: f.rating,
      text: f.text ? (f.text.length > 400 ? `${f.text.slice(0, 400)}…` : f.text) : null,
      sentiment: f.sentiment,
      isToxic: f.isToxic,
      deleted: !!f.deletedAt,
      dealerName: f.qrCode?.dealer ? f.qrCode.dealer.businessName || f.qrCode.dealer.name || null : null,
      replied: !!f.dealerReply,
      createdAt: f.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize
  );
}

// ───────────────────────────── Denetim ve aktivite ─────────────────────────────

function summarize(data: unknown): string | null {
  if (data === null || data === undefined) return null;
  try {
    const s = JSON.stringify(data);
    return s.length > 300 ? `${s.slice(0, 300)}…` : s;
  } catch {
    return null;
  }
}

export async function getUserAudit(userId: string, page: number, pageSize: number): Promise<Paged<AuditRow>> {
  const where = { OR: [{ entityId: userId }, { userId }] } satisfies Prisma.AuditLogWhereInput;
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        userId: true,
        actorType: true,
        actorSnapshot: true,
        newData: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);
  return paged(
    rows.map((a) => ({
      id: a.id,
      action: a.action,
      entity: a.entity,
      direction: a.entityId === userId && a.userId !== userId ? 'subject' : 'actor',
      actorLabel:
        a.actorType !== 'user'
          ? 'Sistem'
          : a.user
            ? a.user.name || a.user.email
            : snapshotLabel(a.actorSnapshot, 'Silinmiş hesap'),
      summary: summarize(a.newData),
      createdAt: a.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize
  );
}

export async function getUserActivity(userId: string, limit = 60): Promise<ActivityRow[]> {
  const [events, suspicious] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, event: true, category: true, createdAt: true },
    }),
    prisma.suspiciousActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, type: true, severity: true, description: true, isResolved: true, createdAt: true },
    }),
  ]);
  const rows: ActivityRow[] = [
    ...events.map((e) => ({
      id: `e:${e.id}`,
      kind: 'event' as const,
      title: e.event,
      detail: e.category,
      severity: null,
      resolved: null,
      createdAt: e.createdAt.toISOString(),
    })),
    ...suspicious.map((s) => ({
      id: `s:${s.id}`,
      kind: 'suspicious' as const,
      title: s.type,
      detail: s.description.length > 240 ? `${s.description.slice(0, 240)}…` : s.description,
      severity: s.severity,
      resolved: s.isResolved,
      createdAt: s.createdAt.toISOString(),
    })),
  ];
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}

/**
 * Admin kullanıcı listesi — filtre, sıralama, sayfalama, KPI ve CSV (sunucu).
 *
 * Bulgular: STAFF artık filtrelenebilir ve listelenir (B1), KPI'lar sayfaya değil tüm veriye
 * dayanır (B9), liste PII'si dar `select` (B17), CSV sunucuda tüm filtre sonucu + enjeksiyon
 * korumalı (B14).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  EXPORT_MAX_ROWS,
  USER_ROLES,
  deriveStatus,
  normalizeSearch,
  parseListSort,
  type ListQuery,
  type UserListItem,
  type UserListPage,
  type UserRole,
  type UsersStats,
} from './contract';

export type ListFilters = Omit<ListQuery, 'page' | 'size' | 'sort'>;

/** Saf: filtrelerden Prisma `where`. Varsayılan durum anonimleştirilmiş hesapları gizler. */
export function buildUserWhere(f: ListFilters): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  const q = normalizeSearch(f.q);
  if (q) {
    and.push({
      OR: [
        { id: q },
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { businessName: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (f.role) and.push({ role: f.role });
  if (f.status === 'anonymized') and.push({ anonymizedAt: { not: null } });
  else if (f.status === 'suspended') and.push({ anonymizedAt: null, suspendedAt: { not: null } });
  else if (f.status === 'active') and.push({ anonymizedAt: null, suspendedAt: null });
  else and.push({ anonymizedAt: null });
  if (f.trust) and.push({ trustTier: f.trust });
  if (f.fraud) and.push({ fraudStatus: f.fraud });
  if (f.plan === 'has') and.push({ pricingPlanId: { not: null } });
  if (f.plan === 'none') and.push({ pricingPlanId: null });
  if (f.verified === 'yes') and.push({ emailVerified: { not: null } });
  if (f.verified === 'no') and.push({ emailVerified: null });
  return and.length === 1 ? and[0] : { AND: and };
}

export function buildUserOrderBy(sortRaw: string | undefined | null): Prisma.UserOrderByWithRelationInput[] {
  const s = parseListSort(sortRaw);
  const dir = s.desc ? 'desc' : 'asc';
  // İkincil anahtar id: eşit değerlerde sayfalar arası kayma/tekrar olmasın.
  return [{ [s.id]: dir } as Prisma.UserOrderByWithRelationInput, { id: 'desc' }];
}

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  points: true,
  level: true,
  xp: true,
  trustScore: true,
  trustTier: true,
  fraudStatus: true,
  emailVerified: true,
  isDemo: true,
  businessName: true,
  suspendedAt: true,
  anonymizedAt: true,
  createdAt: true,
  pricingPlan: { select: { name: true } },
  staffProfile: { select: { dealer: { select: { businessName: true, name: true } } } },
  _count: { select: { feedbacks: { where: { deletedAt: null } }, badges: true } },
} satisfies Prisma.UserSelect;

type ListRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;

export function toListItem(u: ListRow): UserListItem {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: String(u.role),
    status: deriveStatus(u),
    points: u.points,
    level: u.level,
    xp: u.xp,
    trustScore: u.trustScore,
    trustTier: u.trustTier,
    fraudStatus: u.fraudStatus,
    emailVerified: !!u.emailVerified,
    isDemo: u.isDemo,
    businessName: u.businessName,
    planName: u.pricingPlan?.name ?? null,
    staffOf: u.staffProfile?.dealer ? u.staffProfile.dealer.businessName || u.staffProfile.dealer.name || null : null,
    feedbackCount: u._count.feedbacks,
    badgeCount: u._count.badges,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listUsers(query: ListQuery): Promise<UserListPage> {
  const where = buildUserWhere(query);
  const pageSize = query.size;
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: buildUserOrderBy(query.sort),
      skip: (query.page - 1) * pageSize,
      take: pageSize,
      select: LIST_SELECT,
    }),
  ]);
  return {
    items: rows.map(toListItem),
    total,
    page: query.page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getUsersStats(now = new Date()): Promise<UsersStats> {
  const live = { anonymizedAt: null } satisfies Prisma.UserWhereInput;
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [grouped, suspended, anonymized, flagged, lowTrust, newLast7d] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], where: live, _count: { _all: true } }),
    prisma.user.count({ where: { ...live, suspendedAt: { not: null } } }),
    prisma.user.count({ where: { anonymizedAt: { not: null } } }),
    prisma.user.count({ where: { ...live, fraudStatus: { not: 'clean' } } }),
    prisma.user.count({ where: { ...live, trustTier: { in: ['watch', 'low'] } } }),
    prisma.user.count({ where: { ...live, createdAt: { gte: weekAgo } } }),
  ]);
  const byRole = Object.fromEntries(USER_ROLES.map((r) => [r, 0])) as Record<UserRole, number>;
  let total = 0;
  for (const g of grouped) {
    const n = g._count._all;
    total += n;
    const key = String(g.role) as UserRole;
    if (key in byRole) byRole[key] = n;
  }
  return { total, byRole, suspended, anonymized, flagged, lowTrust, newLast7d, calculatedAt: now.toISOString() };
}

// ───────────────────────────── CSV ─────────────────────────────

export const EXPORT_HEADER = [
  'id',
  'ad',
  'e_posta',
  'rol',
  'durum',
  'puan',
  'seviye',
  'xp',
  'guven_kademesi',
  'guven_puani',
  'fraud_durumu',
  'e_posta_dogrulandi',
  'isletme',
  'plan',
  'bagli_isletme',
  'geri_bildirim',
  'rozet',
  'kayit_tarihi',
] as const;

export function exportRow(u: UserListItem): unknown[] {
  return [
    u.id,
    u.name,
    u.email,
    u.role,
    u.status,
    u.points,
    u.level,
    u.xp,
    u.trustTier,
    u.trustScore,
    u.fraudStatus,
    u.emailVerified ? 'evet' : 'hayır',
    u.businessName,
    u.planName,
    u.staffOf,
    u.feedbackCount,
    u.badgeCount,
    u.createdAt,
  ];
}

/** Filtre sonucunu en fazla EXPORT_MAX_ROWS satır, 500'lük partilerle okur. */
export async function* iterateExport(filters: ListFilters, sort: string | undefined): AsyncGenerator<UserListItem[]> {
  const where = buildUserWhere(filters);
  const orderBy = buildUserOrderBy(sort);
  let fetched = 0;
  const batch = 500;
  while (fetched < EXPORT_MAX_ROWS) {
    const rows = await prisma.user.findMany({
      where,
      orderBy,
      skip: fetched,
      take: Math.min(batch, EXPORT_MAX_ROWS - fetched),
      select: LIST_SELECT,
    });
    if (rows.length === 0) return;
    fetched += rows.length;
    yield rows.map(toListItem);
    if (rows.length < batch) return;
  }
}

/**
 * Rozetler merkezi — KATALOG sunucu mantığı (liste, sağlık sayıları, detay, oluştur/düzenle,
 * arşiv/geri al, çoğalt, kullanıcıya ver, toplu işlem). Yetki BFF'te (`defineRoute`,
 * ADMIN + DB rolü); burası yalnız iş kuralı.
 *
 * Kurallar:
 *  - Silme YOK: arşiv (`archivedAt`), kazanılmış rozetler korunur (cascade yok). Kazananı olan
 *    rozetin arşivi açık onay ister (409 CONFIRM_REQUIRED + etki).
 *  - Karakter (dizi) rozetleri arşivlenemez/çoğaltılamaz/elle verilemez; koşulları motorda.
 *    Pasifleştirme ise gerçekten uygulanır (lib/character-badges `inactiveCharacterIds`).
 *  - Ödül puanı SALT-OKUNUR (`badgeRewardPoints`): elle verme puan basmaz (`reward: 'none'`).
 *  - Her yazma, değişiklikle AYNI transaction'da denetim kaydı yazar.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { trackabilityOf, type Trackability } from '@/lib/badge-trackability';
import { badgeRewardPoints } from '@/lib/badge-reward-points';
import { sanitizeHexColor } from '@/lib/badge-colors';
import { CHARACTER_PROFILES } from '@/lib/character-badges';
import { CATEGORY_BY_CHARACTER, CHARACTER_CATEGORIES } from '@/lib/character-categories';
import { getCharacterRevealText } from '@/lib/character-reveal-texts';
import { emailLookupFilter } from '@/lib/auth/normalize-email';
import {
  BADGE_DEFAULT_SORT,
  BADGE_RARITIES,
  RARITY_RANK,
  badgeUpsertSchema,
  characterBadgePatchSchema,
  normalizeCategory,
  normalizeRarity,
  requirementLabel,
  type ArchiveImpact,
  type BadgeActionResult,
  type BadgeAuditRow,
  type BadgeBulkInput,
  type BadgeBulkResult,
  type BadgeDetail,
  type BadgeHealthCounts,
  type BadgeListItem,
  type BadgeListPage,
  type BadgeListQuery,
  type BadgeRarity,
  type BadgeStats,
} from './contract';

type RequestLike = { headers: { get(name: string): string | null } } | null | undefined;

const CHARACTER_IDS = new Set(CHARACTER_PROFILES.map((c) => c.badgeId));
export const isCharacterBadgeId = (id: string) => CHARACTER_IDS.has(id);

const DAY_MS = 86_400_000;
const ISTANBUL_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Europe/Istanbul takvim günü (YYYY-MM-DD). */
export function istanbulDay(d: Date): string {
  return ISTANBUL_DAY.format(d);
}

// ───────────────────────────── Okuma ─────────────────────────────

type RequirementJson = { type?: unknown; value?: unknown; period?: unknown; metadata?: unknown };

function readRequirement(raw: Prisma.JsonValue | null): { type: string; value: number; period: string | null; rest: Record<string, unknown> } {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as RequirementJson & Record<string, unknown>) : {};
  const type = typeof r.type === 'string' && r.type ? r.type : 'custom';
  const value = typeof r.value === 'number' && Number.isFinite(r.value) ? Math.max(0, Math.floor(r.value)) : 0;
  const period = typeof r.period === 'string' ? r.period : null;
  return { type, value, period, rest: { ...r } };
}

const BADGE_SELECT = {
  id: true,
  name: true,
  description: true,
  icon: true,
  category: true,
  rarity: true,
  requirement: true,
  isActive: true,
  archivedAt: true,
  color: true,
  bgColor: true,
  createdAt: true,
  _count: { select: { users: true } },
} as const;

type BadgeRow = Prisma.BadgeGetPayload<{ select: typeof BADGE_SELECT }>;

function toItem(row: BadgeRow, last: Map<string, Date>, recent: Map<string, number>): BadgeListItem {
  const req = readRequirement(row.requirement);
  const isCharacter = CHARACTER_IDS.has(row.id);
  const series = isCharacter ? CATEGORY_BY_CHARACTER[row.id] ?? null : null;
  const trackability: Trackability = isCharacter ? 'character' : trackabilityOf(req.type);
  const lastAt = last.get(row.id);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    category: normalizeCategory(row.category),
    rarity: normalizeRarity(row.rarity),
    requirementType: isCharacter ? 'character' : req.type,
    targetValue: req.value,
    trackability,
    rewardPoints: badgeRewardPoints(row.id),
    status: row.archivedAt ? 'archived' : row.isActive ? 'active' : 'inactive',
    isCharacter,
    seriesKey: series?.key ?? null,
    seriesName: series?.name ?? null,
    color: row.color ?? null,
    bgColor: row.bgColor ?? null,
    earnedCount: row._count.users,
    earned30d: recent.get(row.id) ?? 0,
    lastEarnedAt: lastAt ? lastAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Katalog tek seferde okunur (rozet sayısı yüzlerle sınırlı; `take` emniyet tavanı): filtre,
 * arama, sıralama ve sayfalama sunucuda bellekte yapılır — nadirlik sırası gibi Prisma'nın
 * ifade edemediği sıralamalar da doğru olur.
 */
export async function loadCatalog(now: Date = new Date()): Promise<BadgeListItem[]> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [rows, last, recent] = await Promise.all([
    prisma.badge.findMany({ select: BADGE_SELECT, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.userBadge.groupBy({ by: ['badgeId'], _max: { earnedAt: true } }),
    prisma.userBadge.groupBy({ by: ['badgeId'], where: { earnedAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const lastMap = new Map<string, Date>();
  for (const g of last) if (g._max.earnedAt) lastMap.set(g.badgeId, g._max.earnedAt);
  const recentMap = new Map<string, number>();
  for (const g of recent) recentMap.set(g.badgeId, g._count._all);
  return rows.map((r) => toItem(r, lastMap, recentMap));
}

const TR_LOWER = (s: string) => s.toLocaleLowerCase('tr-TR');

export function filterCatalog(items: readonly BadgeListItem[], q: BadgeListQuery): BadgeListItem[] {
  const needle = q.q ? TR_LOWER(q.q) : null;
  return items.filter((b) => {
    if (q.tab === 'series' ? !b.isCharacter : b.isCharacter) return false;
    if (q.tab === 'series' && q.series && b.seriesKey !== q.series) return false;
    // Arşiv yalnız açıkça istenince görünür.
    if (q.health === 'archived') {
      if (b.status !== 'archived') return false;
    } else if (b.status === 'archived') return false;
    if (q.rarity && b.rarity !== q.rarity) return false;
    switch (q.health) {
      case 'active':
      case 'inactive':
        if (b.status !== q.health) return false;
        break;
      case 'never':
        if (b.earnedCount > 0) return false;
        break;
      case 'exact':
      case 'approximate':
      case 'untrackable':
        if (b.trackability !== q.health) return false;
        break;
      default:
        break;
    }
    if (needle) {
      const hay = TR_LOWER([b.name, b.description, b.id, requirementLabel(b.requirementType), b.seriesName ?? ''].join(' '));
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function sortCatalog(items: BadgeListItem[], sort: string | undefined): BadgeListItem[] {
  const [id, dir] = (sort ?? BADGE_DEFAULT_SORT).split('.');
  const sign = dir === 'asc' ? 1 : -1;
  const time = (v: string | null) => (v ? Date.parse(v) : 0);
  const cmp = (a: BadgeListItem, b: BadgeListItem): number => {
    switch (id) {
      case 'name':
        return a.name.localeCompare(b.name, 'tr');
      case 'earned':
        return a.earnedCount - b.earnedCount;
      case 'recent':
        return a.earned30d - b.earned30d;
      case 'lastEarned':
        return time(a.lastEarnedAt) - time(b.lastEarnedAt);
      case 'createdAt':
        return time(a.createdAt) - time(b.createdAt);
      case 'rarity':
      default:
        return RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity];
    }
  };
  return [...items].sort((a, b) => cmp(a, b) * sign || a.name.localeCompare(b.name, 'tr'));
}

export async function listBadges(q: BadgeListQuery): Promise<BadgeListPage> {
  const all = await loadCatalog();
  const filtered = sortCatalog(filterCatalog(all, q), q.sort);
  const start = (q.page - 1) * q.size;
  return { items: filtered.slice(start, start + q.size), total: filtered.length, page: q.page, size: q.size };
}

function emptyCounts(): BadgeHealthCounts {
  return { total: 0, active: 0, inactive: 0, archived: 0, never: 0, exact: 0, approximate: 0, untrackable: 0 };
}

export function computeStats(items: readonly BadgeListItem[]): BadgeStats {
  const normal = emptyCounts();
  const series = emptyCounts();
  const rarity = Object.fromEntries(BADGE_RARITIES.map((r) => [r, 0])) as Record<BadgeRarity, number>;
  let totalEarned = 0;
  let earned30d = 0;
  const seriesCount = new Map<string, number>();
  for (const b of items) {
    const c = b.isCharacter ? series : normal;
    totalEarned += b.earnedCount;
    earned30d += b.earned30d;
    if (b.status === 'archived') {
      c.archived++;
      continue;
    }
    c.total++;
    c[b.status]++;
    if (b.earnedCount === 0) c.never++;
    if (b.trackability === 'exact' || b.trackability === 'approximate' || b.trackability === 'untrackable') c[b.trackability]++;
    rarity[b.rarity]++;
    if (b.seriesKey) seriesCount.set(b.seriesKey, (seriesCount.get(b.seriesKey) ?? 0) + 1);
  }
  const present = new Set(items.filter((b) => b.isCharacter).map((b) => b.id));
  return {
    normal,
    series,
    rarity,
    totalEarned,
    earned30d,
    charactersWithoutRecord: [...CHARACTER_IDS].filter((id) => !present.has(id)).length,
    seriesCategories: CHARACTER_CATEGORIES.map((c) => ({ key: c.key, name: c.name, emoji: c.emoji, count: seriesCount.get(c.key) ?? 0 })),
  };
}

export async function getBadgeStats(): Promise<BadgeStats> {
  return computeStats(await loadCatalog());
}

const AUDIT_LABEL: Record<string, string> = {
  CREATE_BADGE: 'Oluşturuldu',
  UPDATE_BADGE: 'Düzenlendi',
  ARCHIVE_BADGE: 'Arşivlendi',
  RESTORE_BADGE: 'Arşivden geri alındı',
  DUPLICATE_BADGE: 'Çoğaltıldı',
  GRANT_BADGE: 'Kullanıcıya verildi',
  BULK_BADGE_ACTIVATE: 'Toplu etkinleştirildi',
  BULK_BADGE_DEACTIVATE: 'Toplu pasifleştirildi',
  BULK_BADGE_ARCHIVE: 'Toplu arşivlendi',
  DELETE_BADGE: 'Silindi (eski)',
};

function actorName(row: { actorSnapshot: Prisma.JsonValue | null; user: { name: string | null; email: string | null } | null }): string | null {
  if (row.user) return row.user.name || row.user.email;
  const snap = row.actorSnapshot && typeof row.actorSnapshot === 'object' && !Array.isArray(row.actorSnapshot) ? (row.actorSnapshot as Record<string, unknown>) : null;
  const n = snap && (typeof snap.name === 'string' ? snap.name : typeof snap.email === 'string' ? snap.email : null);
  return n || null;
}

function auditSummary(action: string, newData: Prisma.JsonValue | null): string | null {
  const d = newData && typeof newData === 'object' && !Array.isArray(newData) ? (newData as Record<string, unknown>) : null;
  if (!d) return null;
  if (action === 'GRANT_BADGE' && typeof d.targetEmail === 'string') {
    return `${d.targetEmail}${typeof d.reason === 'string' ? ` — ${d.reason}` : ''}`;
  }
  if (typeof d.changed === 'string') return d.changed;
  return null;
}

export async function getBadgeDetail(id: string, now: Date = new Date()): Promise<BadgeDetail> {
  const row = await prisma.badge.findUnique({
    where: { id },
    select: { ...BADGE_SELECT, hiddenUntilEarned: true, pointCost: true, updatedAt: true },
  });
  if (!row) throw new ApiError('NOT_FOUND', 'Rozet bulunamadı.');
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [recentRows, lastRow, earners, audit] = await Promise.all([
    prisma.userBadge.findMany({ where: { badgeId: id, earnedAt: { gte: since } }, select: { earnedAt: true }, take: 50_000 }),
    prisma.userBadge.findFirst({ where: { badgeId: id }, orderBy: { earnedAt: 'desc' }, select: { earnedAt: true } }),
    prisma.userBadge.findMany({
      where: { badgeId: id },
      orderBy: { earnedAt: 'desc' },
      take: 20,
      select: { earnedAt: true, user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.findMany({
      where: { entity: 'Badge', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, action: true, createdAt: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
  ]);

  const byDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) byDay.set(istanbulDay(new Date(now.getTime() - i * DAY_MS)), 0);
  for (const r of recentRows) {
    const k = istanbulDay(r.earnedAt);
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const lastMap = new Map<string, Date>();
  if (lastRow) lastMap.set(id, lastRow.earnedAt);
  const item = toItem(row, lastMap, new Map([[id, recentRows.length]]));
  const req = readRequirement(row.requirement);

  return {
    ...item,
    requirementPeriod: req.period,
    hiddenUntilEarned: row.hiddenUntilEarned,
    pointCost: row.pointCost ?? null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    series30: [...byDay.entries()].map(([day, count]) => ({ day, count })),
    recentEarners: earners.map((e) => ({ userId: e.user.id, name: e.user.name, email: e.user.email, earnedAt: e.earnedAt.toISOString() })),
    audit: audit.map<BadgeAuditRow>((a) => ({
      id: a.id,
      action: AUDIT_LABEL[a.action] ?? a.action,
      at: a.createdAt.toISOString(),
      actor: actorName(a),
      summary: auditSummary(a.action, a.newData),
    })),
    hasRevealText: item.isCharacter ? Boolean(getCharacterRevealText(id)) : null,
  };
}

// ───────────────────────────── Yazma ─────────────────────────────

function snapshot(b: { name: string; description: string; icon: string; category: string; rarity: string; requirement: Prisma.JsonValue; isActive: boolean; color: string | null; bgColor: string | null }) {
  return {
    name: b.name,
    description: b.description,
    icon: b.icon,
    category: b.category,
    rarity: b.rarity,
    requirement: b.requirement,
    isActive: b.isActive,
    color: b.color,
    bgColor: b.bgColor,
  };
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    name: 'ad',
    description: 'açıklama',
    icon: 'ikon',
    category: 'kategori',
    rarity: 'nadirlik',
    requirement: 'koşul',
    isActive: 'durum',
    color: 'vurgu rengi',
    bgColor: 'arka plan',
  };
  const keys = Object.keys(labels).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return keys.length ? `Değişen: ${keys.map((k) => labels[k]).join(', ')}` : 'Değişiklik yok';
}

export async function createBadge(input: unknown, actor: AuditActor, request?: RequestLike): Promise<{ id: string }> {
  const v = badgeUpsertSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const badge = await tx.badge.create({
      data: {
        name: v.name,
        description: v.description,
        icon: v.icon,
        category: v.category,
        rarity: v.rarity,
        requirement: { type: v.requirementType, value: v.targetValue, period: null, metadata: {} },
        isActive: v.isActive,
        color: sanitizeHexColor(v.color),
        bgColor: sanitizeHexColor(v.bgColor),
      },
    });
    await tx.auditLog.create({
      data: auditEntry(actor, { action: 'CREATE_BADGE', entity: 'Badge', entityId: badge.id, newData: { ...snapshot(badge), changed: 'Yeni rozet' } }, request),
    });
    return { id: badge.id };
  });
}

export async function updateBadge(id: string, input: unknown, actor: AuditActor, request?: RequestLike): Promise<BadgeDetail> {
  const old = await prisma.badge.findUnique({ where: { id } });
  if (!old) throw new ApiError('NOT_FOUND', 'Rozet bulunamadı.');
  if (old.archivedAt) {
    throw new ApiError('ARCHIVED', 'Arşivlenmiş rozet düzenlenemez. Önce arşivden geri alın.', { status: 409 });
  }
  let data: Prisma.BadgeUpdateInput;
  if (CHARACTER_IDS.has(id)) {
    const v = characterBadgePatchSchema.parse(input);
    data = {
      name: v.name,
      description: v.description,
      icon: v.icon,
      rarity: v.rarity,
      isActive: v.isActive,
      color: sanitizeHexColor(v.color),
      bgColor: sanitizeHexColor(v.bgColor),
    };
  } else {
    const v = badgeUpsertSchema.parse(input);
    // Koşul BİRLEŞTİRİLİR: eski `period`/`metadata` alanları korunur (Bulgu 7).
    const prev = readRequirement(old.requirement);
    data = {
      name: v.name,
      description: v.description,
      icon: v.icon,
      category: v.category,
      rarity: v.rarity,
      requirement: { ...prev.rest, type: v.requirementType, value: v.targetValue } as Prisma.InputJsonObject,
      isActive: v.isActive,
      color: sanitizeHexColor(v.color),
      bgColor: sanitizeHexColor(v.bgColor),
    };
  }
  await prisma.$transaction(async (tx) => {
    const next = await tx.badge.update({ where: { id }, data });
    const before = snapshot(old);
    const after = snapshot(next);
    await tx.auditLog.create({
      data: auditEntry(
        actor,
        { action: 'UPDATE_BADGE', entity: 'Badge', entityId: id, oldData: before, newData: { ...after, changed: changedFields(before, after) } },
        request
      ),
    });
  });
  return getBadgeDetail(id);
}

async function archiveImpact(id: string): Promise<{ impact: ArchiveImpact; badge: { name: string; archivedAt: Date | null; isActive: boolean } }> {
  const badge = await prisma.badge.findUnique({
    where: { id },
    select: { name: true, archivedAt: true, isActive: true, _count: { select: { users: true } } },
  });
  if (!badge) throw new ApiError('NOT_FOUND', 'Rozet bulunamadı.');
  const blockers: string[] = [];
  if (CHARACTER_IDS.has(id)) {
    blockers.push('Karakter rozetleri arşivlenemez; karakter motoru bu kimliğe bağlıdır. Yeni kazanımı durdurmak için rozeti pasifleştirin.');
  }
  const earnedBy = badge._count.users;
  return { impact: { earnedBy, blockers, requiresConfirm: earnedBy > 0 }, badge };
}

export async function runBadgeAction(
  id: string,
  input: import('./contract').BadgeActionInput,
  actor: AuditActor,
  request?: RequestLike
): Promise<BadgeActionResult> {
  switch (input.action) {
    case 'archive': {
      const { impact, badge } = await archiveImpact(id);
      if (input.dryRun) return { action: 'archive', dryRun: true, impact };
      if (impact.blockers.length) throw new ApiError('ARCHIVE_BLOCKED', impact.blockers[0], { status: 409, details: { impact } });
      if (impact.requiresConfirm && input.confirm !== true) {
        throw new ApiError('CONFIRM_REQUIRED', `Bu rozeti ${impact.earnedBy} kullanıcı kazanmış. Arşivlemek için onaylayın.`, {
          status: 409,
          details: { impact },
        });
      }
      if (badge.archivedAt) return { action: 'archive', archived: true, impact };
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.badge.update({ where: { id }, data: { archivedAt: now, isActive: false } });
        await tx.auditLog.create({
          data: auditEntry(
            actor,
            {
              action: 'ARCHIVE_BADGE',
              entity: 'Badge',
              entityId: id,
              oldData: { name: badge.name, isActive: badge.isActive },
              newData: { archivedAt: now, earnedByPreserved: impact.earnedBy, changed: `${impact.earnedBy} kazanım korundu` },
            },
            request
          ),
        });
      });
      return { action: 'archive', archived: true, impact };
    }
    case 'restore': {
      const badge = await prisma.badge.findUnique({ where: { id }, select: { archivedAt: true } });
      if (!badge) throw new ApiError('NOT_FOUND', 'Rozet bulunamadı.');
      if (!badge.archivedAt) throw new ApiError('NOT_ARCHIVED', 'Bu rozet arşivde değil.', { status: 409 });
      await prisma.$transaction(async (tx) => {
        // Geri alınan rozet PASİF döner: admin gözden geçirip açıkça etkinleştirir.
        await tx.badge.update({ where: { id }, data: { archivedAt: null, isActive: false } });
        await tx.auditLog.create({
          data: auditEntry(actor, { action: 'RESTORE_BADGE', entity: 'Badge', entityId: id, newData: { changed: 'Pasif olarak geri alındı' } }, request),
        });
      });
      return { action: 'restore', restored: true };
    }
    case 'duplicate': {
      if (CHARACTER_IDS.has(id)) throw new ApiError('CHARACTER_LOCKED', 'Karakter rozetleri çoğaltılamaz.', { status: 409 });
      const src = await prisma.badge.findUnique({ where: { id } });
      if (!src) throw new ApiError('NOT_FOUND', 'Rozet bulunamadı.');
      const name = `${src.name} (kopya)`.slice(0, 60);
      const created = await prisma.$transaction(async (tx) => {
        const b = await tx.badge.create({
          data: {
            name,
            description: src.description,
            icon: src.icon,
            category: src.category,
            rarity: src.rarity,
            requirement: (src.requirement ?? { type: 'custom', value: 1 }) as Prisma.InputJsonValue,
            isActive: false,
            color: src.color,
            bgColor: src.bgColor,
            hiddenUntilEarned: src.hiddenUntilEarned,
          },
        });
        await tx.auditLog.create({
          data: auditEntry(actor, { action: 'DUPLICATE_BADGE', entity: 'Badge', entityId: b.id, newData: { ...snapshot(b), copiedFrom: id, changed: `Kaynak: ${src.name}` } }, request),
        });
        return b;
      });
      return { action: 'duplicate', id: created.id };
    }
    case 'grant': {
      if (CHARACTER_IDS.has(id)) {
        throw new ApiError('CHARACTER_LOCKED', 'Karakter rozetleri yalnız karakter motoruyla kazanılır; elle verilemez.', { status: 409 });
      }
      const user = await prisma.user.findFirst({
        where: { email: emailLookupFilter(input.email) },
        select: { id: true, role: true, email: true },
      });
      if (!user) throw new ApiError('NOT_FOUND', 'Bu e-postayla kayıtlı kullanıcı bulunamadı.');
      if (user.role !== 'CUSTOMER') throw new ApiError('NOT_CUSTOMER', 'Rozet yalnız müşteri hesaplarına verilebilir.', { status: 409 });
      const { awardBadgeInTx, AWARD_BADGE_REJECT_MESSAGES } = await import('@/lib/badges/award');
      const res = await prisma.$transaction(async (tx) => {
        // Elle verme PUAN BASMAZ (reward:'none'): ödül puanı yalnız kazanım motorlarının işidir.
        const award = await awardBadgeInTx(tx, { userId: user.id, badgeId: id, source: 'admin', reward: 'none', actorId: actor.id });
        if (award.awarded) {
          await tx.auditLog.create({
            data: auditEntry(
              actor,
              { action: 'GRANT_BADGE', entity: 'Badge', entityId: id, newData: { targetUserId: user.id, targetEmail: user.email, reason: input.reason } },
              request
            ),
          });
        }
        return award;
      });
      if (!res.awarded && res.reason !== 'ALREADY_OWNED') {
        throw new ApiError(res.reason, AWARD_BADGE_REJECT_MESSAGES[res.reason], { status: res.reason === 'BADGE_NOT_FOUND' ? 404 : 409 });
      }
      return res.awarded
        ? { action: 'grant', userId: user.id, awarded: true }
        : { action: 'grant', userId: user.id, awarded: false, reason: 'Kullanıcı bu rozete zaten sahip.' };
    }
  }
}

export async function runBulk(input: BadgeBulkInput, actor: AuditActor, request?: RequestLike): Promise<BadgeBulkResult> {
  const ids = [...new Set(input.ids)];
  const rows = await prisma.badge.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, isActive: true, archivedAt: true, _count: { select: { users: true } } },
  });
  const found = new Map(rows.map((r) => [r.id, r]));
  const skipped: BadgeBulkResult['skipped'] = [];
  const target: string[] = [];
  for (const id of ids) {
    const r = found.get(id);
    if (!r) {
      skipped.push({ id, reason: 'Bulunamadı' });
      continue;
    }
    if (r.archivedAt) {
      skipped.push({ id, reason: 'Zaten arşivde' });
      continue;
    }
    if (input.action === 'archive' && CHARACTER_IDS.has(id)) {
      skipped.push({ id, reason: 'Karakter rozeti arşivlenemez' });
      continue;
    }
    if (input.action === 'activate' && r.isActive) continue;
    if (input.action === 'deactivate' && !r.isActive) continue;
    target.push(id);
  }
  if (input.action === 'archive' && input.confirm !== true) {
    const earned = target.reduce((s, id) => s + (found.get(id)?._count.users ?? 0), 0);
    if (earned > 0) {
      throw new ApiError('CONFIRM_REQUIRED', `Seçili rozetlerin toplam ${earned} kazanımı var. Arşivlemek için onaylayın.`, {
        status: 409,
        details: { earned, count: target.length },
      });
    }
  }
  if (target.length === 0) return { action: input.action, changed: 0, skipped };
  const now = new Date();
  const data: Prisma.BadgeUpdateManyMutationInput =
    input.action === 'archive' ? { archivedAt: now, isActive: false } : { isActive: input.action === 'activate' };
  const action = input.action === 'archive' ? 'BULK_BADGE_ARCHIVE' : input.action === 'activate' ? 'BULK_BADGE_ACTIVATE' : 'BULK_BADGE_DEACTIVATE';
  const changed = await prisma.$transaction(async (tx) => {
    const res = await tx.badge.updateMany({ where: { id: { in: target }, archivedAt: null }, data });
    await tx.auditLog.createMany({
      data: target.map((id) =>
        auditEntry(actor, { action, entity: 'Badge', entityId: id, oldData: { isActive: found.get(id)?.isActive }, newData: { ...data, changed: `Toplu işlem (${target.length} rozet)` } }, request)
      ),
    });
    return res.count;
  });
  return { action: input.action, changed, skipped };
}

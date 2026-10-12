/**
 * Admin → Sürpriz kutular (Dalga 2) — sunucu çekirdeği.
 *
 *  - Liste/KPI'lar SQL'de toplanır (eski: 200 satır çekip istemcide 50'sini saymak).
 *  - Günlük otomatik kutular (dayKey dolu) yalnız "Günlük kutular" istatistiğinde.
 *  - Geri çekme: yalnız AÇILMAMIŞ hediye kutuları; koşullu silme (`openedAt: null`) açılışla
 *    yarışta güvenli — açılış önce kazanırsa kutu silinmez, puan zaten basılmıştır. Silinen her
 *    kutunun anlık görüntüsü AuditLog'a yazılır (şemada `revokedAt` yok → ŞEMA İSTEĞİ).
 *  - Bütçe günü Europe/Istanbul.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { getModuleControls } from '@/lib/module-gate';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { boxTier } from '@/lib/wallet-rewards/rules';
import type { CosmeticRarity } from '@/lib/wallet-rewards/types';
import { DAILY_BOX_MAX_POINTS, DAILY_BOX_MIN_POINTS } from '@/lib/wallet-rewards/rules';
import {
  SURPRISE_BOX_LIMITS,
  campaignState,
  tierTable,
  type CampaignDetail,
  type CampaignListItem,
  type CampaignListPage,
  type CampaignListQuery,
  type CouponOption,
  type RecipientOption,
  type SurpriseStats,
} from './contract';

type Db = typeof prisma;
type ReqLike = { headers: { get(name: string): string | null } } | null;

const DAY = 86_400_000;
const ISTANBUL_OFFSET_MS = 3 * 3_600_000; // Türkiye 2016'dan beri sabit UTC+3

/** İstanbul takvim gününün başlangıcı (UTC anı), `daysAgo` gün öncesi. */
export function istanbulDayStart(now: Date, daysAgo = 0): Date {
  const local = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysAgo * DAY;
  return new Date(startLocal - ISTANBUL_OFFSET_MS);
}

export function istanbulMonthStart(now: Date): Date {
  const local = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - ISTANBUL_OFFSET_MS);
}

export function istanbulDayKey(d: Date): string {
  return new Date(d.getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

const num = (v: unknown): number => {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return 0;
};

/** Gönderenin bugün (İstanbul günü) dağıttığı hediye puanı. */
export async function sentTodayBySender(db: Prisma.TransactionClient | Db, senderId: string, now: Date): Promise<number> {
  const agg = await db.userSurpriseBox.aggregate({
    // Geri çekilen kutunun puanı serbest kalır (eskiden satır silinirdi).
    where: { sentByUserId: senderId, dayKey: null, withdrawnAt: null, createdAt: { gte: istanbulDayStart(now) } },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

// ───────────────────────── Kampanya listesi ─────────────────────────

type CampaignRow = {
  key: string;
  title: string;
  createdAt: Date;
  senderId: string | null;
  recipients: unknown;
  opened: unknown;
  pointsPerBox: unknown;
  totalPoints: unknown;
  pendingPoints: unknown;
  couponCode: string | null;
  legacy: boolean;
  total?: unknown;
};

function toItem(r: CampaignRow, senders: Map<string, string | null>): CampaignListItem {
  const recipients = num(r.recipients);
  const opened = num(r.opened);
  return {
    id: r.key,
    title: r.title,
    createdAt: new Date(r.createdAt).toISOString(),
    sender: r.senderId ? { id: r.senderId, name: senders.get(r.senderId) ?? null } : null,
    recipients,
    opened,
    pointsPerBox: num(r.pointsPerBox),
    totalPoints: num(r.totalPoints),
    pendingPoints: num(r.pendingPoints),
    couponCode: r.couponCode,
    legacy: !!r.legacy,
    state: campaignState(recipients, opened),
  };
}

async function senderNames(db: Db, ids: Array<string | null>): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();
  const rows = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(rows.map((u) => [u.id, u.name || u.email]));
}

/** Kampanya anahtarı (modül yüklenirken değil, çağrıda kurulur — test ortamı dostu). */
const keySql = () => Prisma.sql`COALESCE(b."metadata"->>'campaignId', b."id")`;

export async function listCampaigns(q: CampaignListQuery, db: Db = prisma): Promise<CampaignListPage> {
  const where: Prisma.Sql[] = [Prisma.sql`b."dayKey" IS NULL`, Prisma.sql`b."withdrawnAt" IS NULL`];
  if (q.q) where.push(Prisma.sql`(b."title" ILIKE ${'%' + q.q + '%'} OR b."couponCode" ILIKE ${'%' + q.q + '%'})`);
  const having =
    q.status === 'pending'
      ? Prisma.sql`HAVING COUNT(*) > COUNT(b."openedAt")`
      : q.status === 'opened'
        ? Prisma.sql`HAVING COUNT(*) = COUNT(b."openedAt")`
        : Prisma.empty;
  const offset = (q.page - 1) * q.size;
  const rows = await db.$queryRaw<CampaignRow[]>`
    SELECT ${keySql()} AS "key",
           MIN(b."title") AS "title",
           MIN(b."createdAt") AS "createdAt",
           MIN(b."sentByUserId") AS "senderId",
           COUNT(*) AS "recipients",
           COUNT(b."openedAt") AS "opened",
           MAX(b."points") AS "pointsPerBox",
           COALESCE(SUM(b."points"), 0) AS "totalPoints",
           COALESCE(SUM(b."points") FILTER (WHERE b."openedAt" IS NULL), 0) AS "pendingPoints",
           MIN(b."couponCode") AS "couponCode",
           BOOL_OR(b."metadata"->>'campaignId' IS NULL) AS "legacy",
           COUNT(*) OVER() AS "total"
    FROM "UserSurpriseBox" b
    WHERE ${Prisma.join(where, ' AND ')}
    GROUP BY 1
    ${having}
    ORDER BY MIN(b."createdAt") DESC, 1 DESC
    LIMIT ${q.size} OFFSET ${offset}`;
  const senders = await senderNames(db, rows.map((r) => r.senderId));
  let total = rows.length > 0 ? num(rows[0].total) : 0;
  if (rows.length === 0 && q.page > 1) {
    // Son sayfanın ötesi: toplamı ayrıca say (boş sayfa "kayıt yok" sanılmasın).
    const c = await db.$queryRaw<Array<{ n: unknown }>>`
      SELECT COUNT(*) AS "n" FROM (
        SELECT 1 FROM "UserSurpriseBox" b WHERE ${Prisma.join(where, ' AND ')} GROUP BY ${keySql()} ${having}
      ) t`;
    total = num(c[0]?.n);
  }
  return { items: rows.map((r) => toItem(r, senders)), total, page: q.page, size: q.size };
}

// ───────────────────────── KPI'lar ─────────────────────────

export async function getStats(adminId: string, now: Date = new Date(), db: Db = prisma): Promise<SurpriseStats> {
  const month = istanbulMonthStart(now);
  const d30 = istanbulDayStart(now, 29);
  const d14 = istanbulDayStart(now, 13);

  const [controls, usedToday, giftRows, dailyRows, histogram, series] = await Promise.all([
    getModuleControls(),
    sentTodayBySender(db, adminId, now),
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        COUNT(DISTINCT ${keySql()}) FILTER (WHERE b."createdAt" >= ${month}) AS "campaignsMonth",
        COUNT(*) FILTER (WHERE b."createdAt" >= ${month}) AS "boxesMonth",
        COUNT(*) FILTER (WHERE b."createdAt" >= ${d30}) AS "boxes30d",
        COUNT(*) FILTER (WHERE b."createdAt" >= ${d30} AND b."openedAt" IS NOT NULL) AS "opened30d",
        COALESCE(SUM(b."points") FILTER (WHERE b."openedAt" >= ${d30}), 0) AS "pointsOpened30d",
        COALESCE(SUM(b."points") FILTER (WHERE b."openedAt" IS NULL), 0) AS "pendingPoints",
        COUNT(*) FILTER (WHERE b."openedAt" IS NULL) AS "pendingBoxes"
      FROM "UserSurpriseBox" b
      WHERE b."dayKey" IS NULL AND b."withdrawnAt" IS NULL`,
    db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT COUNT(*) AS "generated",
             COUNT(b."openedAt") AS "opened",
             COALESCE(SUM(b."points") FILTER (WHERE b."openedAt" IS NOT NULL), 0) AS "points"
      FROM "UserSurpriseBox" b
      WHERE b."dayKey" IS NOT NULL AND b."createdAt" >= ${d30}`,
    db.$queryRaw<Array<{ points: unknown; n: unknown }>>`
      SELECT b."points" AS "points", COUNT(*) AS "n"
      FROM "UserSurpriseBox" b
      WHERE b."dayKey" IS NOT NULL AND b."createdAt" >= ${d30}
      GROUP BY b."points"`,
    db.$queryRaw<Array<{ day: string; generated: unknown; opened: unknown }>>`
      SELECT b."dayKey" AS "day", COUNT(*) AS "generated", COUNT(b."openedAt") AS "opened"
      FROM "UserSurpriseBox" b
      WHERE b."dayKey" IS NOT NULL AND b."createdAt" >= ${d14}
      GROUP BY b."dayKey"`,
  ]);

  const g = giftRows[0] ?? {};
  const boxes30d = num(g.boxes30d);
  const opened30d = num(g.opened30d);
  const d = dailyRows[0] ?? {};
  const generated = num(d.generated);
  const dOpened = num(d.opened);

  const observed: Record<CosmeticRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const h of histogram) observed[boxTier({ points: num(h.points) })] += num(h.n);
  const { rows: tiers, drift } = tierTable(observed);

  const byDay = new Map(series.map((s) => [s.day, s]));
  const series14d: SurpriseStats['daily']['series14d'] = [];
  for (let i = 13; i >= 0; i--) {
    const key = istanbulDayKey(istanbulDayStart(now, i));
    const s = byDay.get(key);
    series14d.push({ day: key, generated: num(s?.generated), opened: num(s?.opened) });
  }

  return {
    moduleEnabled: (controls as Record<string, unknown>).surprise_boxes !== false,
    limits: SURPRISE_BOX_LIMITS,
    remainingToday: Math.max(0, SURPRISE_BOX_LIMITS.dailySenderBudget - usedToday),
    gifts: {
      campaignsMonth: num(g.campaignsMonth),
      boxesMonth: num(g.boxesMonth),
      boxes30d,
      opened30d,
      openRate30d: boxes30d > 0 ? Math.round((opened30d / boxes30d) * 1000) / 10 : null,
      pointsOpened30d: num(g.pointsOpened30d),
      pendingPoints: num(g.pendingPoints),
      pendingBoxes: num(g.pendingBoxes),
    },
    daily: {
      generated30d: generated,
      opened30d: dOpened,
      openRate30d: generated > 0 ? Math.round((dOpened / generated) * 1000) / 10 : null,
      points30d: num(d.points),
      series14d,
      tiers,
      drift,
      pointsRange: { min: DAILY_BOX_MIN_POINTS, max: DAILY_BOX_MAX_POINTS },
    },
  };
}

// ───────────────────────── Kampanya ayrıntısı ─────────────────────────

const BOX_SELECT = {
  id: true,
  userId: true,
  title: true,
  message: true,
  couponCode: true,
  points: true,
  rewardType: true,
  metadata: true,
  openedAt: true,
  createdAt: true,
  sentByUserId: true,
  user: { select: { name: true, email: true } },
} as const;

function campaignIdOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, unknown>).campaignId;
  return typeof v === 'string' ? v : null;
}

async function campaignBoxes(db: Db | Prisma.TransactionClient, key: string) {
  const rows = await db.userSurpriseBox.findMany({
    where: {
      dayKey: null,
      withdrawnAt: null,
      OR: [{ metadata: { path: ['campaignId'], equals: key } }, { id: key }],
    },
    select: BOX_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: SURPRISE_BOX_LIMITS.maxRecipients + 1,
  });
  // `id` eşleşmesi yalnız kampanya kimliği olmayan eski tekil kutu için geçerli.
  return rows.filter((r) => campaignIdOf(r.metadata) === key || (r.id === key && campaignIdOf(r.metadata) === null));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function auditSummary(action: string, data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('tr-TR') : '—');
  if (action === 'SURPRISE_BOX_SEND') return `${fmt(d.recipientCount)} alıcı · ${fmt(d.totalPoints)} puan`;
  if (action === 'SURPRISE_BOX_REVOKE') {
    return `${fmt(d.revoked)} kutu · ${fmt(d.pointsReleased)} puan${typeof d.reason === 'string' ? ` · Gerekçe: ${d.reason}` : ''}`;
  }
  return null;
}

export async function getCampaign(key: string, db: Db = prisma): Promise<CampaignDetail> {
  const [boxes, audits] = await Promise.all([
    campaignBoxes(db, key),
    db.auditLog.findMany({
      where: { entity: 'SurpriseBoxCampaign', entityId: key },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, action: true, createdAt: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  const sendAudit = audits.find((a) => a.action === 'SURPRISE_BOX_SEND');
  if (boxes.length === 0 && !sendAudit) throw new ApiError('NOT_FOUND', 'Kampanya bulunamadı.');

  const first = boxes[0];
  const sendData = (sendAudit?.newData ?? {}) as Record<string, unknown>;
  const senderId = first?.sentByUserId ?? null;
  const senders = await senderNames(db, [senderId]);
  const opened = boxes.filter((b) => b.openedAt);
  const pointsPerBox = first ? Math.max(...boxes.map((b) => b.points)) : num(sendData.pointsPerBox);
  const couponCode = first?.couponCode ?? (typeof sendData.couponCode === 'string' ? sendData.couponCode : null);

  return {
    campaign: {
      id: key,
      title: first?.title ?? (typeof sendData.title === 'string' ? sendData.title : 'Sürpriz kutu'),
      message: first?.message ?? null,
      rewardType: first?.rewardType ?? null,
      createdAt: (first?.createdAt ?? sendAudit!.createdAt).toISOString(),
      sender: senderId ? { id: senderId, name: senders.get(senderId) ?? null } : null,
      recipients: boxes.length,
      opened: opened.length,
      pointsPerBox,
      totalPoints: boxes.reduce((a, b) => a + b.points, 0),
      pendingPoints: boxes.filter((b) => !b.openedAt).reduce((a, b) => a + b.points, 0),
      couponCode,
      legacy: !!first && campaignIdOf(first.metadata) === null,
      state: campaignState(boxes.length, opened.length),
      tier: boxTier({ points: pointsPerBox, couponCode }),
    },
    recipients: boxes.map((b) => ({
      boxId: b.id,
      userId: b.userId,
      name: b.user?.name ?? null,
      email: b.user?.email ?? null,
      openedAt: b.openedAt?.toISOString() ?? null,
    })),
    medianOpenHours: (() => {
      const m = median(opened.map((b) => (b.openedAt!.getTime() - b.createdAt.getTime()) / 3_600_000));
      return m === null ? null : Math.round(m * 10) / 10;
    })(),
    audit: audits.map((a) => {
      const snap = (a.actorSnapshot ?? {}) as Record<string, unknown>;
      return {
        id: a.id,
        action: a.action,
        at: a.createdAt.toISOString(),
        actorName: a.user?.name || a.user?.email || (typeof snap.name === 'string' ? snap.name : null) || (typeof snap.email === 'string' ? snap.email : null),
        summary: auditSummary(a.action, a.newData),
      };
    }),
  };
}

// ───────────────────────── Geri çekme ─────────────────────────

export async function revokeCampaign(
  key: string,
  reason: string,
  actor: AuditActor,
  request: ReqLike,
  db: Db = prisma
): Promise<{ revoked: number; pointsReleased: number }> {
  return db.$transaction(async (tx) => {
    const boxes = await campaignBoxes(tx, key);
    if (boxes.length === 0) throw new ApiError('NOT_FOUND', 'Kampanya bulunamadı.');
    const pending = boxes.filter((b) => !b.openedAt);
    if (pending.length === 0) throw new ApiError('CONFLICT', 'Geri çekilecek açılmamış kutu yok; hepsi açılmış.');

    const ids = pending.map((b) => b.id);
    // SİLME YOK — geri çekme (withdraw): satır denetim için kalır, listelerden ve müşteriden
    // gizlenir, açılamaz. Koşullu: arada açılan kutu geri çekilmez (açılış kazanır).
    const withdrawnAt = new Date();
    const del = await tx.userSurpriseBox.updateMany({
      where: { id: { in: ids }, openedAt: null, withdrawnAt: null },
      data: { withdrawnAt, withdrawnById: actor.id ?? null, withdrawReason: reason.slice(0, 500) },
    });
    const stillPending = await tx.userSurpriseBox.findMany({
      where: { id: { in: ids }, withdrawnAt: null },
      select: { id: true },
    });
    const goneIds = new Set(ids.filter((id) => !stillPending.some((s) => s.id === id)));
    const revokedBoxes = pending.filter((b) => goneIds.has(b.id));
    const pointsReleased = revokedBoxes.reduce((a, b) => a + b.points, 0);

    if (revokedBoxes.length > 0) {
      const campaignId = campaignIdOf(revokedBoxes[0].metadata);
      if (campaignId) {
        await tx.notification.deleteMany({
          where: { userId: { in: revokedBoxes.map((b) => b.userId) }, data: { path: ['campaignId'], equals: campaignId } },
        });
      }
    }

    await tx.auditLog.create({
      data: auditEntry(
        actor,
        {
          action: 'SURPRISE_BOX_REVOKE',
          entity: 'SurpriseBoxCampaign',
          entityId: key,
          oldData: {
            boxes: revokedBoxes.map((b) => ({ id: b.id, userId: b.userId, points: b.points, couponCode: b.couponCode, title: b.title, createdAt: b.createdAt })),
          },
          newData: { revoked: del.count, pointsReleased, reason, withdrawnAt: withdrawnAt.toISOString(), mode: 'withdraw' },
        },
        request
      ),
    });
    return { revoked: del.count, pointsReleased };
  });
}

// ───────────────────────── Seçiciler ─────────────────────────

/** Alıcı araması: yalnız müşteriler; gönderilemeyecek hesaplar gerekçesiyle işaretlenir. */
export async function searchRecipients(q: string, db: Db = prisma): Promise<RecipientOption[]> {
  const rows = await db.user.findMany({
    where: {
      role: 'CUSTOMER',
      OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { id: q }],
    },
    select: { id: true, name: true, email: true, suspendedAt: true, anonymizedAt: true, fraudStatus: true },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    blocked: u.suspendedAt
      ? 'Askıda'
      : u.anonymizedAt
        ? 'Anonimleştirilmiş'
        : u.fraudStatus === 'shadow_ban'
          ? 'Dolandırıcılık incelemesinde'
          : null,
  }));
}

/** Kutuya eklenebilecek kuponlar: aktif, süresi geçmemiş, kullanım hakkı kalan. */
export async function usableCoupons(now: Date = new Date(), db: Db = prisma): Promise<CouponOption[]> {
  const rows = await db.coupon.findMany({
    where: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, code: true, type: true, value: true, maxUses: true, usedCount: true, expiresAt: true },
  });
  return rows
    .filter((c) => c.maxUses === -1 || c.usedCount < c.maxUses)
    .map((c) => ({
      id: c.id,
      code: c.code,
      label: c.type === 'percentage' ? `%${c.value} indirim` : `${c.value.toLocaleString('tr-TR')} ₺ indirim`,
      remaining: c.maxUses === -1 ? null : c.maxUses - c.usedCount,
      expiresAt: c.expiresAt?.toISOString() ?? null,
    }));
}

/**
 * Gönderim öncesi kupon doğrulaması: kod Coupon tablosunda olmalı, aktif, süresi geçmemiş ve
 * kalan kullanım hakkı alıcı sayısını karşılamalı. Kod normalize (büyük harf) döner.
 */
export async function validateBoxCoupon(
  raw: string | undefined,
  recipientCount: number,
  now: Date = new Date(),
  db: Db = prisma
): Promise<{ ok: true; code: string | null } | { ok: false; message: string }> {
  const code = raw?.trim().toUpperCase();
  if (!code) return { ok: true, code: null };
  const c = await db.coupon.findUnique({ where: { code }, select: { isActive: true, expiresAt: true, maxUses: true, usedCount: true } });
  if (!c) return { ok: false, message: `"${code}" kodlu bir kupon yok. Önce Kuponlar sayfasında oluşturun.` };
  if (!c.isActive) return { ok: false, message: `"${code}" kuponu pasif.` };
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) return { ok: false, message: `"${code}" kuponunun süresi dolmuş.` };
  if (c.maxUses !== -1) {
    const left = Math.max(0, c.maxUses - c.usedCount);
    if (left < recipientCount) {
      return { ok: false, message: `"${code}" kuponunda ${left.toLocaleString('tr-TR')} kullanım hakkı kaldı; ${recipientCount.toLocaleString('tr-TR')} alıcıya yetmez.` };
    }
  }
  return { ok: true, code };
}

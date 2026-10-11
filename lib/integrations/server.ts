/**
 * Entegrasyon Merkezi sunucu servisi — API anahtarları, webhook'lar, partnerler, özet.
 *
 * İlkeler: yetki route'ta (defineRoute + ADMIN + gizli kapı requireAuth içinde), mutasyon +
 * denetim kaydı AYNI transaction'da, fiziksel silme yok (anahtar → iptal, webhook/partner →
 * arşiv), ham anahtar ve webhook sırrı yalnız üretim anında bir kez döner, hata görünür
 * (ApiError → zarf), zaman Europe/Istanbul.
 */
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { redisGetJson, isRedisConfigured } from '@/lib/redis';
import { hashApiKey, usageKey } from '@/lib/partner-api-auth';
import {
  WEBHOOK_EVENTS,
  isLiveWebhookEvent,
  partnerTypeLabel,
  type ApiKeyCreated,
  type ApiKeyDetail,
  type ApiKeyItem,
  type AuditEntry,
  type CreateKeyInput,
  type CreatePartnerInput,
  type CreateWebhookInput,
  type DealerOption,
  type DeliveryItem,
  type DeliveryPage,
  type DeliveryResult,
  type IntegrationsOverview,
  type KeyListParams,
  type Paged,
  type PartnerDetail,
  type PartnerItem,
  type PartnerListParams,
  type UpdateKeyInput,
  type UpdatePartnerInput,
  type UpdateWebhookInput,
  type WebhookCreated,
  type WebhookDetail,
  type WebhookHealth,
  type WebhookItem,
  type WebhookListParams,
} from './contract';
import {
  keyDisplay,
  keyLifecycle,
  parseKeyMeta,
  parsePartnerMeta,
  parseWebhookMeta,
  serializeKeyMeta,
  serializePartnerMeta,
  serializeWebhookMeta,
  webhookStatus,
  type KeyMeta,
  type WebhookMeta,
} from './meta';
import { generateWebhookSecret, sealSecret, secretHintOf } from './secret-box';
import { assertSafeWebhookUrl } from './url-safety';
import { lastIstanbulDays } from './time';
import { deliverWithRetry, logDeliveries, testEventBody } from '@/lib/webhook-dispatch';

type Db = typeof prisma;
type Tx = Prisma.TransactionClient;

export type Actor = { id: string; email: string | null; role: string | null; name: string | null };
export type Ctx = { actor: Actor; request: Request | { headers: { get(n: string): string | null } } };

const DAY = 86_400_000;
const LIST_CAP = 2000;

// ───────────────────────────── Ortak ─────────────────────────────

async function audit(
  tx: Tx | Db,
  ctx: Ctx,
  action: string,
  entity: string,
  entityId: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null
) {
  const meta = getAuditRequestMeta(ctx.request as Parameters<typeof getAuditRequestMeta>[0]);
  await tx.auditLog.create({
    data: {
      userId: ctx.actor.id,
      actorType: 'user',
      actorSnapshot: { email: ctx.actor.email, role: ctx.actor.role, name: ctx.actor.name } as object,
      action,
      entity,
      entityId,
      ...(oldData ? { oldData: oldData as object } : {}),
      ...(newData ? { newData: newData as object } : {}),
      ...meta,
    },
  });
}

const AUDIT_LABEL: Record<string, string> = {
  CREATE_API_KEY: 'Anahtar oluşturuldu',
  UPDATE_API_KEY: 'Anahtar güncellendi',
  REVOKE_API_KEY: 'Anahtar iptal edildi',
  ROLL_API_KEY: 'Anahtar döndürüldü',
  DELETE_API_KEY: 'Anahtar silindi (eski)',
  CREATE_WEBHOOK: 'Webhook oluşturuldu',
  UPDATE_WEBHOOK: 'Webhook güncellendi',
  ROTATE_WEBHOOK_SECRET: 'İmza sırrı döndürüldü',
  TEST_WEBHOOK: 'Test olayı gönderildi',
  RESEND_WEBHOOK_DELIVERY: 'Teslim yeniden gönderildi',
  AUTO_PAUSE_WEBHOOK: 'Otomatik duraklatıldı (art arda hata)',
  DELETE_WEBHOOK: 'Webhook silindi (eski)',
  CREATE_PARTNER: 'Partner oluşturuldu',
  UPDATE_PARTNER: 'Partner güncellendi',
};

async function auditTrail(entity: string, entityIds: string[], take = 30): Promise<AuditEntry[]> {
  if (entityIds.length === 0) return [];
  const rows = await prisma.auditLog.findMany({
    where: { entity, entityId: { in: entityIds } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, action: true, createdAt: true, newData: true, actorType: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
  });
  return rows.map((r) => {
    const snap = (r.actorSnapshot ?? {}) as Record<string, unknown>;
    const nd = (r.newData ?? {}) as Record<string, unknown>;
    const actor =
      r.user?.name || r.user?.email || (typeof snap.name === 'string' && snap.name) || (typeof snap.email === 'string' && snap.email) || (r.actorType === 'system' ? 'Sistem' : null);
    const detail = typeof nd.reason === 'string' ? nd.reason : Array.isArray(nd.changed) ? `Değişen: ${(nd.changed as string[]).join(', ')}` : null;
    return { id: r.id, action: r.action, label: AUDIT_LABEL[r.action] ?? r.action, at: r.createdAt.toISOString(), actor: actor || null, detail };
  });
}

async function dealerLabels(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, businessName: true, name: true, email: true } });
  return new Map(rows.map((u) => [u.id, u.businessName || u.name || u.email || u.id]));
}

async function partnerNames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const rows = await prisma.partner.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(rows.map((p) => [p.id, p.name]));
}

async function assertDealers(ids: string[]): Promise<void> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return;
  const found = await prisma.user.count({ where: { id: { in: uniq }, role: 'DEALER' } });
  if (found !== uniq.length) throw new ApiError('VALIDATION', 'Seçilen bayilerden en az biri bulunamadı.', { details: [{ path: 'dealerIds', message: 'Bayi bulunamadı' }] });
}

async function assertPartnerUsable(partnerId: string): Promise<void> {
  const p = await prisma.partner.findUnique({ where: { id: partnerId }, select: { isActive: true, metadata: true } });
  if (!p) throw new ApiError('VALIDATION', 'Partner bulunamadı.', { details: [{ path: 'partnerId', message: 'Partner bulunamadı' }] });
  if (!p.isActive || parsePartnerMeta(p.metadata).archivedAt) throw new ApiError('CONFLICT', 'Pasif ya da arşivlenmiş partnere kayıt bağlanamaz.');
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

// ───────────────────────────── API anahtarları ─────────────────────────────

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scope: Prisma.JsonValue;
  lastUsedAt: Date | null;
  createdAt: Date;
  createdBy: { name: string | null; email: string } | null;
};

const KEY_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  scope: true,
  lastUsedAt: true,
  createdAt: true,
  createdBy: { select: { name: true, email: true } },
} as const;

export function toKeyItem(row: KeyRow, refs: { dealers: Map<string, string>; partners: Map<string, string> }, now = new Date()): ApiKeyItem {
  const m = parseKeyMeta(row.scope);
  return {
    id: row.id,
    name: row.name,
    display: keyDisplay(row.keyPrefix, m.suffix),
    scopes: m.scopes,
    scopeless: m.scopes.length === 0,
    status: keyLifecycle(m, now),
    dealer: m.dealerId ? { id: m.dealerId, label: refs.dealers.get(m.dealerId) ?? 'Silinmiş bayi' } : null,
    partner: m.partnerId ? { id: m.partnerId, label: refs.partners.get(m.partnerId) ?? 'Silinmiş partner' } : null,
    expiresAt: m.expiresAt,
    revokedAt: m.revokedAt,
    revokeReason: m.revokeReason,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy ? row.createdBy.name || row.createdBy.email : null,
    ipAllowlist: m.ipAllowlist,
    rolledToId: m.rolledToId,
  };
}

async function keyRefs(rows: KeyRow[]) {
  const metas = rows.map((r) => parseKeyMeta(r.scope));
  const [dealers, partners] = await Promise.all([
    dealerLabels(metas.map((m) => m.dealerId ?? '')),
    partnerNames(metas.map((m) => m.partnerId ?? '')),
  ]);
  return { dealers, partners };
}

export async function listKeys(p: KeyListParams, now = new Date()): Promise<Paged<ApiKeyItem>> {
  const q = p.q?.toLowerCase();
  const rows = (await prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' }, take: LIST_CAP, select: KEY_SELECT })) as KeyRow[];
  const filtered = rows.filter((r) => {
    const m = parseKeyMeta(r.scope);
    if (p.status !== 'all' && keyLifecycle(m, now) !== p.status) return false;
    if (p.partnerId && m.partnerId !== p.partnerId) return false;
    if (q && !r.name.toLowerCase().includes(q) && !r.keyPrefix.toLowerCase().includes(q)) return false;
    return true;
  });
  const pageRows = filtered.slice((p.page - 1) * p.size, p.page * p.size);
  const refs = await keyRefs(pageRows);
  return { items: pageRows.map((r) => toKeyItem(r, refs, now)), total: filtered.length, page: p.page, size: p.size };
}

export function newRawKey(): { raw: string; prefix: string; suffix: string; hash: string } {
  const raw = `qrx_${randomBytes(32).toString('base64url')}`;
  return { raw, prefix: raw.slice(0, 12), suffix: raw.slice(-4), hash: hashApiKey(raw) };
}

async function loadKey(id: string): Promise<KeyRow> {
  const row = (await prisma.apiKey.findUnique({ where: { id }, select: KEY_SELECT })) as KeyRow | null;
  if (!row) throw new ApiError('NOT_FOUND', 'API anahtarı bulunamadı.');
  return row;
}

export async function createKey(ctx: Ctx, input: CreateKeyInput, now = new Date()): Promise<ApiKeyCreated> {
  if (input.dealerId) await assertDealers([input.dealerId]);
  if (input.partnerId) await assertPartnerUsable(input.partnerId);
  const k = newRawKey();
  const meta: KeyMeta = {
    scopes: [...new Set(input.scopes)],
    dealerId: input.dealerId ?? null,
    partnerId: input.partnerId ?? null,
    expiresAt: input.expiresInDays ? new Date(now.getTime() + input.expiresInDays * DAY).toISOString() : null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    suffix: k.suffix,
    ipAllowlist: input.ipAllowlist ?? [],
    rolledFromId: null,
    rolledToId: null,
  };
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.apiKey.create({
      data: { name: input.name, keyHash: k.hash, keyPrefix: k.prefix, scope: serializeKeyMeta(meta) as object, createdById: ctx.actor.id },
      select: KEY_SELECT,
    });
    await audit(tx, ctx, 'CREATE_API_KEY', 'ApiKey', created.id, null, {
      name: created.name,
      keyPrefix: created.keyPrefix,
      scopes: meta.scopes,
      dealerId: meta.dealerId,
      partnerId: meta.partnerId,
      expiresAt: meta.expiresAt,
    });
    return created as KeyRow;
  });
  const refs = await keyRefs([row]);
  return { key: toKeyItem(row, refs, now), rawKey: k.raw };
}

export async function updateKey(ctx: Ctx, id: string, input: UpdateKeyInput, now = new Date()): Promise<ApiKeyItem> {
  const row = await loadKey(id);
  const before = parseKeyMeta(row.scope);
  if (keyLifecycle(before, now) === 'revoked') throw new ApiError('CONFLICT', 'İptal edilmiş anahtar düzenlenemez.');
  if (input.dealerId) await assertDealers([input.dealerId]);
  if (input.partnerId) await assertPartnerUsable(input.partnerId);
  const after: KeyMeta = {
    ...before,
    ...(input.scopes ? { scopes: [...new Set(input.scopes)] } : {}),
    ...(input.dealerId !== undefined ? { dealerId: input.dealerId } : {}),
    ...(input.partnerId !== undefined ? { partnerId: input.partnerId } : {}),
    ...(input.ipAllowlist ? { ipAllowlist: input.ipAllowlist } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  };
  const name = input.name ?? row.name;
  const changed = changedFields({ ...before, name: row.name }, { ...after, name });
  if (changed.length === 0) return toKeyItem(row, await keyRefs([row]), now);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.apiKey.update({ where: { id }, data: { name, scope: serializeKeyMeta(after) as object }, select: KEY_SELECT });
    await audit(tx, ctx, 'UPDATE_API_KEY', 'ApiKey', id, { name: row.name, scopes: before.scopes, dealerId: before.dealerId, partnerId: before.partnerId, expiresAt: before.expiresAt, ipAllowlist: before.ipAllowlist }, {
      name,
      scopes: after.scopes,
      dealerId: after.dealerId,
      partnerId: after.partnerId,
      expiresAt: after.expiresAt,
      ipAllowlist: after.ipAllowlist,
      changed,
    });
    return u as KeyRow;
  });
  return toKeyItem(updated, await keyRefs([updated]), now);
}

export async function revokeKey(ctx: Ctx, id: string, reason: string, now = new Date()): Promise<ApiKeyItem> {
  const row = await loadKey(id);
  const meta = parseKeyMeta(row.scope);
  if (meta.revokedAt) throw new ApiError('CONFLICT', 'Bu anahtar zaten iptal edilmiş.');
  const next: KeyMeta = { ...meta, revokedAt: now.toISOString(), revokedById: ctx.actor.id, revokeReason: reason };
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.apiKey.update({ where: { id }, data: { scope: serializeKeyMeta(next) as object }, select: KEY_SELECT });
    await audit(tx, ctx, 'REVOKE_API_KEY', 'ApiKey', id, { name: row.name, keyPrefix: row.keyPrefix }, { reason });
    return u as KeyRow;
  });
  return toKeyItem(updated, await keyRefs([updated]), now);
}

/** Yeni anahtar üret; eskisi `graceHours` sonra geçersiz (0 → hemen iptal). */
export async function rollKey(ctx: Ctx, id: string, graceHours: number, now = new Date()): Promise<ApiKeyCreated & { previous: ApiKeyItem }> {
  const row = await loadKey(id);
  const meta = parseKeyMeta(row.scope);
  if (keyLifecycle(meta, now) !== 'active') throw new ApiError('CONFLICT', 'Yalnız etkin anahtar döndürülebilir.');
  if (meta.partnerId) await assertPartnerUsable(meta.partnerId);
  const k = newRawKey();
  const graceEnd = new Date(now.getTime() + graceHours * 3_600_000).toISOString();
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.apiKey.create({
      data: {
        name: row.name,
        keyHash: k.hash,
        keyPrefix: k.prefix,
        createdById: ctx.actor.id,
        scope: serializeKeyMeta({ ...meta, suffix: k.suffix, rolledFromId: id, rolledToId: null, revokedAt: null, revokedById: null, revokeReason: null }) as object,
      },
      select: KEY_SELECT,
    });
    const oldNext: KeyMeta =
      graceHours === 0
        ? { ...meta, rolledToId: created.id, revokedAt: now.toISOString(), revokedById: ctx.actor.id, revokeReason: 'Döndürüldü (ek süresiz)' }
        : { ...meta, rolledToId: created.id, expiresAt: meta.expiresAt && Date.parse(meta.expiresAt) < Date.parse(graceEnd) ? meta.expiresAt : graceEnd };
    const old = await tx.apiKey.update({ where: { id }, data: { scope: serializeKeyMeta(oldNext) as object }, select: KEY_SELECT });
    await audit(tx, ctx, 'ROLL_API_KEY', 'ApiKey', id, { keyPrefix: row.keyPrefix }, { newKeyId: created.id, newKeyPrefix: created.keyPrefix, graceHours, reason: `Yeni anahtar ${created.keyPrefix}…; eski ${graceHours} saat geçerli` });
    await audit(tx, ctx, 'CREATE_API_KEY', 'ApiKey', created.id, null, { name: created.name, keyPrefix: created.keyPrefix, rolledFromId: id, scopes: meta.scopes });
    return { created: created as KeyRow, old: old as KeyRow };
  });
  const refs = await keyRefs([result.created, result.old]);
  return { key: toKeyItem(result.created, refs, now), rawKey: k.raw, previous: toKeyItem(result.old, refs, now) };
}

export async function keyUsage(id: string, now = new Date()): Promise<ApiKeyDetail['usage']> {
  if (!isRedisConfigured()) return null;
  const days = lastIstanbulDays(14, now);
  const values = await Promise.all(
    days.flatMap((d) => [redisGetJson<number>(usageKey(id, d, 'ok')), redisGetJson<number>(usageKey(id, d, 'denied'))])
  );
  return days.map((day, i) => ({ day, ok: Number(values[i * 2] ?? 0) || 0, denied: Number(values[i * 2 + 1] ?? 0) || 0 }));
}

export async function getKeyDetail(id: string, now = new Date()): Promise<ApiKeyDetail> {
  const row = await loadKey(id);
  const [refs, usage, trail] = await Promise.all([keyRefs([row]), keyUsage(id, now), auditTrail('ApiKey', [id])]);
  return { key: toKeyItem(row, refs, now), usage, audit: trail };
}

// ───────────────────────────── Webhook istatistikleri ─────────────────────────────

const EMPTY_HEALTH: WebhookHealth = { total: 0, ok: 0, failed: 0, lastAt: null, lastStatus: null, lastError: null };

type StatRow = { webhookId: string; total: number; ok: number; lastAt: Date | null };
type LastRow = { webhookId: string; status: string | null; error: string | null; createdAt: Date };

/** Webhook başına pencere istatistiği (test teslimleri hariç). SQL'de toplanır. */
export async function webhookStats(sinceMs: number, now = new Date()): Promise<Map<string, WebhookHealth>> {
  const since = new Date(now.getTime() - sinceMs);
  const [agg, last] = await Promise.all([
    prisma.$queryRaw<StatRow[]>(Prisma.sql`
      SELECT data->>'webhookId' AS "webhookId",
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE data->>'ok' = 'true')::int AS ok,
             MAX("createdAt") AS "lastAt"
        FROM "AnalyticsEvent"
       WHERE event = 'webhook_delivery' AND category = 'webhook' AND "createdAt" >= ${since}
         AND COALESCE(data->>'test', 'false') <> 'true'
       GROUP BY 1`),
    prisma.$queryRaw<LastRow[]>(Prisma.sql`
      SELECT DISTINCT ON (data->>'webhookId') data->>'webhookId' AS "webhookId",
             data->>'status' AS status, data->>'error' AS error, "createdAt"
        FROM "AnalyticsEvent"
       WHERE event = 'webhook_delivery' AND category = 'webhook' AND "createdAt" >= ${since}
         AND COALESCE(data->>'test', 'false') <> 'true'
       ORDER BY data->>'webhookId', "createdAt" DESC`),
  ]);
  const lastBy = new Map(last.map((l) => [l.webhookId, l]));
  const out = new Map<string, WebhookHealth>();
  for (const a of agg) {
    const l = lastBy.get(a.webhookId);
    const status = l?.status != null && /^\d+$/.test(l.status) ? Number(l.status) : null;
    out.set(a.webhookId, {
      total: Number(a.total),
      ok: Number(a.ok),
      failed: Number(a.total) - Number(a.ok),
      lastAt: a.lastAt ? new Date(a.lastAt).toISOString() : null,
      lastStatus: status,
      lastError: l?.error ?? null,
    });
  }
  return out;
}

// ───────────────────────────── Webhook'lar ─────────────────────────────

type WebhookRow = {
  id: string;
  url: string;
  secret: string | null;
  events: Prisma.JsonValue;
  isActive: boolean;
  createdAt: Date;
  createdBy: { name: string | null; email: string } | null;
};

const WEBHOOK_SELECT = {
  id: true,
  url: true,
  secret: true,
  events: true,
  isActive: true,
  createdAt: true,
  createdBy: { select: { name: true, email: true } },
} as const;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function toWebhookItem(
  row: WebhookRow,
  ctx: { partners: Map<string, string>; h24: Map<string, WebhookHealth>; h7: Map<string, WebhookHealth> }
): WebhookItem {
  const m = parseWebhookMeta(row.events);
  return {
    id: row.id,
    url: row.url,
    host: hostOf(row.url),
    events: m.events.filter(isLiveWebhookEvent),
    deadEvents: m.events.filter((e) => !isLiveWebhookEvent(e)),
    description: m.description,
    status: webhookStatus(row.isActive, m),
    disabledReason: row.isActive ? null : m.disabledReason,
    hasSecret: Boolean(row.secret),
    secretHint: m.secretHint ?? (row.secret && !row.secret.startsWith('enc:') ? secretHintOf(row.secret) : null),
    partner: m.partnerId ? { id: m.partnerId, label: ctx.partners.get(m.partnerId) ?? 'Silinmiş partner' } : null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy ? row.createdBy.name || row.createdBy.email : null,
    health24h: ctx.h24.get(row.id) ?? EMPTY_HEALTH,
    health7d: ctx.h7.get(row.id) ?? EMPTY_HEALTH,
  };
}

async function webhookCtx(rows: WebhookRow[], now = new Date()) {
  const [partners, h24, h7] = await Promise.all([
    partnerNames(rows.map((r) => parseWebhookMeta(r.events).partnerId ?? '')),
    webhookStats(DAY, now),
    webhookStats(7 * DAY, now),
  ]);
  return { partners, h24, h7 };
}

export async function listWebhooks(p: WebhookListParams, now = new Date()): Promise<WebhookItem[]> {
  const q = p.q?.toLowerCase();
  const rows = (await prisma.webhook.findMany({ orderBy: { createdAt: 'desc' }, take: 500, select: WEBHOOK_SELECT })) as WebhookRow[];
  const filtered = rows.filter((r) => {
    const m = parseWebhookMeta(r.events);
    const st = webhookStatus(r.isActive, m);
    if (p.status !== 'all' && st !== p.status) return false;
    if (p.partnerId && m.partnerId !== p.partnerId) return false;
    if (q && !r.url.toLowerCase().includes(q) && !(m.description ?? '').toLowerCase().includes(q)) return false;
    return true;
  });
  const c = await webhookCtx(filtered, now);
  return filtered.map((r) => toWebhookItem(r, c));
}

async function loadWebhook(id: string): Promise<WebhookRow> {
  const row = (await prisma.webhook.findUnique({ where: { id }, select: WEBHOOK_SELECT })) as WebhookRow | null;
  if (!row) throw new ApiError('NOT_FOUND', 'Webhook bulunamadı.');
  return row;
}

async function assertUrlUsable(url: string, exceptId?: string): Promise<void> {
  const check = await assertSafeWebhookUrl(url);
  if (!check.ok) throw new ApiError('VALIDATION', check.reason, { details: [{ path: 'url', message: check.reason }] });
  const dupes = (await prisma.webhook.findMany({ where: { url: url.trim(), ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true, events: true } })).filter(
    (d) => !parseWebhookMeta(d.events).archivedAt
  );
  if (dupes.length > 0) throw new ApiError('CONFLICT', 'Bu adres için zaten bir webhook var; mevcut aboneliği düzenleyin.', { details: { existingId: dupes[0].id } });
}

export async function createWebhook(ctx: Ctx, input: CreateWebhookInput, now = new Date()): Promise<WebhookCreated> {
  await assertUrlUsable(input.url);
  if (input.partnerId) await assertPartnerUsable(input.partnerId);
  const secret = generateWebhookSecret();
  const meta: WebhookMeta = {
    events: [...new Set(input.events)],
    description: input.description || null,
    partnerId: input.partnerId ?? null,
    archivedAt: null,
    disabledReason: null,
    secretHint: secretHintOf(secret),
    secretRotatedAt: now.toISOString(),
  };
  const row = await prisma.$transaction(async (tx) => {
    const w = await tx.webhook.create({
      data: { url: input.url.trim(), secret: sealSecret(secret), events: serializeWebhookMeta(meta) as object, isActive: true, createdById: ctx.actor.id },
      select: WEBHOOK_SELECT,
    });
    await audit(tx, ctx, 'CREATE_WEBHOOK', 'Webhook', w.id, null, { url: w.url, events: meta.events, partnerId: meta.partnerId });
    return w as WebhookRow;
  });
  return { webhook: toWebhookItem(row, await webhookCtx([row], now)), secret };
}

export async function updateWebhook(ctx: Ctx, id: string, input: UpdateWebhookInput, now = new Date()): Promise<WebhookItem> {
  const row = await loadWebhook(id);
  const before = parseWebhookMeta(row.events);
  if (input.url && input.url.trim() !== row.url) await assertUrlUsable(input.url, id);
  if (input.partnerId) await assertPartnerUsable(input.partnerId);
  if (input.isActive === true && before.archivedAt && input.archived !== false) throw new ApiError('CONFLICT', 'Arşivdeki webhook önce arşivden çıkarılmalı.');
  const after: WebhookMeta = {
    ...before,
    ...(input.events ? { events: [...new Set(input.events)] } : {}),
    ...(input.description !== undefined ? { description: input.description || null } : {}),
    ...(input.partnerId !== undefined ? { partnerId: input.partnerId } : {}),
  };
  let isActive = row.isActive;
  if (input.archived === true) {
    after.archivedAt = now.toISOString();
    isActive = false;
    after.disabledReason = 'manual';
  } else if (input.archived === false) {
    after.archivedAt = null;
  }
  if (input.isActive !== undefined && input.archived !== true) {
    isActive = input.isActive;
    after.disabledReason = input.isActive ? null : 'manual';
  }
  const url = input.url?.trim() ?? row.url;
  const changed = changedFields(
    { url: row.url, isActive: row.isActive, events: before.events, description: before.description, partnerId: before.partnerId, archivedAt: before.archivedAt },
    { url, isActive, events: after.events, description: after.description, partnerId: after.partnerId, archivedAt: after.archivedAt }
  );
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.webhook.update({ where: { id }, data: { url, isActive, events: serializeWebhookMeta(after) as object }, select: WEBHOOK_SELECT });
    if (changed.length > 0) {
      await audit(tx, ctx, 'UPDATE_WEBHOOK', 'Webhook', id, { url: row.url, isActive: row.isActive, events: before.events }, { url, isActive, events: after.events, changed });
    }
    return u as WebhookRow;
  });
  return toWebhookItem(updated, await webhookCtx([updated], now));
}

export async function rotateWebhookSecret(ctx: Ctx, id: string, now = new Date()): Promise<WebhookCreated> {
  const row = await loadWebhook(id);
  const meta = parseWebhookMeta(row.events);
  if (meta.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki webhook için sır döndürülemez.');
  const secret = generateWebhookSecret();
  const next: WebhookMeta = { ...meta, secretHint: secretHintOf(secret), secretRotatedAt: now.toISOString() };
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.webhook.update({ where: { id }, data: { secret: sealSecret(secret), events: serializeWebhookMeta(next) as object }, select: WEBHOOK_SELECT });
    await audit(tx, ctx, 'ROTATE_WEBHOOK_SECRET', 'Webhook', id, null, { secretHint: next.secretHint });
    return u as WebhookRow;
  });
  return { webhook: toWebhookItem(updated, await webhookCtx([updated], now)), secret };
}

export async function testWebhook(ctx: Ctx, id: string, sampleEvent?: string): Promise<DeliveryResult> {
  const row = await loadWebhook(id);
  const meta = parseWebhookMeta(row.events);
  if (meta.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki webhook test edilemez.');
  const ev = WEBHOOK_EVENTS.find((e) => e.key === sampleEvent) ?? null;
  const body = testEventBody(ev?.key ?? null, ev ? { ...ev.sample } : null);
  const o = await deliverWithRetry(row, 'webhook.test', body, { maxAttempts: 1 });
  await logDeliveries([o], 'webhook.test', body, { test: true, userId: ctx.actor.id });
  await audit(prisma, ctx, 'TEST_WEBHOOK', 'Webhook', id, null, { ok: o.ok, status: o.status, reason: o.ok ? `HTTP ${o.status}` : o.error ?? 'başarısız' });
  return { ok: o.ok, status: o.status, durationMs: o.durationMs, error: o.error, errorKind: o.errorKind, responseSnippet: o.responseSnippet, deliveryId: o.deliveryId };
}

function toDelivery(r: { id: string; data: Prisma.JsonValue; createdAt: Date }, includeBody: boolean): DeliveryItem {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    id: r.id,
    webhookId: s(d.webhookId) ?? '',
    event: s(d.targetEvent) ?? 'bilinmiyor',
    ok: d.ok === true,
    status: num(d.status),
    error: s(d.error),
    errorKind: s(d.errorKind),
    durationMs: num(d.durationMs),
    attempts: num(d.attempts),
    test: d.test === true,
    resendOf: s(d.resendOf),
    hasBody: typeof d.body === 'string',
    body: includeBody ? s(d.body) : null,
    responseSnippet: s(d.responseSnippet),
    at: r.createdAt.toISOString(),
  };
}

export async function listDeliveries(webhookId: string | null, p: { status: 'all' | 'ok' | 'failed'; cursor?: string; size: number }): Promise<DeliveryPage> {
  const and: Prisma.AnalyticsEventWhereInput[] = [{ event: 'webhook_delivery' }, { category: 'webhook' }];
  if (webhookId) and.push({ data: { path: ['webhookId'], equals: webhookId } });
  if (p.status === 'ok') and.push({ data: { path: ['ok'], equals: true } });
  if (p.status === 'failed') and.push({ data: { path: ['ok'], equals: false } });
  const rows = await prisma.analyticsEvent.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: p.size + 1,
    ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    select: { id: true, data: true, createdAt: true },
  });
  const more = rows.length > p.size;
  const items = rows.slice(0, p.size).map((r) => toDelivery(r, true));
  return { items, nextCursor: more ? items[items.length - 1].id : null };
}

export async function resendDelivery(ctx: Ctx, deliveryId: string): Promise<DeliveryResult> {
  const row = await prisma.analyticsEvent.findUnique({ where: { id: deliveryId }, select: { id: true, event: true, data: true, createdAt: true } });
  if (!row || row.event !== 'webhook_delivery') throw new ApiError('NOT_FOUND', 'Teslim kaydı bulunamadı.');
  const d = toDelivery(row, true);
  if (!d.body) throw new ApiError('CONFLICT', 'Bu teslimin gövdesi saklanmamış (eski kayıt ya da 16 KB üstü); yeniden gönderilemez.');
  const wh = await loadWebhook(d.webhookId);
  const meta = parseWebhookMeta(wh.events);
  if (meta.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki webhook için yeniden gönderim yapılamaz.');
  const o = await deliverWithRetry(wh, d.event, d.body, { maxAttempts: 1 });
  await logDeliveries([o], d.event, d.body, { resendOf: deliveryId, test: d.test, userId: ctx.actor.id });
  await audit(prisma, ctx, 'RESEND_WEBHOOK_DELIVERY', 'Webhook', wh.id, null, { deliveryId, ok: o.ok, status: o.status, reason: o.ok ? `Yeniden gönderildi · HTTP ${o.status}` : o.error ?? 'başarısız' });
  return { ok: o.ok, status: o.status, durationMs: o.durationMs, error: o.error, errorKind: o.errorKind, responseSnippet: o.responseSnippet, deliveryId: o.deliveryId };
}

export async function getWebhookDetail(id: string, now = new Date()): Promise<WebhookDetail> {
  const row = await loadWebhook(id);
  const [c, trail] = await Promise.all([webhookCtx([row], now), auditTrail('Webhook', [id])]);
  return { webhook: toWebhookItem(row, c), audit: trail };
}

// ───────────────────────────── Partnerler ─────────────────────────────

type PartnerRow = {
  id: string;
  name: string;
  type: string;
  apiKeyHash: string | null;
  webhookUrl: string | null;
  metadata: Prisma.JsonValue;
  isActive: boolean;
  createdAt: Date;
};
const PARTNER_SELECT = { id: true, name: true, type: true, apiKeyHash: true, webhookUrl: true, metadata: true, isActive: true, createdAt: true } as const;

function sumHealth(items: WebhookHealth[]): WebhookHealth {
  return items.reduce<WebhookHealth>(
    (acc, h) => ({
      total: acc.total + h.total,
      ok: acc.ok + h.ok,
      failed: acc.failed + h.failed,
      lastAt: !acc.lastAt || (h.lastAt && h.lastAt > acc.lastAt) ? h.lastAt ?? acc.lastAt : acc.lastAt,
      lastStatus: acc.lastStatus ?? h.lastStatus,
      lastError: acc.lastError ?? h.lastError,
    }),
    { ...EMPTY_HEALTH }
  );
}

async function partnerItems(rows: PartnerRow[], now = new Date()): Promise<PartnerItem[]> {
  if (rows.length === 0) return [];
  const [keys, hooks, h24] = await Promise.all([
    prisma.apiKey.findMany({ take: LIST_CAP, select: { scope: true, lastUsedAt: true } }),
    prisma.webhook.findMany({ take: 500, select: { id: true, events: true } }),
    webhookStats(DAY, now),
  ]);
  return rows.map((p) => {
    const meta = parsePartnerMeta(p.metadata);
    const myKeys = keys.map((k) => ({ m: parseKeyMeta(k.scope), lastUsedAt: k.lastUsedAt })).filter((k) => k.m.partnerId === p.id);
    const myHooks = hooks.filter((h) => {
      const m = parseWebhookMeta(h.events);
      return m.partnerId === p.id && !m.archivedAt;
    });
    const lastUse = myKeys.map((k) => k.lastUsedAt?.toISOString() ?? '').sort().at(-1) || null;
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      typeLabel: partnerTypeLabel(p.type),
      status: meta.archivedAt ? 'archived' : p.isActive ? 'active' : 'inactive',
      contactName: meta.contactName,
      contactEmail: meta.contactEmail,
      notes: meta.notes,
      dealerIds: meta.dealerIds,
      activeKeys: myKeys.filter((k) => keyLifecycle(k.m, now) === 'active').length,
      lastKeyUseAt: lastUse,
      webhooks: myHooks.length,
      webhookHealth24h: sumHealth(myHooks.map((h) => h24.get(h.id) ?? EMPTY_HEALTH)),
      legacyWebhookUrl: p.webhookUrl,
      hasLegacyKey: Boolean(p.apiKeyHash),
      createdAt: p.createdAt.toISOString(),
    };
  });
}

export async function listPartners(p: PartnerListParams, now = new Date()): Promise<PartnerItem[]> {
  const q = p.q?.toLowerCase();
  const rows = (await prisma.partner.findMany({ where: p.type ? { type: p.type } : {}, orderBy: { createdAt: 'desc' }, take: 500, select: PARTNER_SELECT })) as PartnerRow[];
  const items = await partnerItems(rows, now);
  return items.filter((it) => (p.status === 'all' || it.status === p.status) && (!q || it.name.toLowerCase().includes(q)));
}

async function loadPartner(id: string): Promise<PartnerRow> {
  const row = (await prisma.partner.findUnique({ where: { id }, select: PARTNER_SELECT })) as PartnerRow | null;
  if (!row) throw new ApiError('NOT_FOUND', 'Partner bulunamadı.');
  return row;
}

export async function createPartner(ctx: Ctx, input: CreatePartnerInput, now = new Date()): Promise<PartnerItem> {
  if (input.dealerIds?.length) await assertDealers(input.dealerIds);
  const meta = serializePartnerMeta({
    contactName: input.contactName || null,
    contactEmail: input.contactEmail || null,
    notes: input.notes || null,
    dealerIds: [...new Set(input.dealerIds ?? [])],
    archivedAt: null,
    extra: {},
  });
  const row = await prisma.$transaction(async (tx) => {
    const p = await tx.partner.create({ data: { name: input.name, type: input.type, metadata: meta as object, isActive: true }, select: PARTNER_SELECT });
    await audit(tx, ctx, 'CREATE_PARTNER', 'Partner', p.id, null, { name: p.name, type: p.type, dealerIds: input.dealerIds ?? [] });
    return p as PartnerRow;
  });
  return (await partnerItems([row], now))[0];
}

export async function updatePartner(ctx: Ctx, id: string, input: UpdatePartnerInput, now = new Date()): Promise<{ partner: PartnerItem; webhookSecret: string | null }> {
  const row = await loadPartner(id);
  const before = parsePartnerMeta(row.metadata);
  if (input.dealerIds) await assertDealers(input.dealerIds);
  const after = {
    ...before,
    ...(input.contactName !== undefined ? { contactName: input.contactName || null } : {}),
    ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    ...(input.dealerIds ? { dealerIds: [...new Set(input.dealerIds)] } : {}),
  };
  let isActive = input.isActive ?? row.isActive;
  if (input.archived === true) {
    after.archivedAt = now.toISOString();
    isActive = false;
  } else if (input.archived === false) {
    after.archivedAt = null;
  }

  let legacy: { url: string; events: string[]; secret: string } | null = null;
  if (input.migrateLegacyWebhook) {
    if (!row.webhookUrl) throw new ApiError('CONFLICT', 'Bu partnerin dönüştürülecek eski webhook adresi yok.');
    await assertUrlUsable(row.webhookUrl);
    legacy = { url: row.webhookUrl, events: input.migrateLegacyWebhook.events, secret: generateWebhookSecret() };
  }

  const name = input.name ?? row.name;
  const type = input.type ?? row.type;
  const changed = changedFields(
    { name: row.name, type: row.type, isActive: row.isActive, ...serializePartnerMeta(before) },
    { name, type, isActive, ...serializePartnerMeta(after) }
  );
  if (legacy) changed.push('webhookUrl→webhook');
  if (input.clearLegacyKey && row.apiKeyHash) changed.push('eski qrk_ anahtarı');

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.partner.update({
      where: { id },
      data: {
        name,
        type,
        isActive,
        metadata: serializePartnerMeta(after) as object,
        ...(legacy ? { webhookUrl: null } : {}),
        ...(input.clearLegacyKey ? { apiKeyHash: null } : {}),
      },
      select: PARTNER_SELECT,
    });
    // Pasifleşme/aktifleşme partnerin webhook'larına yansır (anahtarlar doğrulamada reddedilir).
    if (isActive !== row.isActive) {
      const hooks = await tx.webhook.findMany({ select: { id: true, isActive: true, events: true } });
      for (const h of hooks) {
        const m = parseWebhookMeta(h.events);
        if (m.partnerId !== id || m.archivedAt) continue;
        if (!isActive && h.isActive) {
          await tx.webhook.update({ where: { id: h.id }, data: { isActive: false, events: serializeWebhookMeta({ ...m, disabledReason: 'partner_inactive' }) as object } });
        } else if (isActive && !h.isActive && m.disabledReason === 'partner_inactive') {
          await tx.webhook.update({ where: { id: h.id }, data: { isActive: true, events: serializeWebhookMeta({ ...m, disabledReason: null }) as object } });
        }
      }
    }
    if (legacy) {
      const w = await tx.webhook.create({
        data: {
          url: legacy.url,
          secret: sealSecret(legacy.secret),
          isActive: isActive,
          createdById: ctx.actor.id,
          events: serializeWebhookMeta({
            events: legacy.events,
            description: `${name} (eski partner adresinden dönüştürüldü)`,
            partnerId: id,
            archivedAt: null,
            disabledReason: isActive ? null : 'partner_inactive',
            secretHint: secretHintOf(legacy.secret),
            secretRotatedAt: now.toISOString(),
          }) as object,
        },
        select: { id: true, url: true },
      });
      await audit(tx, ctx, 'CREATE_WEBHOOK', 'Webhook', w.id, null, { url: w.url, events: legacy.events, partnerId: id, reason: 'Partner eski adresinden dönüştürüldü' });
    }
    if (changed.length > 0) {
      await audit(tx, ctx, 'UPDATE_PARTNER', 'Partner', id, { name: row.name, type: row.type, isActive: row.isActive }, { name, type, isActive, changed });
    }
    return p as PartnerRow;
  });
  return { partner: (await partnerItems([updated], now))[0], webhookSecret: legacy?.secret ?? null };
}

export async function getPartnerDetail(id: string, now = new Date()): Promise<PartnerDetail> {
  const row = await loadPartner(id);
  const [items, keys, hooks, trail] = await Promise.all([
    partnerItems([row], now),
    listKeys({ status: 'all', partnerId: id, page: 1, size: 100 }, now),
    listWebhooks({ status: 'all', partnerId: id }, now),
    auditTrail('Partner', [id]),
  ]);
  const partner = items[0];
  const labels = await dealerLabels(partner.dealerIds);
  return {
    partner,
    dealers: partner.dealerIds.map((d) => ({ id: d, label: labels.get(d) ?? 'Silinmiş bayi' })),
    keys: keys.items,
    webhooks: hooks,
    audit: trail,
  };
}

// ───────────────────────────── Bayi arama ─────────────────────────────

export async function searchDealers(q: string, ids?: string[]): Promise<DealerOption[]> {
  if (ids && ids.length > 0) {
    const labels = await dealerLabels(ids.slice(0, 200));
    return ids.filter((i) => labels.has(i)).map((i) => ({ id: i, label: labels.get(i) as string }));
  }
  const rows = await prisma.user.findMany({
    where: {
      role: 'DEALER',
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { businessName: 'asc' },
    take: 20,
    select: { id: true, businessName: true, name: true, email: true },
  });
  return rows.map((u) => ({ id: u.id, label: u.businessName || u.name || u.email }));
}

// ───────────────────────────── Özet ─────────────────────────────

export async function getOverview(now = new Date()): Promise<IntegrationsOverview> {
  const since7 = new Date(now.getTime() - 7 * DAY);
  const [keys, hooks, partners, h24, series, controls, innovation] = await Promise.all([
    prisma.apiKey.findMany({ take: LIST_CAP, select: { scope: true, lastUsedAt: true, createdAt: true } }),
    prisma.webhook.findMany({ take: 500, select: { isActive: true, events: true } }),
    prisma.partner.findMany({ take: 500, select: { isActive: true, metadata: true } }),
    webhookStats(DAY, now),
    prisma.$queryRaw<{ day: string; total: number }[]>(Prisma.sql`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day, COUNT(*)::int AS total
        FROM "AnalyticsEvent"
       WHERE event = 'webhook_delivery' AND category = 'webhook' AND "createdAt" >= ${since7}
         AND COALESCE(data->>'test', 'false') <> 'true'
       GROUP BY 1`),
    import('@/lib/module-gate').then((m) => m.getModuleControls() as Promise<Record<string, boolean | undefined>>),
    import('@/lib/innovation-config').then((m) => m.getInnovationPlatformConfig()),
  ]);

  let active = 0;
  let used7d = 0;
  let idle90d = 0;
  let expiring30d = 0;
  let scopeless = 0;
  for (const k of keys) {
    const m = parseKeyMeta(k.scope);
    if (keyLifecycle(m, now) !== 'active') continue;
    active += 1;
    if (m.scopes.length === 0) scopeless += 1;
    const last = k.lastUsedAt?.getTime() ?? null;
    if (last && last >= now.getTime() - 7 * DAY) used7d += 1;
    if ((last ?? k.createdAt.getTime()) < now.getTime() - 90 * DAY) idle90d += 1;
    if (m.expiresAt && Date.parse(m.expiresAt) < now.getTime() + 30 * DAY) expiring30d += 1;
  }

  let hActive = 0;
  let hPaused = 0;
  for (const h of hooks) {
    const st = webhookStatus(h.isActive, parseWebhookMeta(h.events));
    if (st === 'active') hActive += 1;
    else if (st === 'paused') hPaused += 1;
  }
  let deliveries = 0;
  let failed = 0;
  for (const s of h24.values()) {
    deliveries += s.total;
    failed += s.failed;
  }
  const byDay = new Map(series.map((r) => [r.day, Number(r.total)]));

  let pActive = 0;
  let pInactive = 0;
  for (const p of partners) {
    if (parsePartnerMeta(p.metadata).archivedAt) continue;
    if (p.isActive) pActive += 1;
    else pInactive += 1;
  }

  return {
    generatedAt: now.toISOString(),
    externalApi: { enabled: controls.api_keys !== false, digestEnabled: Boolean(innovation.features.partnerDigestApi) },
    keys: { active, used7d, idle90d, expiring30d, scopeless },
    webhooks: {
      active: hActive,
      paused: hPaused,
      deliveries24h: deliveries,
      failed24h: failed,
      successRate24h: deliveries > 0 ? Math.round(((deliveries - failed) / deliveries) * 1000) / 10 : null,
      series7d: lastIstanbulDays(7, now).map((d) => byDay.get(d) ?? 0),
    },
    partners: { active: pActive, inactive: pInactive },
  };
}

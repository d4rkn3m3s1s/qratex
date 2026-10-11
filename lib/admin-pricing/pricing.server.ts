/**
 * Admin → Fiyatlandırma — sunucu mantığı (BFF uçları ve sunucu sayfası bunu çağırır).
 *
 * İlkeler:
 *  - Silme YOK (C1): plan arşivlenir; abonesi varsa açık onay gerekir, abonelere dokunulmaz
 *    (lib/plan-limits arşivli/pasif planın limitlerini uygulamaya devam eder).
 *  - Her mutasyon denetim kaydıyla AYNI transaction'da; güncelleme iyimser kilitli (409).
 *  - Tek "öne çıkan" plan kuralı sunucuda.
 *  - Stripe eşlemesi sunucu otoriter: Stripe yapılandırılmışsa fiyat kimliği kaydedilmeden önce
 *    Stripe'tan okunur; tutar/para birimi/döngü plana uymuyorsa kaydedilmez (görünen fiyat ≠
 *    tahsil edilen fiyat olmasın — Bulgu 4).
 *  - Vitrin (landing) önbelleği her değişiklikte geçersiz kılınır.
 */
import { revalidateTag } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { PLAN_GRANTING_STATUSES } from '@/lib/billing-core';
import { PUBLIC_PRICING_CACHE_TAG } from '@/lib/landing/public-pricing';
import {
  FIELD_LABEL,
  compareStripePrice,
  isPlanInterval,
  monthlyEquivalent,
  toStripeMinor,
  stripeIntervalOf,
  stripeMajorAmount,
  type PlanHistoryItem,
  type PlanInput,
  type PlanInterval,
  type PlanSubscribers,
  type PlanSummary,
  type PricingOverview,
  type StripeCheck,
  type StripePriceShape,
  type StripeVerifyBody,
  type UpdatePlanBody,
} from './contract';

export interface PricingCtx {
  actor: AuditActor;
  request: { headers: { get(name: string): string | null } } | null;
}

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: string;
  features: unknown;
  maxQRCodes: number | null;
  maxBranches: number | null;
  stripePriceId: string | null;
  isPopular: boolean;
  isActive: boolean;
  archivedAt: Date | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

const PLAN_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  currency: true,
  interval: true,
  features: true,
  maxQRCodes: true,
  maxBranches: true,
  stripePriceId: true,
  isPopular: true,
  isActive: true,
  archivedAt: true,
  order: true,
  createdAt: true,
  updatedAt: true,
} as const;

const AUDITED_FIELDS = ['name', 'description', 'price', 'currency', 'interval', 'features', 'maxQRCodes', 'maxBranches', 'stripePriceId', 'isPopular', 'isActive'] as const;

export function normalizeFeatures(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { features?: unknown })?.features) ? (raw as { features: unknown[] }).features : [];
  return list.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map((f) => f.trim());
}

const EMPTY_SUBS: PlanSubscribers = { total: 0, paying: 0, pastDue: 0, manual: 0 };

function actorLabel(row: { actorSnapshot?: unknown; user?: { name: string | null; email: string } | null }): string | null {
  if (row.user) return row.user.name || row.user.email;
  const snap = row.actorSnapshot as { name?: string | null; email?: string | null } | null | undefined;
  return snap?.name || snap?.email || null;
}

export function toSummary(row: PlanRow, subs: PlanSubscribers = EMPTY_SUBS, lastChange: PlanSummary['lastChange'] = null): PlanSummary {
  const interval: PlanInterval = isPlanInterval(row.interval) ? row.interval : 'monthly';
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price) || 0,
    currency: (row.currency || 'TRY').toUpperCase(),
    interval,
    features: normalizeFeatures(row.features),
    maxQRCodes: row.maxQRCodes,
    maxBranches: row.maxBranches,
    stripePriceId: row.stripePriceId,
    isPopular: row.isPopular,
    isActive: row.isActive,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    subscribers: subs,
    mrr: Math.round(monthlyEquivalent(Number(row.price) || 0, interval) * subs.paying * 100) / 100,
    lastChange,
  };
}

function stripeMode(): 'live' | 'test' | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!key) return null;
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return null;
}

function invalidateStorefront(): void {
  try {
    revalidateTag(PUBLIC_PRICING_CACHE_TAG, 'max');
  } catch (err) {
    console.error('[admin-pricing] vitrin önbelleği geçersiz kılınamadı:', err);
  }
}

// ───────────────────────────── Okuma ─────────────────────────────

export async function getPricingOverview(): Promise<PricingOverview> {
  const plans = (await prisma.pricingPlan.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: PLAN_SELECT,
    take: 200,
  })) as PlanRow[];
  const ids = plans.map((p) => p.id);

  const [groups, freeTierDealers, audits] = await Promise.all([
    ids.length
      ? prisma.user.groupBy({
          by: ['pricingPlanId', 'subscriptionStatus'],
          where: { pricingPlanId: { in: ids } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.user.count({ where: { role: 'DEALER', pricingPlanId: null, anonymizedAt: null } }),
    ids.length
      ? prisma.auditLog.findMany({
          where: { entity: 'PricingPlan', entityId: { in: ids } },
          orderBy: { createdAt: 'desc' },
          take: 500,
          select: { entityId: true, action: true, createdAt: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
        })
      : Promise.resolve([]),
  ]);

  const subs = new Map<string, PlanSubscribers>();
  for (const g of groups as Array<{ pricingPlanId: string | null; subscriptionStatus: string | null; _count: { _all: number } }>) {
    if (!g.pricingPlanId) continue;
    const s = subs.get(g.pricingPlanId) ?? { ...EMPTY_SUBS };
    const n = g._count._all;
    s.total += n;
    if (g.subscriptionStatus && PLAN_GRANTING_STATUSES.has(g.subscriptionStatus)) {
      s.paying += n;
      if (g.subscriptionStatus === 'past_due') s.pastDue += n;
    } else if (!g.subscriptionStatus) {
      s.manual += n;
    }
    subs.set(g.pricingPlanId, s);
  }

  const last = new Map<string, PlanSummary['lastChange']>();
  for (const a of audits as Array<{ entityId: string | null; action: string; createdAt: Date; actorSnapshot: unknown; user: { name: string | null; email: string } | null }>) {
    if (!a.entityId || last.has(a.entityId)) continue;
    last.set(a.entityId, { at: a.createdAt.toISOString(), by: actorLabel(a), action: a.action });
  }

  const summaries = plans.map((p) => toSummary(p, subs.get(p.id) ?? EMPTY_SUBS, last.get(p.id) ?? null));
  const mrr = new Map<string, number>();
  let paying = 0;
  let assigned = 0;
  for (const s of summaries) {
    paying += s.subscribers.paying;
    assigned += s.subscribers.total;
    if (s.mrr > 0) mrr.set(s.currency, Math.round(((mrr.get(s.currency) ?? 0) + s.mrr) * 100) / 100);
  }
  const sellable = summaries.filter((s) => s.isActive && !s.archivedAt);

  return {
    plans: summaries,
    kpis: {
      payingSubscribers: paying,
      assignedDealers: assigned,
      freeTierDealers,
      mrrByCurrency: [...mrr.entries()].map(([currency, amount]) => ({ currency, amount })),
      sellablePlans: sellable.length,
      unmappedSellable: sellable.filter((s) => s.interval !== 'lifetime' && !s.stripePriceId).length,
    },
    stripe: { configured: isStripeConfigured(), mode: stripeMode() },
    generatedAt: new Date().toISOString(),
  };
}

export function diffFields(oldData: Record<string, unknown> | null | undefined, newData: Record<string, unknown> | null | undefined) {
  const out: Array<{ field: string; from: unknown; to: unknown }> = [];
  if (!newData) return out;
  for (const k of Object.keys(newData)) {
    if (!(k in FIELD_LABEL)) continue;
    const from = oldData?.[k];
    const to = newData[k];
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) out.push({ field: k, from: from ?? null, to: to ?? null });
  }
  return out;
}

export async function getPlanHistory(planId: string): Promise<{ items: PlanHistoryItem[] }> {
  const rows = await prisma.auditLog.findMany({
    where: { entity: 'PricingPlan', entityId: planId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, action: true, createdAt: true, oldData: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
  });
  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      at: r.createdAt.toISOString(),
      by: actorLabel(r as never),
      changes:
        r.action === 'UPDATE_PRICING_PLAN' || r.action === 'STRIPE_PRICE_CREATED'
          ? diffFields(r.oldData as Record<string, unknown> | null, r.newData as Record<string, unknown> | null)
          : [],
    })),
  };
}

// ───────────────────────────── Stripe ─────────────────────────────

async function retrieveStripePrice(priceId: string): Promise<StripePriceShape | 'not_found'> {
  const stripe = getStripe();
  if (!stripe) throw new ApiError('SERVICE_UNAVAILABLE', 'Stripe yapılandırılmamış');
  try {
    const p = await stripe.prices.retrieve(priceId, { expand: ['product'] }, { timeout: 8000 });
    const product = p.product as unknown as { name?: string; deleted?: boolean } | string | null;
    return {
      id: p.id,
      active: p.active,
      currency: p.currency,
      unit_amount: p.unit_amount,
      type: p.type,
      recurring: p.recurring ? { interval: p.recurring.interval, interval_count: p.recurring.interval_count } : null,
      livemode: p.livemode,
      productName: typeof product === 'object' && product && !product.deleted ? (product.name ?? null) : null,
    };
  } catch (err) {
    const e = err as { statusCode?: number; code?: string; type?: string };
    if (e?.statusCode === 404 || e?.code === 'resource_missing') return 'not_found';
    console.error('[admin-pricing] Stripe fiyatı okunamadı:', err);
    throw new ApiError('SERVICE_UNAVAILABLE', 'Stripe’a şu an ulaşılamıyor. Lütfen birazdan tekrar deneyin.', { retryable: true });
  }
}

export async function checkStripePrice(
  planId: string | null,
  priceId: string | null,
  expected: { price: number; currency: string; interval: PlanInterval }
): Promise<StripeCheck> {
  const base = { planId, stripePriceId: priceId };
  if (!priceId) {
    return { ...base, status: 'unmapped', stripe: null, mismatches: [], message: expected.interval === 'lifetime' ? 'Tek seferlik plan çevrim içi satılmaz.' : 'Stripe fiyatı eşlenmemiş; bayi bu planı çevrim içi satın alamaz.' };
  }
  if (!isStripeConfigured()) {
    return { ...base, status: 'not_configured', stripe: null, mismatches: [], message: 'Stripe anahtarı tanımlı değil; eşleme doğrulanamıyor.' };
  }
  let sp: StripePriceShape | 'not_found';
  try {
    sp = await retrieveStripePrice(priceId);
  } catch (err) {
    return { ...base, status: 'error', stripe: null, mismatches: [], message: err instanceof Error ? err.message : 'Stripe hatası' };
  }
  if (sp === 'not_found') return { ...base, status: 'not_found', stripe: null, mismatches: [], message: 'Bu kimlikte bir Stripe fiyatı bulunamadı.' };
  const cmp = compareStripePrice(expected, sp);
  const cur = sp.currency.toUpperCase();
  return {
    ...base,
    status: cmp.status,
    stripe: {
      amount: stripeMajorAmount(sp.unit_amount, cur),
      currency: cur,
      interval: stripeIntervalOf(sp),
      active: sp.active,
      livemode: sp.livemode,
      productName: sp.productName ?? null,
    },
    mismatches: cmp.mismatches,
    message: cmp.status === 'match' ? 'Stripe fiyatı planla birebir eşleşiyor.' : 'Stripe fiyatı planla uyuşmuyor.',
  };
}

export async function verifyStripe(body: StripeVerifyBody): Promise<{ items: StripeCheck[] }> {
  if ('planIds' in body) {
    const plans = (await prisma.pricingPlan.findMany({ where: { id: { in: body.planIds } }, select: PLAN_SELECT })) as PlanRow[];
    const items: StripeCheck[] = [];
    // Sıralı: Stripe hız sınırına takılmamak için (en fazla 50 plan).
    for (const p of plans) {
      const s = toSummary(p);
      items.push(await checkStripePrice(p.id, p.stripePriceId, s));
    }
    return { items };
  }
  return { items: [await checkStripePrice(null, body.stripePriceId, body)] };
}

/**
 * Kaydetmeden önce Stripe eşlemesini zorlar. Stripe yapılandırılmamışsa doğrulama yapılamaz
 * (yerel/deneme ortamı) ve kayda izin verilir — durum konsolda "doğrulanamadı" görünür.
 */
async function assertStripeConsistent(priceId: string | null, expected: { price: number; currency: string; interval: PlanInterval }) {
  if (!priceId || !isStripeConfigured()) return;
  const check = await checkStripePrice(null, priceId, expected);
  if (check.status === 'error') throw new ApiError('SERVICE_UNAVAILABLE', check.message, { retryable: true });
  if (check.status === 'not_found' || check.status === 'inactive' || check.status === 'mismatch') {
    const msg = check.status === 'mismatch' ? check.mismatches.join(' · ') : check.status === 'inactive' ? 'Stripe fiyatı pasif (arşivlenmiş).' : check.message;
    throw new ApiError('VALIDATION', `Stripe eşlemesi reddedildi: ${msg}`, {
      details: [{ path: 'stripePriceId', message: msg }],
    });
  }
}

// ───────────────────────────── Yazma ─────────────────────────────

function snapshot(p: PlanRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of AUDITED_FIELDS) out[k] = k === 'features' ? normalizeFeatures(p.features) : (p as unknown as Record<string, unknown>)[k];
  return out;
}

export async function createPlan(ctx: PricingCtx, input: PlanInput): Promise<{ plan: PlanSummary }> {
  if (input.interval === 'lifetime' && input.stripePriceId) {
    throw new ApiError('VALIDATION', 'Tek seferlik planlar Stripe aboneliğiyle satılamaz; Stripe fiyatını boş bırakın.', {
      details: [{ path: 'stripePriceId', message: 'Tek seferlik planda Stripe fiyatı kullanılmaz' }],
    });
  }
  await assertStripeConsistent(input.stripePriceId, input);
  const created = await prisma.$transaction(async (tx) => {
    const max = await tx.pricingPlan.aggregate({ _max: { order: true } });
    if (input.isPopular) await tx.pricingPlan.updateMany({ where: { isPopular: true }, data: { isPopular: false } });
    const row = (await tx.pricingPlan.create({
      data: {
        name: input.name,
        description: input.description,
        price: input.price,
        currency: input.currency,
        interval: input.interval,
        features: input.features as unknown as Prisma.InputJsonValue,
        maxQRCodes: input.maxQRCodes,
        maxBranches: input.maxBranches,
        stripePriceId: input.stripePriceId,
        isPopular: input.isPopular,
        isActive: input.isActive,
        order: (max._max.order ?? -1) + 1,
      },
      select: PLAN_SELECT,
    })) as PlanRow;
    await tx.auditLog.create({
      data: auditEntry(ctx.actor, { action: 'CREATE_PRICING_PLAN', entity: 'PricingPlan', entityId: row.id, newData: snapshot(row) }, ctx.request),
    });
    return row;
  });
  invalidateStorefront();
  return { plan: toSummary(created) };
}

async function loadForWrite(tx: Prisma.TransactionClient, id: string, expectedUpdatedAt: string): Promise<PlanRow> {
  const existing = (await tx.pricingPlan.findUnique({ where: { id }, select: PLAN_SELECT })) as PlanRow | null;
  if (!existing) throw new ApiError('NOT_FOUND', 'Plan bulunamadı');
  if (existing.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
    throw new ApiError('CONFLICT', 'Bu plan siz düzenlerken başka biri tarafından değiştirildi. En son hâlini yükleyip tekrar deneyin.', {
      details: { currentUpdatedAt: existing.updatedAt.toISOString() },
    });
  }
  return existing;
}

export async function updatePlan(ctx: PricingCtx, id: string, body: UpdatePlanBody): Promise<{ plan: PlanSummary; changed: string[] }> {
  const { expectedUpdatedAt, ...fields } = body;
  // Stripe doğrulaması ağ çağrısıdır; transaction DIŞINDA, güncel değerlerle yapılır.
  const current = (await prisma.pricingPlan.findUnique({ where: { id }, select: PLAN_SELECT })) as PlanRow | null;
  if (!current) throw new ApiError('NOT_FOUND', 'Plan bulunamadı');
  if (current.archivedAt) {
    throw new ApiError('CONFLICT', 'Arşivlenmiş plan düzenlenemez. Önce arşivden geri alın.', { details: { reason: 'ARCHIVED' } });
  }
  const merged = {
    price: fields.price ?? Number(current.price),
    currency: fields.currency ?? current.currency,
    interval: (fields.interval ?? (isPlanInterval(current.interval) ? current.interval : 'monthly')) as PlanInterval,
    stripePriceId: fields.stripePriceId !== undefined ? fields.stripePriceId : current.stripePriceId,
  };
  if (merged.interval === 'lifetime' && merged.stripePriceId) {
    throw new ApiError('VALIDATION', 'Tek seferlik planlar Stripe aboneliğiyle satılamaz; Stripe fiyatını kaldırın.', {
      details: [{ path: 'stripePriceId', message: 'Tek seferlik planda Stripe fiyatı kullanılmaz' }],
    });
  }
  const stripeTouched =
    fields.stripePriceId !== undefined || fields.price !== undefined || fields.currency !== undefined || fields.interval !== undefined;
  if (stripeTouched) await assertStripeConsistent(merged.stripePriceId, merged);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await loadForWrite(tx, id, expectedUpdatedAt);
    if (existing.archivedAt) throw new ApiError('CONFLICT', 'Arşivlenmiş plan düzenlenemez.', { details: { reason: 'ARCHIVED' } });
    const data: Prisma.PricingPlanUpdateManyMutationInput = {};
    if (fields.name !== undefined) data.name = fields.name;
    if (fields.description !== undefined) data.description = fields.description;
    if (fields.price !== undefined) data.price = fields.price;
    if (fields.currency !== undefined) data.currency = fields.currency;
    if (fields.interval !== undefined) data.interval = fields.interval;
    if (fields.features !== undefined) data.features = fields.features as unknown as Prisma.InputJsonValue;
    if (fields.maxQRCodes !== undefined) data.maxQRCodes = fields.maxQRCodes;
    if (fields.maxBranches !== undefined) data.maxBranches = fields.maxBranches;
    if (fields.stripePriceId !== undefined) data.stripePriceId = fields.stripePriceId;
    if (fields.isPopular !== undefined) data.isPopular = fields.isPopular;
    if (fields.isActive !== undefined) data.isActive = fields.isActive;

    if (fields.isPopular === true) {
      await tx.pricingPlan.updateMany({ where: { isPopular: true, id: { not: id } }, data: { isPopular: false } });
    }
    // Kilit: yalnız okunan sürüm hâlâ güncelse yazılır.
    const res = await tx.pricingPlan.updateMany({ where: { id, updatedAt: existing.updatedAt }, data });
    if (res.count === 0) throw new ApiError('CONFLICT', 'Bu plan siz düzenlerken başka biri tarafından değiştirildi.');
    const updated = (await tx.pricingPlan.findUnique({ where: { id }, select: PLAN_SELECT })) as PlanRow;
    const before = snapshot(existing);
    const after = snapshot(updated);
    const changed = diffFields(before, after).map((c) => c.field);
    if (changed.length) {
      const pick = (o: Record<string, unknown>) => Object.fromEntries(changed.map((k) => [k, o[k]]));
      await tx.auditLog.create({
        data: auditEntry(ctx.actor, { action: 'UPDATE_PRICING_PLAN', entity: 'PricingPlan', entityId: id, oldData: pick(before), newData: pick(after) }, ctx.request),
      });
    }
    return { updated, changed };
  });
  if (result.changed.length) invalidateStorefront();
  return { plan: toSummary(result.updated), changed: result.changed };
}

export interface ArchiveImpact {
  planId: string;
  planName: string;
  subscribers: number;
  paying: number;
}

export async function archivePlan(
  ctx: PricingCtx,
  id: string,
  opts: { confirm?: boolean; dryRun?: boolean }
): Promise<{ archived: boolean; impact: ArchiveImpact }> {
  const existing = (await prisma.pricingPlan.findUnique({ where: { id }, select: PLAN_SELECT })) as PlanRow | null;
  if (!existing) throw new ApiError('NOT_FOUND', 'Plan bulunamadı');
  const [subscribers, paying] = await Promise.all([
    prisma.user.count({ where: { pricingPlanId: id } }),
    prisma.user.count({ where: { pricingPlanId: id, subscriptionStatus: { in: Array.from(PLAN_GRANTING_STATUSES) } } }),
  ]);
  const impact: ArchiveImpact = { planId: id, planName: existing.name, subscribers, paying };
  if (opts.dryRun) return { archived: false, impact };
  if (existing.archivedAt) return { archived: true, impact };
  if (subscribers > 0 && !opts.confirm) {
    throw new ApiError('CONFIRM_REQUIRED', `Bu planda ${subscribers} işletme var. Arşivlemek için açık onay gerekir.`, {
      status: 409,
      details: { impact },
    });
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.pricingPlan.update({ where: { id }, data: { archivedAt: now, isActive: false, isPopular: false } });
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        {
          action: 'ARCHIVE_PRICING_PLAN',
          entity: 'PricingPlan',
          entityId: id,
          oldData: { isActive: existing.isActive, isPopular: existing.isPopular, archivedAt: null },
          newData: { isActive: false, isPopular: false, archivedAt: now, subscribersPreserved: subscribers, payingPreserved: paying },
        },
        ctx.request
      ),
    });
  });
  invalidateStorefront();
  return { archived: true, impact };
}

/** Arşivden geri alır; plan PASİF döner (satışa açmak ayrı, bilinçli bir adım). */
export async function restorePlan(ctx: PricingCtx, id: string): Promise<{ plan: PlanSummary }> {
  const restored = await prisma.$transaction(async (tx) => {
    const existing = (await tx.pricingPlan.findUnique({ where: { id }, select: PLAN_SELECT })) as PlanRow | null;
    if (!existing) throw new ApiError('NOT_FOUND', 'Plan bulunamadı');
    if (!existing.archivedAt) throw new ApiError('CONFLICT', 'Bu plan arşivde değil.');
    const max = await tx.pricingPlan.aggregate({ _max: { order: true }, where: { archivedAt: null } });
    const row = (await tx.pricingPlan.update({
      where: { id },
      data: { archivedAt: null, isActive: false, order: (max._max.order ?? -1) + 1 },
      select: PLAN_SELECT,
    })) as PlanRow;
    await tx.auditLog.create({
      data: auditEntry(ctx.actor, { action: 'RESTORE_PRICING_PLAN', entity: 'PricingPlan', entityId: id, oldData: { archivedAt: existing.archivedAt }, newData: { archivedAt: null, isActive: false } }, ctx.request),
    });
    return row;
  });
  invalidateStorefront();
  return { plan: toSummary(restored) };
}

/** Vitrin sırası: arşivlenmemiş planların TAMAMI verilmeli (eksik/fazla kimlik → 400). */
export async function reorderPlans(ctx: PricingCtx, ids: string[]): Promise<{ ids: string[] }> {
  if (new Set(ids).size !== ids.length) throw new ApiError('VALIDATION', 'Sıralamada aynı plan iki kez geçiyor.');
  await prisma.$transaction(async (tx) => {
    const live = await tx.pricingPlan.findMany({ where: { archivedAt: null }, select: { id: true, order: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    const liveIds = live.map((p) => p.id);
    if (liveIds.length !== ids.length || !ids.every((id) => liveIds.includes(id))) {
      throw new ApiError('CONFLICT', 'Plan listesi değişmiş. Sayfayı yenileyip tekrar sıralayın.');
    }
    for (let i = 0; i < ids.length; i++) {
      const prev = live.find((p) => p.id === ids[i]);
      if (prev && prev.order !== i) await tx.pricingPlan.update({ where: { id: ids[i] }, data: { order: i } });
    }
    await tx.auditLog.create({
      data: auditEntry(ctx.actor, { action: 'REORDER_PRICING_PLANS', entity: 'PricingPlan', entityId: null, oldData: { ids: liveIds }, newData: { ids } }, ctx.request),
    });
  });
  invalidateStorefront();
  return { ids };
}

/**
 * Planın güncel fiyatıyla Stripe'ta YENİ bir Price oluşturur ve plana eşler (Stripe fiyatları
 * değiştirilemez). Var olan eşleme varsa aynı ürüne bağlanır; mevcut aboneler eski fiyatta kalır.
 * İdempotency anahtarı aynı plan+tutar+döngü için çift fiyat oluşmasını önler.
 */
export async function createStripePriceForPlan(ctx: PricingCtx, planId: string, expectedUpdatedAt: string): Promise<{ plan: PlanSummary; check: StripeCheck }> {
  const stripe = getStripe();
  if (!stripe) throw new ApiError('SERVICE_UNAVAILABLE', 'Stripe yapılandırılmamış; fiyat oluşturulamaz.');
  const plan = (await prisma.pricingPlan.findUnique({ where: { id: planId }, select: PLAN_SELECT })) as PlanRow | null;
  if (!plan) throw new ApiError('NOT_FOUND', 'Plan bulunamadı');
  if (plan.archivedAt) throw new ApiError('CONFLICT', 'Arşivlenmiş plana Stripe fiyatı oluşturulamaz.');
  if (plan.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
    throw new ApiError('CONFLICT', 'Plan siz bakarken değişti. Sayfayı yenileyip tekrar deneyin.');
  }
  const s = toSummary(plan);
  if (s.interval === 'lifetime') throw new ApiError('VALIDATION', 'Tek seferlik planlar Stripe aboneliğiyle satılmaz.');
  if (s.price <= 0) throw new ApiError('VALIDATION', 'Ücretsiz plan için Stripe fiyatı gerekmez.');

  let productId: string | null = null;
  if (plan.stripePriceId) {
    // Eski fiyat okunamazsa yeni ürünle devam edilir (eşleme yine doğru olur).
    try {
      const prev = await stripe.prices.retrieve(plan.stripePriceId, {}, { timeout: 8000 });
      productId = typeof prev.product === 'string' ? prev.product : prev.product.id;
    } catch {
      productId = null;
    }
  }
  const minor = toStripeMinor(s.price, s.currency);
  let created;
  try {
    created = await stripe.prices.create(
      {
        currency: s.currency.toLowerCase(),
        unit_amount: minor,
        recurring: { interval: s.interval === 'yearly' ? 'year' : 'month', interval_count: 1 },
        ...(productId ? { product: productId } : { product_data: { name: s.name } }),
        metadata: { planId: s.id },
      },
      { idempotencyKey: `qratex-plan-${s.id}-${minor}-${s.currency}-${s.interval}`, timeout: 10000 }
    );
  } catch (err) {
    console.error('[admin-pricing] Stripe fiyatı oluşturulamadı:', err);
    throw new ApiError('SERVICE_UNAVAILABLE', 'Stripe’ta fiyat oluşturulamadı. Lütfen birazdan tekrar deneyin.', { retryable: true });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.pricingPlan.updateMany({ where: { id: planId, updatedAt: plan.updatedAt }, data: { stripePriceId: created.id } });
    if (res.count === 0) throw new ApiError('CONFLICT', 'Plan bu sırada değişti; oluşturulan Stripe fiyatı (' + created.id + ') eşlenmedi.');
    const row = (await tx.pricingPlan.findUnique({ where: { id: planId }, select: PLAN_SELECT })) as PlanRow;
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: 'STRIPE_PRICE_CREATED', entity: 'PricingPlan', entityId: planId, oldData: { stripePriceId: plan.stripePriceId }, newData: { stripePriceId: created.id } },
        ctx.request
      ),
    });
    return row;
  });
  invalidateStorefront();
  const check = await checkStripePrice(planId, created.id, s);
  return { plan: toSummary(updated), check };
}

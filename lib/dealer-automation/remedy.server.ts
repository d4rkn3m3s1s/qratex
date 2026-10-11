/**
 * Otomasyon › Telafi — sunucu katmanı: ayar, sonuç istatistiği, geriye dönük tarama
 * (kuru çalıştırma + gerçek) ve teklif kataloğu (eski /dealer/remedy-automation/templates).
 *
 * Denetim karşılıkları (dealer_remedy-automation.md / dealer_remedy-automation_templates.md):
 *  - Otomasyon 1/7/11: tarama çekirdek fonksiyonu (`maybeCreateAutoRemedyForFeedback`) çağırır;
 *    aday sorgusu teklifi OLAN yorumları baştan dışlar (`remedyOffers: none`) → reddedilen taslak
 *    geri gelmez, eski uygun adaylara da ulaşılır.
 *  - Otomasyon 2/4/6: tam sayı + aralık doğrulaması, Türkçe alan hataları (zarf v2).
 *  - Otomasyon 9: bu ay üretilen / bekleyen / yayınlanan / kabul / red + kabul oranı + son tarama.
 *  - Otomasyon 14: ayar değişikliği denetim kaydına (önce/sonra) yazılır; tarama hız sınırlı.
 *  - Şablon 4/5: kapsam (işletme/şube) + tür başına TEK şablon (advisory kilit + 409); değerler
 *    türe göre sınırlı, tekil ve sıralı.
 *  - Şablon 6: şablon silme onaylıdır; şube silme bu yüzeyden kaldırıldı (QR kodlar › Şubeler).
 *  - Şablon 9: kapsam başına "etkin teklif seti" ve kaynağı çözücüyle aynı kuralla hesaplanır.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { canAutoAnalyze, getDealerAiPolicy } from '@/lib/ai-policy';
import {
  DEFAULT_REMEDY_OPTIONS,
  REMEDY_VALUE_LIMITS,
  coerceRemedyValue,
  isRemedyOptionType,
  normalizeRemedyOptions,
  type RemedyOptionType,
} from '@/lib/remedy-options';
import {
  REMEDY_AUTOMATION_EVENT,
  countMonthlyAutoRemedies,
  maybeCreateAutoRemedyForFeedback,
} from '@/lib/remedy-automation-core';
import {
  istanbulMonthStart,
  parseRemedyAutomationConfig,
  type RemedyAutomationConfig,
} from './remedy-config';
import type { Actor } from './replies.server';
import type {
  RemedyCatalogDto,
  RemedyOverviewDto,
  RemedyScanResultDto,
  RemedyScopeDto,
  RemedyStatsDto,
  RemedyTemplateDto,
} from './types';

const DAY = 86_400_000;
const SCAN_WINDOW_DAYS = 14;
const SCAN_CANDIDATE_CAP = 120;
export const MAX_TEMPLATE_VALUES = 8;
const LAST_SCAN_KEY = (dealerId: string) => `remedy_automation_scan:${dealerId}`;

const TYPE_DEFAULTS: Record<RemedyOptionType, { label: string; unit: string }> = {
  discount: { label: 'İndirim', unit: '%' },
  points: { label: 'Puan', unit: 'puan' },
  free_item: { label: 'Ücretsiz ürün/içecek', unit: 'adet' },
};

/* ───────────────────────── Ayar + istatistik ───────────────────────── */

async function readConfig(dealerId: string): Promise<RemedyAutomationConfig> {
  const u = await prisma.user.findUnique({ where: { id: dealerId }, select: { dealerRemedyAutomation: true } });
  return parseRemedyAutomationConfig(u?.dealerRemedyAutomation);
}

async function readLastScan(dealerId: string): Promise<RemedyStatsDto['lastScan']> {
  const row = await prisma.settings.findUnique({ where: { key: LAST_SCAN_KEY(dealerId) }, select: { value: true } });
  const v = row?.value as { at?: unknown; queued?: unknown; skipped?: unknown } | null | undefined;
  if (!v || typeof v.at !== 'string') return null;
  return { at: v.at, queued: Number(v.queued) || 0, skipped: Number(v.skipped) || 0 };
}

export async function loadRemedyStats(dealerId: string, cfg: RemedyAutomationConfig, now: Date = new Date()): Promise<RemedyStatsDto> {
  const monthStart = istanbulMonthStart(now);
  const [events, awaiting, lastScan] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { userId: dealerId, event: REMEDY_AUTOMATION_EVENT, createdAt: { gte: monthStart } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { data: true, createdAt: true },
    }),
    prisma.remedyOffer.count({ where: { dealerId, status: 'awaiting_dealer_approval' } }),
    readLastScan(dealerId),
  ]);
  const offerIds = events
    .map((e) => (e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? (e.data as Record<string, unknown>).offerId : null))
    .filter((v): v is string => typeof v === 'string');
  const byStatus = offerIds.length
    ? await prisma.remedyOffer.groupBy({ by: ['status'], where: { dealerId, id: { in: offerIds } }, _count: { _all: true } })
    : [];
  const c = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const accepted = c('accepted');
  const published = c('pending') + accepted + c('expired');
  const lastLatest = await prisma.analyticsEvent.findFirst({
    where: { userId: dealerId, event: REMEDY_AUTOMATION_EVENT },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return {
    monthUsed: events.length,
    cap: cfg.maxMonthlyAuto,
    awaiting,
    month: { queued: events.length, awaiting: c('awaiting_dealer_approval'), published, accepted, rejected: c('rejected') },
    acceptRate: published > 0 ? accepted / published : null,
    lastAutoAt: lastLatest?.createdAt.toISOString() ?? null,
    lastScan,
  };
}

async function aiAnalyzeFlag(dealerId: string): Promise<boolean | null> {
  try {
    const p = await getDealerAiPolicy(dealerId);
    return p.source === 'unavailable' ? null : canAutoAnalyze(p);
  } catch {
    return null;
  }
}

export async function loadRemedyOverview(dealerId: string): Promise<RemedyOverviewDto> {
  const config = await readConfig(dealerId);
  const [stats, catalog, aiAnalyze] = await Promise.all([loadRemedyStats(dealerId, config), loadRemedyCatalog(dealerId), aiAnalyzeFlag(dealerId)]);
  return { config, stats, catalog, aiAnalyze };
}

export async function updateRemedyConfig(actor: Actor, next: RemedyAutomationConfig): Promise<RemedyAutomationConfig> {
  const clean = parseRemedyAutomationConfig(next);
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: actor.dealerId }, select: { dealerRemedyAutomation: true } });
    await tx.user.update({ where: { id: actor.dealerId }, data: { dealerRemedyAutomation: clean as unknown as Prisma.InputJsonValue } });
    await tx.auditLog.create({
      data: {
        userId: actor.actorId,
        actorType: 'user',
        action: 'remedy_automation.updated',
        entity: 'User',
        entityId: actor.dealerId,
        ...(before?.dealerRemedyAutomation != null ? { oldData: before.dealerRemedyAutomation as Prisma.InputJsonValue } : {}),
        newData: clean as unknown as Prisma.InputJsonValue,
      },
    });
  });
  return clean;
}

/* ───────────────────────── Tarama ───────────────────────── */

/**
 * Son 14 günün düşük puanlı geri bildirimleri. `dryRun` → hiçbir şey yazmadan sınıflandırır
 * (aday / anonim / teklifi var / bekleme süresinde) ve eklenecek tahmini sayıyı verir.
 * Gerçek tarama her uygun aday için çekirdeği çağırır (aynı kurallar, aynı sayaç).
 */
export async function scanRemedy(actor: Actor, dryRun: boolean, now: Date = new Date()): Promise<RemedyScanResultDto> {
  const cfg = await readConfig(actor.dealerId);
  if (!cfg.enabled) {
    throw new ApiError('AUTOMATION_DISABLED', 'Telafi otomasyonu kapalı. Önce açıp kaydedin.', { status: 409 });
  }
  const since = new Date(now.getTime() - SCAN_WINDOW_DAYS * DAY);
  // Aday kümesi çekirdeğin tetiğiyle (`remedyTrigger`) AYNI: düşük puan YA DA (açıksa) yüksek
  // kayıp riski — eskiden yalnız puan sorgulanıyor, "kayıp riski yüksekse de hazırla" tetiği
  // taramada hiç aday üretmiyordu. Güven işaretli yorum (işletme sahibi/personeli ya da güven
  // motorunun şüpheli bulduğu) telafi adayı değildir: puan türlü telafiyle puana çevrilemez.
  const trigger: Prisma.FeedbackWhereInput[] = [{ rating: { lte: cfg.minRating } }];
  if (cfg.churnEnabled) trigger.push({ churnRisk: { gte: cfg.churnThreshold } });
  const rows = await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      trustFlagged: false,
      createdAt: { gte: since },
      qrCode: { dealerId: actor.dealerId },
      OR: trigger,
    },
    orderBy: { createdAt: 'desc' },
    take: SCAN_CANDIDATE_CAP,
    select: { id: true, userId: true, rating: true, churnRisk: true, qrCodeId: true, _count: { select: { remedyOffers: true } } },
  });

  const anonymous = rows.filter((r) => !r.userId).length;
  const alreadyOffered = rows.filter((r) => r.userId && r._count.remedyOffers > 0).length;
  const open = rows.filter((r) => r.userId && r._count.remedyOffers === 0);

  let cooling = new Set<string>();
  if (cfg.cooldownDays > 0 && open.length > 0) {
    const userIds = [...new Set(open.map((r) => r.userId as string))];
    const recent = await prisma.remedyOffer.findMany({
      where: { dealerId: actor.dealerId, userId: { in: userIds }, createdAt: { gte: new Date(now.getTime() - cfg.cooldownDays * DAY) } },
      select: { userId: true },
    });
    cooling = new Set(recent.map((r) => r.userId));
  }
  // Aynı müşterinin birden çok yorumu: taramada yalnız en yenisi aday olur.
  const seenUsers = new Set<string>();
  const eligible = open.filter((r) => {
    const uid = r.userId as string;
    if (cooling.has(uid) || seenUsers.has(uid)) return false;
    seenUsers.add(uid);
    return true;
  });
  const cooldown = open.length - eligible.length;
  const monthUsed = await countMonthlyAutoRemedies(actor.dealerId, now);
  const capRemaining = Math.max(0, cfg.maxMonthlyAuto - monthUsed);
  const base = {
    windowDays: SCAN_WINDOW_DAYS,
    found: rows.length,
    eligible: eligible.length,
    anonymous,
    alreadyOffered,
    cooldown,
    capRemaining,
    perRun: cfg.maxPerRun,
  };

  if (dryRun) {
    return { dryRun: true, ...base, queued: Math.min(eligible.length, cfg.maxPerRun, capRemaining), skipped: {}, offerIds: [] };
  }

  const offerIds: string[] = [];
  const skipped: Record<string, number> = {};
  for (const fb of eligible) {
    if (offerIds.length >= cfg.maxPerRun) break;
    const res = await maybeCreateAutoRemedyForFeedback({
      feedbackId: fb.id,
      dealerId: actor.dealerId,
      userId: fb.userId,
      rating: fb.rating,
      churnRisk: fb.churnRisk,
      qrCodeId: fb.qrCodeId,
      config: cfg,
      notify: false,
      trigger: 'scan',
      trustFlagged: false, // sorgu zaten güven işaretlileri dışladı
    });
    if (res.created && res.offerId) offerIds.push(res.offerId);
    else {
      const k = res.reason ?? 'unknown';
      skipped[k] = (skipped[k] ?? 0) + 1;
      if (k === 'monthly_limit') break;
    }
  }
  const skippedTotal = Object.values(skipped).reduce((a, b) => a + b, 0) + anonymous + alreadyOffered + cooldown;
  try {
    const value = { at: now.toISOString(), queued: offerIds.length, skipped: skippedTotal };
    await prisma.settings.upsert({
      where: { key: LAST_SCAN_KEY(actor.dealerId) },
      create: { key: LAST_SCAN_KEY(actor.dealerId), value, category: 'dealer_automation' },
      update: { value },
    });
  } catch (err) {
    console.error('[remedy-scan] son tarama yazılamadı:', err);
  }
  if (offerIds.length > 0) {
    await prisma.notification
      .create({
        data: {
          userId: actor.dealerId,
          title: `${offerIds.length} telafi taslağı onay kuyruğunda`,
          message: 'Geriye dönük tarama tamamlandı. Taslakları inceleyip yayınlayın.',
          type: 'info',
          data: { type: 'remedy_draft', module: 'remedy_offers', ctaPath: '/dealer/inbox/remedy' },
        },
      })
      .catch((err) => console.error('[remedy-scan] bildirim yazılamadı:', err));
  }
  return { dryRun: false, ...base, queued: offerIds.length, skipped, offerIds };
}

/* ───────────────────────── Teklif kataloğu ───────────────────────── */

function valuesOf(raw: Prisma.JsonValue): number[] {
  return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
}

type TplRow = {
  id: string;
  locationId: string | null;
  type: string;
  label: string;
  unit: string;
  values: Prisma.JsonValue;
  isActive: boolean;
  order: number;
  createdAt: Date;
};

function toTemplateDto(t: TplRow): RemedyTemplateDto {
  return { id: t.id, locationId: t.locationId, type: t.type, label: t.label, unit: t.unit, values: valuesOf(t.values), isActive: t.isActive, order: t.order };
}

/** Çözücüyle (lib/remedy-options `getRemedyOptions`) aynı öncelik: şube > işletme > sistem. */
export function effectiveFor(templates: TplRow[], locationId: string | null): RemedyScopeDto['effective'] {
  const pick = (loc: string | null) =>
    normalizeRemedyOptions(
      templates
        .filter((t) => t.locationId === loc && t.isActive)
        .sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime())
        .map((t) => ({ type: t.type, label: t.label, unit: t.unit, values: valuesOf(t.values) }))
    );
  if (locationId) {
    const loc = pick(locationId);
    if (loc.length > 0) return { source: 'location', options: loc };
  }
  const general = pick(null);
  if (general.length > 0) return { source: 'dealer', options: general };
  return { source: 'system', options: DEFAULT_REMEDY_OPTIONS };
}

export async function loadRemedyCatalog(dealerId: string): Promise<RemedyCatalogDto> {
  const [templates, locations, totalQr] = await Promise.all([
    prisma.remedyTemplate.findMany({
      where: { dealerId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, locationId: true, type: true, label: true, unit: true, values: true, isActive: true, order: true, createdAt: true },
    }),
    prisma.dealerLocation.findMany({
      where: { dealerId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true, _count: { select: { qrCodes: { where: { archivedAt: null } } } } },
    }),
    prisma.qRCode.count({ where: { dealerId, archivedAt: null } }),
  ]);
  const scope = (locationId: string | null, name: string, isActive: boolean, qrCount: number): RemedyScopeDto => {
    const own = templates.filter((t) => t.locationId === locationId);
    const seen = new Set<string>();
    const duplicateIds: string[] = [];
    for (const t of own) {
      if (seen.has(t.type)) duplicateIds.push(t.id);
      else seen.add(t.type);
    }
    return { locationId, name, isActive, qrCount, templates: own.map(toTemplateDto), effective: effectiveFor(templates, locationId), duplicateIds };
  };
  return {
    scopes: [
      scope(null, 'İşletme geneli', true, totalQr),
      ...locations.map((l) => scope(l.id, l.name, l.isActive, l._count.qrCodes)),
    ],
    limits: REMEDY_VALUE_LIMITS,
    defaults: DEFAULT_REMEDY_OPTIONS,
    maxValues: MAX_TEMPLATE_VALUES,
  };
}

/** Değer listesini türün sınırlarına göre doğrular, tekilleştirir ve sıralar. */
export function cleanTemplateValues(type: RemedyOptionType, raw: readonly unknown[]): number[] {
  const out: number[] = [];
  for (const v of raw) {
    const n = coerceRemedyValue(type, v);
    if (n == null) {
      const lim = REMEDY_VALUE_LIMITS[type];
      throw new ApiError('VALIDATION', `"${String(v)}" geçersiz. ${TYPE_DEFAULTS[type].label} için ${lim.min}–${lim.max} arası${lim.integer ? ' tam sayı' : ''} girin.`, {
        details: [{ path: 'values', message: 'Geçersiz değer.' }],
      });
    }
    if (!out.includes(n)) out.push(n);
  }
  if (out.length === 0) throw new ApiError('VALIDATION', 'En az bir değer girin.', { details: [{ path: 'values', message: 'En az bir değer girin.' }] });
  if (out.length > MAX_TEMPLATE_VALUES) {
    throw new ApiError('VALIDATION', `En fazla ${MAX_TEMPLATE_VALUES} değer girilebilir.`, { details: [{ path: 'values', message: 'Çok fazla değer.' }] });
  }
  return out.sort((a, b) => a - b);
}

async function auditTpl(tx: Prisma.TransactionClient, actor: Actor, action: string, id: string, data: Record<string, unknown>) {
  await tx.auditLog.create({
    data: { userId: actor.actorId, actorType: 'user', action, entity: 'RemedyTemplate', entityId: id, newData: data as Prisma.InputJsonValue },
  });
}

export async function createRemedyTemplate(
  actor: Actor,
  body: { locationId: string | null; type: string; label?: string | null; values: unknown[]; isActive: boolean }
): Promise<{ id: string }> {
  if (!isRemedyOptionType(body.type)) throw new ApiError('VALIDATION', 'Telafi türü geçersiz.');
  const type = body.type;
  const values = cleanTemplateValues(type, body.values);
  const label = (body.label ?? '').trim().slice(0, 60) || TYPE_DEFAULTS[type].label;
  return prisma.$transaction(async (tx) => {
    if (body.locationId) {
      const loc = await tx.dealerLocation.findFirst({ where: { id: body.locationId, dealerId: actor.dealerId }, select: { id: true } });
      if (!loc) throw new ApiError('NOT_FOUND', 'Şube bulunamadı.');
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`remedy-tpl:${actor.dealerId}:${body.locationId ?? 'all'}:${type}`}))`;
    const dup = await tx.remedyTemplate.findFirst({ where: { dealerId: actor.dealerId, locationId: body.locationId, type }, select: { id: true } });
    if (dup) throw new ApiError('DUPLICATE_TEMPLATE', 'Bu kapsamda bu türden bir şablon zaten var. Mevcut şablonu düzenleyin.', { status: 409 });
    const last = await tx.remedyTemplate.findFirst({
      where: { dealerId: actor.dealerId, locationId: body.locationId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const created = await tx.remedyTemplate.create({
      data: {
        dealerId: actor.dealerId,
        locationId: body.locationId,
        type,
        label,
        unit: TYPE_DEFAULTS[type].unit,
        values,
        isActive: body.isActive,
        order: Math.min(999, (last?.order ?? -1) + 1),
      },
      select: { id: true },
    });
    await auditTpl(tx, actor, 'remedy_template.created', created.id, { locationId: body.locationId, type, label, values });
    return { id: created.id };
  });
}

export async function updateRemedyTemplate(
  actor: Actor,
  id: string,
  body: { label?: string | null; values?: unknown[]; isActive?: boolean; move?: 'up' | 'down' }
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const tpl = await tx.remedyTemplate.findFirst({ where: { id, dealerId: actor.dealerId }, select: { id: true, type: true, locationId: true, order: true } });
    if (!tpl) throw new ApiError('NOT_FOUND', 'Şablon bulunamadı.');
    const data: Prisma.RemedyTemplateUpdateManyMutationInput = {};
    if (body.values !== undefined) {
      if (!isRemedyOptionType(tpl.type)) throw new ApiError('VALIDATION', 'Bu şablonun türü artık desteklenmiyor; silip yeniden oluşturun.');
      data.values = cleanTemplateValues(tpl.type, body.values);
    }
    if (body.label !== undefined && isRemedyOptionType(tpl.type)) data.label = (body.label ?? '').trim().slice(0, 60) || TYPE_DEFAULTS[tpl.type].label;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (Object.keys(data).length > 0) await tx.remedyTemplate.updateMany({ where: { id, dealerId: actor.dealerId }, data });

    if (body.move) {
      // Kapsam içinde sırayı yeniden numaralar (müşteri ekranındaki seçenek sırası).
      const siblings = await tx.remedyTemplate.findMany({
        where: { dealerId: actor.dealerId, locationId: tpl.locationId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      const ids = siblings.map((s) => s.id);
      const i = ids.indexOf(id);
      const j = body.move === 'up' ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < ids.length) {
        [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
        for (let k = 0; k < ids.length; k++) {
          await tx.remedyTemplate.updateMany({ where: { id: ids[k], dealerId: actor.dealerId }, data: { order: k } });
        }
      }
    }
    await auditTpl(tx, actor, 'remedy_template.updated', id, { ...data, move: body.move ?? null } as Record<string, unknown>);
    return { id };
  });
}

/** Şablonun bağımlısı yoktur (teklifler seçenekleri anlık görüntü olarak saklar). */
export async function deleteRemedyTemplate(actor: Actor, id: string): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const tpl = await tx.remedyTemplate.findFirst({
      where: { id, dealerId: actor.dealerId },
      select: { id: true, type: true, label: true, values: true, locationId: true },
    });
    if (!tpl) throw new ApiError('NOT_FOUND', 'Şablon bulunamadı.');
    await tx.remedyTemplate.deleteMany({ where: { id, dealerId: actor.dealerId } });
    await auditTpl(tx, actor, 'remedy_template.deleted', id, { type: tpl.type, label: tpl.label, values: tpl.values, locationId: tpl.locationId });
    return { id };
  });
}

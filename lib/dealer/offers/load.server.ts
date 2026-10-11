/**
 * Teklifler (/dealer/offers) — sunucu yükleyicisi. Sayfa (SSR) ve `GET /api/dealer/offers`
 * AYNI fonksiyonu çağırır; kiracı kapsamı çağıranın verdiği `dealerId`'dir (rota
 * `resolveDealerScope` ile çözer).
 *
 * Bölümler birbirinden bağımsız yüklenir (`allSettled`): biri düşerse yalnız o kart hata
 * gösterir, diğerleri çalışır (denetim Bulgu 9: tek toast + her kartta "kayıt yok").
 */
import { prisma } from '@/lib/prisma';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { getModuleControls } from '@/lib/module-gate';
import { EXCLUDE_LEGACY_CHURN_FLASH } from '@/lib/churn-intervention-core';
import { clampHappyHourMultiplier } from '@/lib/points-multipliers';
import { isHappyHourLive, normalizeDaysOfWeek } from '@/lib/happy-hour-live';
import {
  DEFAULT_REMEDY_OPTIONS,
  formatRemedySelection,
  normalizeRemedyOptions,
  selectionFromStored,
  type RemedyOption,
} from '@/lib/remedy-options';
import { FLASH_MAX_OPEN, HAPPY_HOUR_MAX_ACTIVE, flashStatus } from './rules';
import type {
  DealerOffersOverview,
  FlashSection,
  HappyHourSection,
  PersonalOfferDto,
  PersonalOfferStatus,
  PersonalSection,
  RemedyTemplateGroup,
  RemedyTemplatesSection,
  SectionState,
} from './types';

const FLASH_LIST_LIMIT = 30;
const PERSONAL_LIST_LIMIT = 20;
export const REMEDY_TEMPLATES_EDIT_HREF = '/dealer/automation/remedy';

/** Kişiye özel (kaynaksız) telafi teklifi filtresi — B5: hedef müşteriye bağlı teklif. */
export function personalOfferWhere(dealerId: string) {
  return { dealerId, feedbackId: null, consumptionReviewId: null } as const;
}

/** Seçenek değer özeti: "%10 · %15 · %20", "50 · 100 puan", "1 adet". */
export function summarizeRemedyOption(o: RemedyOption): string {
  const vals = o.values.map((v) => (Number.isInteger(v) ? String(v) : v.toLocaleString('tr-TR')));
  if (o.type === 'discount' && o.unit === '%') return vals.map((v) => `%${v}`).join(' · ');
  return `${vals.join(' · ')} ${o.unit}`.trim();
}

function toError(reason: unknown): { status: 'error'; message: string } {
  console.error('[dealer-offers] bölüm yüklenemedi:', reason);
  return { status: 'error', message: 'Bu bölüm yüklenemedi. Tekrar deneyin.' };
}

async function loadFlash(dealerId: string, now: Date): Promise<FlashSection> {
  const [dealer, rows, savedByCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: dealerId },
      select: { latitude: true, longitude: true, businessName: true },
    }),
    prisma.dealerFlashOffer.findMany({
      // Eski churn sürümünün hedefsiz "kişiye özel" taslakları (B5 öncesi) listelenmez:
      // yayınlanamazlar (müşteri uçları dışlar) ve bayiyi yanıltırlar.
      where: { dealerId, ...EXCLUDE_LEGACY_CHURN_FLASH },
      orderBy: [{ validFrom: 'desc' }],
      take: FLASH_LIST_LIMIT + 1,
      select: {
        id: true,
        title: true,
        body: true,
        offerType: true,
        value: true,
        validFrom: true,
        validTo: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.customerFavoriteDealer.count({ where: { dealerId } }),
  ]);
  const items = rows.slice(0, FLASH_LIST_LIMIT).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    offerType: r.offerType,
    value: r.value,
    validFrom: r.validFrom.toISOString(),
    validTo: r.validTo.toISOString(),
    status: flashStatus(r, now),
    createdAt: r.createdAt.toISOString(),
  }));
  // Açık sayısı listeden değil DB'den: 30'dan eski ama hâlâ planlı kayıt kalmasın.
  const openCount = await countOpenFlashOffers(dealerId, now);
  return {
    hasLocation: dealer?.latitude != null && dealer?.longitude != null,
    hasBusinessName: !!dealer?.businessName?.trim(),
    savedByCount,
    openCount,
    maxOpen: FLASH_MAX_OPEN,
    items: items.sort((a, b) => statusRank(a.status) - statusRank(b.status)),
    hasMore: rows.length > FLASH_LIST_LIMIT,
  };
}

function statusRank(s: string): number {
  return s === 'live' ? 0 : s === 'scheduled' ? 1 : 2;
}

export async function countOpenFlashOffers(dealerId: string, now: Date): Promise<number> {
  return prisma.dealerFlashOffer.count({
    where: { dealerId, isActive: true, validTo: { gt: now }, ...EXCLUDE_LEGACY_CHURN_FLASH },
  });
}

async function loadHappyHours(dealerId: string, now: Date): Promise<HappyHourSection> {
  const rows = await prisma.happyHour.findMany({
    where: { dealerId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: {
      id: true,
      name: true,
      multiplier: true,
      startTime: true,
      endTime: true,
      daysOfWeek: true,
      isActive: true,
      validFrom: true,
      validUntil: true,
    },
  });
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    multiplier: clampHappyHourMultiplier(r.multiplier),
    startTime: r.startTime,
    endTime: r.endTime,
    daysOfWeek: normalizeDaysOfWeek(r.daysOfWeek),
    isActive: r.isActive,
    liveNow: isHappyHourLive(r, now),
    validFrom: r.validFrom?.toISOString() ?? null,
    validUntil: r.validUntil?.toISOString() ?? null,
  }));
  return { activeCount: items.filter((i) => i.isActive).length, maxActive: HAPPY_HOUR_MAX_ACTIVE, items };
}

function mapPersonalStatus(s: string): PersonalOfferStatus {
  return s === 'awaiting_dealer_approval' || s === 'pending' || s === 'accepted' || s === 'expired' || s === 'rejected'
    ? s
    : 'other';
}

/** Ad gizliliği: "Ayşe Yılmaz" → "Ayşe Y." (liste görünümü; tam ad müşteri 360'ta). */
export function shortCustomerName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Müşteri';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('tr-TR')}.`;
}

async function loadPersonal(dealerId: string, now: Date): Promise<PersonalSection> {
  const where = personalOfferWhere(dealerId);
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [rows, grouped, acceptedLast30, options] = await Promise.all([
    prisma.remedyOffer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PERSONAL_LIST_LIMIT,
      select: {
        id: true,
        status: true,
        message: true,
        options: true,
        selectedType: true,
        selectedValue: true,
        createdAt: true,
        acceptedAt: true,
        user: { select: { name: true } },
        timelineEvents: { where: { kind: 'created' }, take: 1, select: { meta: true } },
      },
    }),
    prisma.remedyOffer.groupBy({
      by: ['status'],
      where: { ...where, status: { in: ['awaiting_dealer_approval', 'pending'] } },
      _count: { _all: true },
    }),
    prisma.remedyOffer.count({ where: { ...where, status: 'accepted', acceptedAt: { gte: since } } }),
    loadBusinessRemedyOptions(dealerId),
  ]);
  const countOf = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const items: PersonalOfferDto[] = rows.map((r) => {
    const sel = selectionFromStored(r.options, r.selectedType, r.selectedValue);
    const meta = r.timelineEvents[0]?.meta as { trigger?: unknown } | null | undefined;
    const trigger = meta && typeof meta === 'object' ? meta.trigger : undefined;
    return {
      id: r.id,
      customerName: shortCustomerName(r.user?.name),
      status: mapPersonalStatus(r.status),
      message: r.message,
      selectionLabel: sel ? formatRemedySelection(sel) : null,
      origin: trigger === 'churn_intervention' ? 'churn' : trigger === 'dealer_personal' ? 'dealer' : 'unknown',
      createdAt: r.createdAt.toISOString(),
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
    };
  });
  return {
    awaitingApproval: countOf('awaiting_dealer_approval'),
    openWithCustomer: countOf('pending'),
    acceptedLast30,
    items,
    availableTypes: options.options.map((o) => ({ type: o.type, label: o.label, summary: summarizeRemedyOption(o) })),
  };
}

/**
 * İşletme geneli telafi seçenekleri. `getRemedyOptions` DB hatasını yutup varsayılana düşer;
 * burada hata YUTULMAZ (bölüm hata gösterir, sahte "varsayılan" gösterilmez).
 */
export async function loadBusinessRemedyOptions(dealerId: string): Promise<{ options: RemedyOption[]; usingSystemDefault: boolean }> {
  const rows = await prisma.remedyTemplate.findMany({
    where: { dealerId, locationId: null, isActive: true },
    orderBy: { order: 'asc' },
    select: { type: true, label: true, unit: true, values: true },
  });
  const options = normalizeRemedyOptions(rows);
  if (options.length > 0) return { options, usingSystemDefault: false };
  return { options: DEFAULT_REMEDY_OPTIONS, usingSystemDefault: true };
}

async function loadRemedyTemplates(dealerId: string): Promise<RemedyTemplatesSection> {
  const rows = await prisma.remedyTemplate.findMany({
    where: { dealerId },
    orderBy: [{ locationId: 'asc' }, { order: 'asc' }],
    take: 200,
    select: {
      type: true,
      label: true,
      unit: true,
      values: true,
      isActive: true,
      locationId: true,
      location: { select: { name: true } },
    },
  });
  const byLocation = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const list = byLocation.get(r.locationId) ?? [];
    list.push(r);
    byLocation.set(r.locationId, list);
  }
  const groups: RemedyTemplateGroup[] = [];
  const general = byLocation.get(null) ?? [];
  const generalOptions = normalizeRemedyOptions(general.filter((r) => r.isActive));
  const usingSystemDefault = generalOptions.length === 0;
  groups.push({
    locationId: null,
    locationName: null,
    options: (usingSystemDefault ? DEFAULT_REMEDY_OPTIONS : generalOptions).map((o) => ({ ...o, summary: summarizeRemedyOption(o) })),
    inactiveCount: general.filter((r) => !r.isActive).length,
  });
  for (const [locationId, list] of byLocation) {
    if (locationId === null) continue;
    const opts = normalizeRemedyOptions(list.filter((r) => r.isActive));
    groups.push({
      locationId,
      locationName: list[0]?.location?.name ?? null,
      options: opts.map((o) => ({ ...o, summary: summarizeRemedyOption(o) })),
      inactiveCount: list.filter((r) => !r.isActive).length,
    });
  }
  return { usingSystemDefault, groups, editHref: REMEDY_TEMPLATES_EDIT_HREF };
}

function settle<T>(r: PromiseSettledResult<T>): SectionState<T> {
  return r.status === 'fulfilled' ? { status: 'ready', data: r.value } : toError(r.reason);
}

/** Tüm Teklifler görünümü. Kapalı bölümler sorgulanmaz bile. */
export async function loadDealerOffers(dealerId: string, now: Date = new Date()): Promise<DealerOffersOverview> {
  const [cfg, modules] = await Promise.all([
    getInnovationPlatformConfig().catch(() => null),
    getModuleControls().catch(() => ({}) as Record<string, boolean>),
  ]);
  // Platform ayarı okunamazsa flash bölümü hata gösterir (sessizce "açık" varsayılmaz).
  const flashEnabled = cfg ? cfg.features.flashOffers !== false : null;
  const remedyEnabled = (modules as Record<string, boolean>).remedy_offers !== false;

  const [flash, happyHours, personal, remedyTemplates] = await Promise.allSettled([
    flashEnabled ? loadFlash(dealerId, now) : Promise.resolve(null),
    loadHappyHours(dealerId, now),
    remedyEnabled ? loadPersonal(dealerId, now) : Promise.resolve(null),
    remedyEnabled ? loadRemedyTemplates(dealerId) : Promise.resolve(null),
  ]);

  return {
    generatedAt: now.toISOString(),
    flash:
      flashEnabled === null
        ? toError(new Error('innovation config okunamadı'))
        : flashEnabled
          ? (settle(flash) as SectionState<FlashSection>)
          : { status: 'disabled', reason: 'platform' },
    happyHours: settle(happyHours),
    personal: remedyEnabled ? (settle(personal) as SectionState<PersonalSection>) : { status: 'disabled', reason: 'module' },
    remedyTemplates: remedyEnabled
      ? (settle(remedyTemplates) as SectionState<RemedyTemplatesSection>)
      : { status: 'disabled', reason: 'module' },
  };
}


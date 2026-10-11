/**
 * Teklifler (/dealer/offers) — yazma servisleri. Rota katmanı (defineRoute) rol, kiracı,
 * zod ve hız sınırını uygular; burada iş kuralları + denetim izi + kilit vardır.
 *
 *  - Flash teklif: sunucu otoriter pencere (İstanbul), tür başına değer sınırı, aynı anda en
 *    fazla `FLASH_MAX_OPEN` açık teklif (advisory kilit altında sayılır → çift tık iki teklif
 *    açamaz), durdurma koşullu `updateMany` (yarış yok). Silme YOK: geçmiş arşiv olarak kalır.
 *  - Mutlu saat: platformun tek yazma şeması (`happyHourCreateSchema`, çarpan [1,3]) ile
 *    yeniden doğrulanır; puan çarpanı yalnız tüketim akışında (lib/consumption) uygulanır.
 *  - Kişiye özel teklif (B5 / P0-22): hedef müşteriye bağlı `RemedyOffer` (kaynaksız kişisel).
 *    Yalnız bu işletmeyi ziyaret etmiş müşteri; kampanya bildirimini kapatan müşteriye
 *    gönderilmez; seçenekler işletmenin telafi şablonu allowlist'inden gelir; puan türü kabulde
 *    `lib/economy` üzerinden (acceptRemedyOffer → mintPoints, bayi günlük bütçesi) basılır.
 */
import { createHmac } from 'crypto';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { dealerFlashGeoKey } from '@/lib/innovation-geo';
import { EXCLUDE_LEGACY_CHURN_FLASH } from '@/lib/churn-intervention-core';
import { happyHourCreateSchema } from '@/lib/happy-hour-live';
import { getDealerCustomerStats } from '@/lib/dealer-customer-stats';
import { resolveMarketingAudience } from '@/lib/marketing-delivery';
import { createRemedyOffer, isRemedyOfferError, REMEDY_OPEN_STATUSES } from '@/lib/remedy-offer-service';
import {
  FLASH_MAX_OPEN,
  HAPPY_HOUR_MAX_ACTIVE,
  flashStatus,
  foldTr,
  resolveFlashWindow,
  type DealerHappyHourInput,
  type FlashCreateInput,
  type PersonalOfferInput,
} from './rules';
import { countOpenFlashOffers, loadBusinessRemedyOptions, personalOfferWhere } from './load.server';
import type { PersonalCandidateDto } from './types';

export interface AuditMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

// ───────────────────────────── Flash teklif ─────────────────────────────

export async function createFlashOffer(params: {
  dealerId: string;
  actorId: string;
  input: FlashCreateInput;
  audit: AuditMeta;
  now?: Date;
}) {
  const { dealerId, actorId, input, audit } = params;
  const now = params.now ?? new Date();
  const win = resolveFlashWindow(input, now);
  if (!win.ok) {
    throw new ApiError('VALIDATION', win.message, { details: [{ path: win.path, message: win.message }] });
  }

  const dealer = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { role: true, latitude: true, longitude: true, businessName: true },
  });
  if (!dealer || dealer.role !== 'DEALER') throw new ApiError('FORBIDDEN');
  if (!dealer.businessName?.trim()) {
    // Müşteri listeleri adsız mekânın teklifini göstermez (lib/places) → sahte başarı olurdu.
    throw new ApiError('BUSINESS_NAME_REQUIRED', 'Teklifin müşterilere görünmesi için önce Ayarlar → İşletme bölümünden işletme adınızı girin.', {
      status: 409,
    });
  }
  const geohash5 =
    dealer.latitude != null && dealer.longitude != null ? dealerFlashGeoKey(dealer.latitude, dealer.longitude) : null;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flash-offer:${dealerId}`}))`;
    const open = await tx.dealerFlashOffer.count({
      where: { dealerId, isActive: true, validTo: { gt: now }, ...EXCLUDE_LEGACY_CHURN_FLASH },
    });
    if (open >= FLASH_MAX_OPEN) {
      throw new ApiError(
        'FLASH_LIMIT',
        `Aynı anda en fazla ${FLASH_MAX_OPEN} canlı ya da planlı teklif olabilir. Yenisini açmak için birini durdurun.`,
        { status: 409 }
      );
    }
    const offer = await tx.dealerFlashOffer.create({
      data: {
        dealerId,
        title: input.title,
        body: input.body,
        offerType: input.offerType,
        value: input.offerType === 'COMPLIMENTARY' ? null : input.value,
        validFrom: win.validFrom,
        validTo: win.validTo,
        isActive: true,
        geohash5,
      },
      select: { id: true, validFrom: true, validTo: true, isActive: true },
    });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'CREATE_FLASH_OFFER',
        entity: 'DealerFlashOffer',
        entityId: offer.id,
        newData: {
          dealerId,
          title: input.title,
          offerType: input.offerType,
          value: input.offerType === 'COMPLIMENTARY' ? null : input.value,
          validFrom: offer.validFrom.toISOString(),
          validTo: offer.validTo.toISOString(),
        },
        ...audit,
      },
    });
    return { id: offer.id, status: flashStatus(offer, now), hasLocation: geohash5 != null };
  });
}

export async function stopFlashOffer(params: { dealerId: string; actorId: string; offerId: string; audit: AuditMeta; now?: Date }) {
  const { dealerId, actorId, offerId, audit } = params;
  const now = params.now ?? new Date();
  const existing = await prisma.dealerFlashOffer.findFirst({
    where: { id: offerId, dealerId },
    select: { id: true, isActive: true, validFrom: true, validTo: true },
  });
  if (!existing) throw new ApiError('NOT_FOUND', 'Teklif bulunamadı.');
  const status = flashStatus(existing, now);
  if (status !== 'live' && status !== 'scheduled') {
    throw new ApiError('ALREADY_ENDED', 'Bu teklif zaten sona ermiş.', { status: 409 });
  }
  // Canlıysa bitişi şimdiye çekilir (geçmişte gerçek yayın süresi görünür); planlıysa korunur.
  const n = await prisma.dealerFlashOffer.updateMany({
    where: { id: offerId, dealerId, isActive: true, validTo: { gt: now } },
    data: { isActive: false, ...(status === 'live' ? { validTo: now } : {}) },
  });
  if (n.count === 0) throw new ApiError('ALREADY_ENDED', 'Bu teklif zaten sona ermiş.', { status: 409 });
  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: 'STOP_FLASH_OFFER',
      entity: 'DealerFlashOffer',
      entityId: offerId,
      oldData: { status, validTo: existing.validTo.toISOString() },
      newData: { isActive: false, stoppedAt: now.toISOString() },
      ...audit,
    },
  });
  return { id: offerId, status: 'stopped' as const, openCount: await countOpenFlashOffers(dealerId, now) };
}

// ───────────────────────────── Mutlu saat ─────────────────────────────

export async function createDealerHappyHour(params: { dealerId: string; actorId: string; input: DealerHappyHourInput; audit: AuditMeta }) {
  const { dealerId, actorId, input, audit } = params;
  // Platformun tek mutlu saat yazma şeması (P0-13) son söz: çarpan [1,3], SS:dd, gün 0–6.
  const canonical = happyHourCreateSchema.safeParse({ ...input, description: null, validFrom: null, validUntil: null });
  if (!canonical.success) {
    const issue = canonical.error.issues[0];
    throw new ApiError('VALIDATION', issue?.message, {
      details: canonical.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const d = canonical.data;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`happy-hour:${dealerId}`}))`;
    const active = await tx.happyHour.count({ where: { dealerId, isActive: true } });
    if (active >= HAPPY_HOUR_MAX_ACTIVE) {
      throw new ApiError('HAPPY_HOUR_LIMIT', `En fazla ${HAPPY_HOUR_MAX_ACTIVE} açık mutlu saat olabilir. Birini kapatıp tekrar deneyin.`, {
        status: 409,
      });
    }
    const created = await tx.happyHour.create({
      data: {
        dealerId,
        name: d.name,
        description: null,
        multiplier: d.multiplier ?? 2,
        startTime: d.startTime,
        endTime: d.endTime,
        daysOfWeek: d.daysOfWeek,
        validFrom: null,
        validUntil: null,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: 'CREATE_HAPPY_HOUR',
        entity: 'HappyHour',
        entityId: created.id,
        newData: { dealerId, name: d.name, multiplier: d.multiplier, startTime: d.startTime, endTime: d.endTime, daysOfWeek: d.daysOfWeek },
        ...audit,
      },
    });
    return { id: created.id };
  });
}

export async function setDealerHappyHourActive(params: {
  dealerId: string;
  actorId: string;
  happyHourId: string;
  isActive: boolean;
  audit: AuditMeta;
}) {
  const { dealerId, actorId, happyHourId, isActive, audit } = params;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`happy-hour:${dealerId}`}))`;
    const existing = await tx.happyHour.findFirst({ where: { id: happyHourId, dealerId }, select: { isActive: true } });
    if (!existing) throw new ApiError('NOT_FOUND', 'Mutlu saat bulunamadı.');
    if (existing.isActive === isActive) return { id: happyHourId, isActive };
    if (isActive) {
      const active = await tx.happyHour.count({ where: { dealerId, isActive: true } });
      if (active >= HAPPY_HOUR_MAX_ACTIVE) {
        throw new ApiError('HAPPY_HOUR_LIMIT', `En fazla ${HAPPY_HOUR_MAX_ACTIVE} açık mutlu saat olabilir.`, { status: 409 });
      }
    }
    // Platform geneli (dealerId null) kayıtlar bu koşulla asla eşleşmez.
    await tx.happyHour.updateMany({ where: { id: happyHourId, dealerId }, data: { isActive } });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: isActive ? 'RESUME_HAPPY_HOUR' : 'PAUSE_HAPPY_HOUR',
        entity: 'HappyHour',
        entityId: happyHourId,
        oldData: { isActive: existing.isActive },
        newData: { isActive },
        ...audit,
      },
    });
    return { id: happyHourId, isActive };
  });
}

// ───────────────────────────── Kişiye özel teklif ─────────────────────────────

const CANDIDATE_POOL = 300;
const RESOLVE_POOL = 1000;

/** Bayiye özgü, geri çevrilemez müşteri referansı (ham kullanıcı kimliği istemciye gitmez). */
export function personalRef(dealerId: string, customerId: string): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'qratex-offer-ref';
  return 'o_' + createHmac('sha256', secret).update(`offers:${dealerId}:${customerId}`).digest('hex').slice(0, 16);
}

export async function searchPersonalCandidates(dealerId: string, q: string): Promise<PersonalCandidateDto[]> {
  const { stats } = await getDealerCustomerStats(dealerId, { sort: 'recent', limit: CANDIDATE_POOL });
  const ids = stats.map((s) => s.customerId).filter((id) => id !== dealerId);
  if (ids.length === 0) return [];
  const [users, audience, open, staff] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids }, role: 'CUSTOMER', anonymizedAt: null },
      select: { id: true, name: true },
    }),
    resolveMarketingAudience(ids),
    prisma.remedyOffer.findMany({
      where: { ...personalOfferWhere(dealerId), userId: { in: ids }, status: { in: [...REMEDY_OPEN_STATUSES] } },
      select: { userId: true },
    }),
    // İşletme içi kişi (personel kaydı, pasif dahil) aday değildir — bkz. sendPersonalOffer.
    prisma.dealerStaff.findMany({ where: { dealerId, userId: { in: ids } }, select: { userId: true } }),
  ]);
  const insiders = new Set(staff.map((s) => s.userId));
  const nameById = new Map(users.filter((u) => !insiders.has(u.id)).map((u) => [u.id, u.name?.trim() || null]));
  const reachable = new Set(audience.appUserIds);
  const openSet = new Set(open.map((o) => o.userId));
  const needle = foldTr(q.trim());
  const out: PersonalCandidateDto[] = [];
  for (const s of stats) {
    const name = nameById.get(s.customerId);
    if (!name) continue; // müşteri değil / anonimleşmiş / adsız
    if (needle && !foldTr(name).includes(needle)) continue;
    out.push({
      ref: personalRef(dealerId, s.customerId),
      name,
      visitCount: s.visitCount,
      lastVisitAt: s.lastVisitAt ? s.lastVisitAt.toISOString() : null,
      reachable: reachable.has(s.customerId),
      hasOpenOffer: openSet.has(s.customerId),
    });
    if (out.length >= 20) break;
  }
  return out;
}

export async function sendPersonalOffer(params: { dealerId: string; actorId: string; input: PersonalOfferInput; audit: AuditMeta }) {
  const { dealerId, actorId, input, audit } = params;
  const { stats } = await getDealerCustomerStats(dealerId, { sort: 'recent', limit: RESOLVE_POOL });
  const match = stats.find((s) => s.customerId !== dealerId && personalRef(dealerId, s.customerId) === input.ref);
  if (!match) {
    throw new ApiError('NOT_FOUND', 'Müşteri bulunamadı. Kişiye özel teklif yalnız işletmenizi ziyaret etmiş müşterilere gönderilebilir.');
  }
  const customerId = match.customerId;

  // Puan basma açığı: işletme kendi personeline (müşteri rolündeki personel hesabı) puan türlü
  // kişisel teklif gönderip kabul ettirerek bütçesinden puan aktarabiliyordu. İşletme içi kişi
  // tarafsız müşteri değildir (geri bildirim/görev/lig ile aynı kural) → yokmuş gibi 404.
  const insider = await prisma.dealerStaff.findFirst({ where: { dealerId, userId: customerId }, select: { id: true } });
  if (insider) {
    throw new ApiError('NOT_FOUND', 'Müşteri bulunamadı. İşletme personeline kişiye özel teklif gönderilemez.');
  }

  // Ticari ileti: müşteri "Kampanya & Sürprizler" uygulama içi bildirimini kapattıysa gönderilmez.
  // Fail-closed: tercih okunamazsa hata fırlar, teklif açılmaz.
  const audience = await resolveMarketingAudience([customerId]);
  if (audience.ineligibleCount > 0) throw new ApiError('NOT_FOUND', 'Müşteri bulunamadı.');
  if (!audience.appUserIds.includes(customerId)) {
    throw new ApiError('CUSTOMER_OPTED_OUT', 'Bu müşteri kampanya bildirimlerini kapattığı için kişiye özel teklif gönderilemez.', {
      status: 409,
    });
  }

  const { options } = await loadBusinessRemedyOptions(dealerId);
  const chosen = options.filter((o) => (input.types as string[]).includes(o.type));
  if (chosen.length === 0) {
    throw new ApiError('NO_OPTIONS', 'Seçtiğiniz telafi türleri işletmenizin telafi şablonlarında yok.', { status: 422 });
  }

  try {
    const result = await createRemedyOffer({
      source: { kind: 'personal' },
      dealerId,
      userId: customerId,
      message: input.message,
      mode: 'send',
      options: chosen,
      createdLabel: 'İşletme kişiye özel teklif gönderdi',
      createdMeta: { trigger: 'dealer_personal', actorId },
      // Geçmişte kabul edilmiş bir kişisel teklif yenisini engellemez; AÇIK olan engeller.
      blockIfAccepted: false,
    });
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: 'SEND_PERSONAL_OFFER',
        entity: 'RemedyOffer',
        entityId: result.offerId,
        newData: { dealerId, types: chosen.map((o) => o.type), messageLength: input.message.length },
        ...audit,
      },
    });
    return { offerId: result.offerId, status: result.status };
  } catch (err) {
    if (isRemedyOfferError(err)) {
      const message =
        err.code === 'OPEN_OFFER_EXISTS'
          ? 'Bu müşteride henüz yanıtlanmamış bir kişisel teklif var. Yanıtlanınca yenisini gönderebilirsiniz.'
          : err.message;
      throw new ApiError(err.code, message, { status: err.status });
    }
    throw err;
  }
}

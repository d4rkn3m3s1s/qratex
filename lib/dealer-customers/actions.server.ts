/**
 * Bayi → Müşteriler — segment / geri kazanım / seçili müşteri AKSİYONLARI (önizle → onayla → gönder).
 *
 * Eski yüzeylerin kök hataları (segment-actions Bulgu 1-2, radar Bulgu 1-4, churn-risk Bulgu 1):
 *  - İstemci alıcı kimliği yolluyor, uçlar farklı gövde bekliyordu (4/5 buton 400).
 *  - Risk aksiyonu onaysız GERÇEK bildirim gönderiyor, kartta görünenden farklı kitleye gidiyordu.
 *  - Win-back "5X puan" gibi sistemde karşılığı olmayan vaatler gönderiyordu; aynı 100 kişiye her
 *    tıkta yeniden gidiyor, kalan alıcılara ulaşılamıyordu; tercih ve sıklık tavanı yoktu.
 *
 * Buradaki sözleşme:
 *  1. Alıcıları SUNUCU çözer (segment/band tanımı ya da imzalı müşteri referansları; referans
 *     başka işletmeninse düşer). Sıra deterministiktir (öncelik/risk/harcama).
 *  2. Eleme sırası: müşteri hesabı → "Kampanya & Sürprizler" tercihi (izin; İYS ilkesi) →
 *     7 günlük sıklık tavanı (bu işletmeden ileti ya da kişisel teklif) → gönderim ve günlük tavan.
 *     Önizleme ve sonuç aynı sayıları döner; 0 kişiye gidince başarı gibi görünmez.
 *  3. İki tür aksiyon: `message` (vaatsiz davet/teşekkür/hoş geldin/fikir sorma) ve
 *     `personal_offer` (müşteriye BAĞLI gerçek teklif: telafi şablonlarından seçenek, kabul
 *     ve kasada kullanım mevcut telafi akışıyla; puan yalnız o akışın ekonomi yolundan).
 *  4. Her çalışma `AnalyticsEvent` olarak kaydedilir (geçmiş + 14 günlük geri dönüş atfı).
 */
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { isChannelEnabled } from '@/lib/notification-prefs';
import { MARKETING_KINDS, buildMarketingNotificationRows } from '@/lib/marketing-delivery';
import { getRemedyOptions } from '@/lib/remedy-options';
import { createRemedyOffer, isRemedyOfferError } from '@/lib/remedy-offer-service';
import {
  buildActionMessage,
  cooldownSince,
  enrichRows,
  istanbulDayStart,
  partitionRecipients,
  sanitizeNote,
  type EnrichedRow,
  type RecipientCandidate,
} from './core';
import { decodeCustomerRef } from './ref';
import { ACTION_EVENT, audienceLabelOf, lastContactMap, loadUniverse, type ActionEventData } from './server';
import {
  DAILY_DEALER_RECIPIENT_CAP,
  MAX_MESSAGE_RECIPIENTS,
  MAX_OFFER_RECIPIENTS,
  NOTE_MAX,
  type ActionAudience,
  type ActionPreview,
  type ActionResult,
  type ActionSpec,
} from './types';

export const PERSONAL_OFFER_DEFAULT_MESSAGE =
  'Sizi yeniden ağırlamak isteriz — size özel teklifinizi aşağıdan seçebilirsiniz.';

/** Müşteri bildirimindeki bağlantı: müşterinin mekân sayfası (Keşfet → mekân detayı). */
export function placeCtaPath(dealerId: string): string {
  return `/customer/places/${encodeURIComponent(dealerId)}`;
}

function orderFor(audience: ActionAudience, rows: EnrichedRow[]): EnrichedRow[] {
  if (audience.kind === 'band') {
    return rows
      .filter((r) => r.band && (audience.band === 'all' || r.band === audience.band))
      .sort((a, b) => b.priority - a.priority);
  }
  if (audience.kind === 'segment') {
    const members = rows.filter((r) => r.tags.includes(audience.tag));
    if (audience.tag === 'at_risk') return members.sort((a, b) => (b.churnRisk ?? 0) - (a.churnRisk ?? 0) || b.totalSpend - a.totalSpend);
    if (audience.tag === 'dormant') return members.sort((a, b) => b.priority - a.priority);
    if (audience.tag === 'new') return members.sort((a, b) => (b.firstVisitAt?.getTime() ?? 0) - (a.firstVisitAt?.getTime() ?? 0));
    return members.sort((a, b) => b.totalSpend - a.totalSpend);
  }
  return [];
}

/** Hedef kitleyi SUNUCUDA çözer (yalnız bu işletmenin müşterileri). */
export async function resolveAudience(dealerId: string, audience: ActionAudience, now: Date): Promise<string[]> {
  const universe = await loadUniverse(dealerId, now);
  if (audience.kind === 'customers') {
    const own = new Set(universe.rows.map((r) => r.customerId));
    const ids: string[] = [];
    for (const ref of audience.refs) {
      const id = decodeCustomerRef(dealerId, ref);
      if (id && own.has(id) && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }
  const { rows } = enrichRows(universe.rows, now);
  return orderFor(audience, rows).map((r) => r.customerId);
}

type AccountRow = { id: string; role: string; anonymizedAt: Date | null; notificationPrefs: unknown; preferredLanguage: string | null };

async function buildCandidates(dealerId: string, ids: string[], spec: ActionSpec, now: Date) {
  const [accounts, contacts] = await Promise.all([
    ids.length
      ? prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, role: true, anonymizedAt: true, notificationPrefs: true, preferredLanguage: true },
        })
      : Promise.resolve([]),
    lastContactMap(dealerId, ids, cooldownSince(now)),
  ]);
  const byId = new Map(((accounts ?? []) as AccountRow[]).map((a) => [a.id, a]));
  const candidates: RecipientCandidate[] = ids.map((id) => {
    const a = byId.get(id);
    const eligibleAccount = !!a && a.role === 'CUSTOMER' && !a.anonymizedAt;
    const app = eligibleAccount && isChannelEnabled(a!.notificationPrefs, 'campaign', 'app');
    const push = eligibleAccount && isChannelEnabled(a!.notificationPrefs, 'campaign', 'push');
    // Kişisel teklif uygulama içinde seçilir → uygulama içi kanal şart.
    const reachable = spec.type === 'personal_offer' ? app : app || push;
    return { customerId: id, eligibleAccount, reachable, contactedRecently: contacts.has(id) };
  });
  return { candidates, accounts: byId };
}

/** Bugün (İstanbul) bu işletmenin aksiyonlarla ulaştığı alıcı sayısı. */
async function sentToday(dealerId: string, now: Date): Promise<number> {
  const events =
    (await prisma.analyticsEvent.findMany({
      where: { userId: dealerId, event: ACTION_EVENT, category: 'dealer', createdAt: { gte: istanbulDayStart(now) } },
      select: { data: true },
      take: 500,
    })) ?? [];
  let total = 0;
  for (const e of events) {
    const d = (e.data ?? {}) as { sent?: unknown; offersCreated?: unknown };
    total += (typeof d.sent === 'number' ? d.sent : 0) + (typeof d.offersCreated === 'number' ? d.offersCreated : 0);
  }
  return total;
}

async function businessNameOf(dealerId: string): Promise<string> {
  const d = await prisma.user.findUnique({ where: { id: dealerId }, select: { businessName: true, name: true } });
  return (d?.businessName || d?.name || '').trim();
}

function capFor(spec: ActionSpec): number {
  return spec.type === 'personal_offer' ? MAX_OFFER_RECIPIENTS : MAX_MESSAGE_RECIPIENTS;
}

async function prepare(dealerId: string, audience: ActionAudience, spec: ActionSpec, now: Date) {
  const ids = await resolveAudience(dealerId, audience, now);
  const [{ candidates, accounts }, today, bizName, options] = await Promise.all([
    buildCandidates(dealerId, ids, spec, now),
    sentToday(dealerId, now),
    businessNameOf(dealerId),
    spec.type === 'personal_offer' ? getRemedyOptions(dealerId, null) : Promise.resolve(null),
  ]);
  const dailyRemaining = Math.max(0, DAILY_DEALER_RECIPIENT_CAP - today);
  const cap = Math.min(capFor(spec), dailyRemaining);
  const part = partitionRecipients(candidates, cap);
  const note = sanitizeNote(spec.note, NOTE_MAX);
  const sample =
    spec.type === 'message'
      ? buildActionMessage(spec.template, bizName, note, 'tr')
      : { title: 'Size özel teklif', message: note || PERSONAL_OFFER_DEFAULT_MESSAGE };
  return { ids, candidates, accounts, part, cap, dailyRemaining, note, sample, bizName, options };
}

export async function previewAction(dealerId: string, audience: ActionAudience, spec: ActionSpec, now: Date = new Date()): Promise<ActionPreview> {
  const p = await prepare(dealerId, audience, spec, now);
  return {
    candidates: p.ids.length,
    eligible: p.part.eligible.length,
    skipped: p.part.skipped,
    cap: p.cap,
    dailyRemaining: p.dailyRemaining,
    sample: p.sample,
    offerOptions: p.options ? p.options.map((o) => ({ type: o.type, label: o.label, unit: o.unit, values: [...o.values] })) : null,
  };
}

export interface ExecuteOutput extends ActionResult {
  /** Yanıttan SONRA gönderilecek push işleri (route `after()` ile çalıştırır). */
  push: Array<{ userIds: string[]; title: string; message: string; url: string }>;
}

export async function executeAction(
  dealerId: string,
  actorId: string,
  audience: ActionAudience,
  spec: ActionSpec,
  now: Date = new Date()
): Promise<ExecuteOutput> {
  const p = await prepare(dealerId, audience, spec, now);
  if (p.cap <= 0) {
    throw new ApiError('RATE_LIMITED', 'Bugünkü gönderim tavanına ulaşıldı. Yarın yeniden deneyebilirsiniz.', { status: 429 });
  }
  if (p.part.eligible.length === 0) {
    throw new ApiError('CONFLICT', 'Uygun alıcı yok: hepsi izin vermemiş, yakın zamanda iletişim kurulmuş ya da hesabı kapalı.', {
      details: { skipped: p.part.skipped },
    });
  }

  const runId = `run_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ctaPath = placeCtaPath(dealerId);
  let sent = 0;
  let offersCreated = 0;
  let conflicts = 0;
  const push: ExecuteOutput['push'] = [];

  if (spec.type === 'message') {
    const kind = spec.template === 'winback' ? MARKETING_KINDS.winBack : MARKETING_KINDS.campaign;
    const groups: Record<'tr' | 'en', { app: string[]; push: string[] }> = { tr: { app: [], push: [] }, en: { app: [], push: [] } };
    for (const id of p.part.eligible) {
      const a = p.accounts.get(id);
      const lang: 'tr' | 'en' = a?.preferredLanguage === 'en' ? 'en' : 'tr';
      if (isChannelEnabled(a?.notificationPrefs, 'campaign', 'app')) groups[lang].app.push(id);
      if (isChannelEnabled(a?.notificationPrefs, 'campaign', 'push')) groups[lang].push.push(id);
    }
    for (const lang of ['tr', 'en'] as const) {
      const g = groups[lang];
      if (g.app.length === 0 && g.push.length === 0) continue;
      const msg = buildActionMessage(spec.template, p.bizName, p.note, lang);
      if (g.app.length > 0) {
        const rows = buildMarketingNotificationRows(g.app, {
          title: msg.title,
          message: msg.message,
          // Tür 'campaign': Kampanyalar yüzeyinin sıklık sayacı da bu iletileri görür (tek tavan).
          type: 'campaign',
          kind,
          data: { dealerId, runId, template: spec.template, ctaPath },
        });
        const res = await prisma.notification.createMany({ data: rows });
        sent += typeof res?.count === 'number' ? res.count : rows.length;
      }
      if (g.push.length > 0) push.push({ userIds: g.push, title: msg.title, message: msg.message, url: ctaPath });
    }
    // Yalnız push'u açık (uygulama içi kapalı) alıcılar da "ulaşıldı" sayılır.
    const appSet = new Set([...groups.tr.app, ...groups.en.app]);
    sent += [...groups.tr.push, ...groups.en.push].filter((id) => !appSet.has(id)).length;
  } else {
    const options = p.options ?? [];
    if (options.length === 0) {
      throw new ApiError('CONFLICT', 'Geçerli bir teklif seçeneği tanımlı değil. Telafi şablonlarınızı kontrol edin.');
    }
    for (const userId of p.part.eligible) {
      try {
        await createRemedyOffer({
          source: { kind: 'personal' },
          dealerId,
          userId,
          message: p.note || PERSONAL_OFFER_DEFAULT_MESSAGE,
          mode: 'send',
          options,
          createdLabel: 'Müşteriler ekranından kişisel teklif gönderildi',
          createdMeta: { trigger: 'customers_360', runId, actorId },
          blockIfAccepted: false,
        });
        offersCreated++;
      } catch (err) {
        if (isRemedyOfferError(err)) conflicts++;
        else throw err;
      }
    }
  }

  const audienceMeta =
    audience.kind === 'segment'
      ? { kind: 'segment', tag: audience.tag }
      : audience.kind === 'band'
        ? { kind: 'band', band: audience.band }
        : { kind: 'customers', count: p.ids.length };
  const data: ActionEventData = {
    runId,
    actorId,
    action: spec.type,
    template: spec.type === 'message' ? spec.template : null,
    audience: audienceMeta,
    audienceLabel: audienceLabelOf(audienceMeta),
    recipients: p.part.eligible.slice(0, 250),
    sent,
    offersCreated,
    conflicts,
    skipped: p.part.skipped,
  };
  await prisma.analyticsEvent.create({
    data: { userId: dealerId, event: ACTION_EVENT, category: 'dealer', data: data as unknown as object },
  });

  return { runId, sent, offersCreated, conflicts, skipped: p.part.skipped, push };
}

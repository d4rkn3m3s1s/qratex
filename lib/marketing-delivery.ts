/**
 * PAZARLAMA GÖNDERİM KAPISI — P0-35 (bayi F3/F4/F11 acil kapısı).
 *
 * Kök neden: kampanya, win-back, risk segmenti ve inovasyon segment önerisi uçları
 * `prisma.notification.createMany` + `sendPushNotification`'ı DOĞRUDAN çağırıyordu:
 *  - müşterinin "Kampanya & Sürprizler" bildirim tercihi (uygulama içi / push) hiç okunmuyordu,
 *  - bildirimlere `data.kind` yazılmadığı için tercih motoru (`kindToGroup`) devreye bile giremezdi,
 *  - "E-posta" kanalı sahteydi: e-posta gönderilmiyor, push da atlanıyordu.
 *
 * Bu modül, bayi kaynaklı HER toplu ticari iletinin geçmesi gereken tek kapıdır:
 *  1. `resolveMarketingAudience` — alıcıları tek sorguda okur; yalnız aktif MÜŞTERİ hesapları
 *     (anonimleştirilmemiş) kalır; kanal başına `isChannelEnabled(prefs, 'campaign', kanal)`.
 *     FAIL-CLOSED: tercih okunamazsa (DB hatası) hata fırlatılır, hiçbir şey gönderilmez.
 *  2. `buildMarketingNotificationRows` — her bildirim `data.kind` taşır (grubu 'campaign').
 *  3. `sendMarketingPush` — yalnız push'u açık kullanıcılara, sınırlı eşzamanlılıkla.
 *
 * Kalıcı çözüm (bayi bazlı pazarlama izni, frekans tavanı, teslim kayıtları) F2.6
 * `MarketingMessenger` kapsamındadır; bu dosya o servisin çekirdeğine dönüşecek şekilde yazıldı.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isChannelEnabled, kindToGroup } from '@/lib/notification-prefs';
import { sendPush } from '@/lib/push';

/** Pazarlama iletilerinin düştüğü bildirim tercih grubu. */
export const MARKETING_PREF_GROUP = 'campaign';

/**
 * Pazarlama bildirim türleri (`data.kind`). Hepsi `kindToGroup` ile 'campaign' grubuna düşer;
 * bu eşleme `__tests__/lib/marketing-delivery.test.ts` ile kilitlidir.
 */
export const MARKETING_KINDS = {
  campaign: 'campaign',
  winBack: 'campaign-win-back',
  riskSegment: 'campaign-risk-segment',
  segmentProposal: 'campaign-segment-proposal',
} as const;

export type MarketingKind = (typeof MARKETING_KINDS)[keyof typeof MARKETING_KINDS];

/** Kampanya kanalı olarak gerçekten teslim edilebilen tek kanal. */
export const SUPPORTED_CAMPAIGN_CHANNELS = ['notification'] as const;

export const EMAIL_CHANNEL_UNAVAILABLE_MESSAGE =
  'E-posta kanalı şu an kullanılamıyor. Kampanyanızı uygulama içi bildirim ve push ile gönderebilirsiniz.';

/** Kampanya kanalı gerçekten teslim edilebiliyor mu? (sahte "email" kanalı → false) */
export function isSupportedCampaignChannel(channel: unknown): boolean {
  return typeof channel === 'string' && (SUPPORTED_CAMPAIGN_CHANNELS as readonly string[]).includes(channel);
}

export interface MarketingAudience {
  /** Tekilleştirilmiş aday sayısı (geçerli kimlikler). */
  candidateCount: number;
  /** Hesabı yok / müşteri değil / anonimleştirilmiş adaylar. */
  ineligibleCount: number;
  /** Uygun ama iki kanalı da (uygulama içi + push) kapatmış müşteriler. */
  optedOutCount: number;
  /** En az bir kanaldan ulaşılabilen müşteri sayısı. */
  reachCount: number;
  /** Uygulama içi bildirimi açık müşteriler. */
  appUserIds: string[];
  /** Push'u açık müşteriler. */
  pushUserIds: string[];
}

type AudienceRow = {
  id: string;
  role: string;
  anonymizedAt: Date | null;
  notificationPrefs: Prisma.JsonValue | null;
};

/** Saf karar: satırlardan kanal bazlı izinli kitleyi çıkarır (test edilebilir). */
export function partitionMarketingAudience(candidateIds: string[], rows: AudienceRow[]): MarketingAudience {
  const ids = uniqueIds(candidateIds);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const appUserIds: string[] = [];
  const pushUserIds: string[] = [];
  let ineligibleCount = 0;
  let optedOutCount = 0;
  let reachCount = 0;

  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.role !== 'CUSTOMER' || row.anonymizedAt) {
      ineligibleCount++;
      continue;
    }
    const app = isChannelEnabled(row.notificationPrefs, MARKETING_PREF_GROUP, 'app');
    const push = isChannelEnabled(row.notificationPrefs, MARKETING_PREF_GROUP, 'push');
    if (app) appUserIds.push(id);
    if (push) pushUserIds.push(id);
    if (app || push) reachCount++;
    else optedOutCount++;
  }

  return { candidateCount: ids.length, ineligibleCount, optedOutCount, reachCount, appUserIds, pushUserIds };
}

/**
 * Aday kimliklerinden pazarlama iletisi alabilecek kitleyi çıkarır.
 * Tek sorgu. DB hatası YUTULMAZ (fail-closed): çağıran uç 500/503 döner, ileti gitmez.
 */
export async function resolveMarketingAudience(candidateIds: string[]): Promise<MarketingAudience> {
  const ids = uniqueIds(candidateIds);
  if (ids.length === 0) return partitionMarketingAudience([], []);
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true, anonymizedAt: true, notificationPrefs: true },
  });
  return partitionMarketingAudience(ids, rows as AudienceRow[]);
}

/**
 * Uygulama içi pazarlama bildirim satırları. `data.kind` her zaman yazılır ve çağıranın
 * verdiği `data.kind` ezilemez (tercih grubunun dışına kaçırılamaz).
 */
export function buildMarketingNotificationRows(
  userIds: string[],
  input: {
    title: string;
    message: string;
    type?: string;
    kind?: MarketingKind;
    data?: Record<string, unknown>;
  }
): Prisma.NotificationCreateManyInput[] {
  const kind: MarketingKind = input.kind ?? MARKETING_KINDS.campaign;
  // Savunma: grubu 'campaign' olmayan bir tür asla pazarlama türü olarak kullanılamaz.
  if (kindToGroup(kind) !== MARKETING_PREF_GROUP) {
    throw new Error(`Pazarlama bildirim türü kampanya grubunda değil: ${kind}`);
  }
  const data = { ...(input.data ?? {}), kind } as Prisma.InputJsonObject;
  return uniqueIds(userIds).map((userId) => ({
    userId,
    title: input.title,
    message: input.message,
    type: input.type ?? 'campaign',
    data,
  }));
}

const PUSH_CONCURRENCY = 20;

/**
 * Push'u yalnız verilen (tercihi açık) kullanıcılara gönderir; başarılı teslim sayısını döner.
 * Hata fırlatmaz (push en iyi çaba kanalıdır; uygulama içi kayıt zaten yazılmıştır).
 */
export async function sendMarketingPush(
  userIds: string[],
  input: { title: string; message: string; url?: string; icon?: string }
): Promise<number> {
  const ids = uniqueIds(userIds);
  let delivered = 0;
  for (let i = 0; i < ids.length; i += PUSH_CONCURRENCY) {
    const batch = ids.slice(i, i + PUSH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((userId) => sendPush(userId, { title: input.title, body: input.message, url: input.url, icon: input.icon }))
    );
    for (const r of results) if (r.status === 'fulfilled' && r.value === true) delivered++;
  }
  return delivered;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

/**
 * Telafi teklifi (RemedyOffer) yaşam döngüsünün TEK yazma servisi (P0-22).
 *
 * Neden: QR geri bildirimi ve tüketim yorumu route'ları aynı gövdeyi kopyalıyordu ve
 *  - doğrulama başarısız olunca sessizce "doğrudan müşteriye gönder" varsayılanına düşüyordu
 *    (onay kuyruğu bypass'ı),
 *  - aynı kaynağa sınırsız açık teklif açılabiliyordu,
 *  - müşteri kabulünde seçilen tür/değer teklifin seçeneklerine karşı doğrulanmıyordu.
 *
 * Değişmezler:
 *  1. Bir kaynak (feedbackId | consumptionReviewId | kaynaksız kişisel teklif için dealerId+userId)
 *     için aynı anda en fazla BİR açık teklif (`pending` | `awaiting_dealer_approval`). Uygulama
 *     katmanında advisory kilit + kontrol; veritabanında kısmi unique index (göç
 *     `20261008000200_remedy_open_offer_unique`) son savunma hattıdır → P2002 da 409'a çevrilir.
 *  2. Kaynak için kabul edilmiş (`accepted`) bir teklif varsa ikinci telafi açılmaz (çifte telafi).
 *  3. Seçenekler bayinin şablon allowlist'inin alt kümesidir; müşteri seçimi teklifin kendi
 *     seçeneklerine karşı doğrulanır ve kabulde seçimin anlık görüntüsü yazılır.
 *  4. Durum geçişi + zaman çizelgesi + bildirim tek transaction'da (yarım kayıt yok).
 */
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/economy/errors';
import { appendRemedyTimelineEvent } from '@/lib/remedy-timeline';
import {
  findRemedySelection,
  formatRemedySelection,
  normalizeRemedyOptions,
  type RemedyOption,
  type RemedySelection,
} from '@/lib/remedy-options';

/** Müşteriye açık ya da onay bekleyen — kısmi unique index'in kapsadığı durumlar. */
export const REMEDY_OPEN_STATUSES = ['pending', 'awaiting_dealer_approval'] as const;
/** Yeni telafi açmayı engelleyen durumlar (açık + kabul edilmiş). */
export const REMEDY_BLOCKING_STATUSES = ['pending', 'awaiting_dealer_approval', 'accepted'] as const;

export const REMEDY_MESSAGE_MAX = 500;
export const DEFAULT_REMEDY_MESSAGE = 'Deneyiminiz için özür dileriz. Aşağıdan telafi türü ve miktarınızı seçin.';

export type RemedyErrorCode =
  | 'OPEN_OFFER_EXISTS'
  | 'ALREADY_REMEDIED'
  | 'NO_CUSTOMER'
  | 'NO_OPTIONS'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NOT_PENDING'
  | 'INVALID_SELECTION';

const ERROR_STATUS: Record<RemedyErrorCode, number> = {
  OPEN_OFFER_EXISTS: 409,
  ALREADY_REMEDIED: 409,
  NO_CUSTOMER: 422,
  NO_OPTIONS: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  NOT_PENDING: 409,
  INVALID_SELECTION: 400,
};

export class RemedyOfferError extends Error {
  readonly code: RemedyErrorCode;
  readonly status: number;
  readonly existingOfferId?: string;
  constructor(code: RemedyErrorCode, message: string, existingOfferId?: string) {
    super(message);
    this.name = 'RemedyOfferError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.existingOfferId = existingOfferId;
  }
}

export function isRemedyOfferError(e: unknown): e is RemedyOfferError {
  return e instanceof RemedyOfferError;
}

export type RemedySource =
  | { kind: 'feedback'; feedbackId: string }
  | { kind: 'consumption_review'; consumptionReviewId: string }
  /** Kaynaksız kişisel teklif (ör. churn müdahalesi): dealerId + userId'ye bağlıdır. */
  | { kind: 'personal' };

export interface CreateRemedyOfferInput {
  source: RemedySource;
  dealerId: string;
  /** Teklifin TEK hedefi olan müşteri. Yoksa (anonim kayıt) teklif açılamaz → 422. */
  userId: string | null | undefined;
  message: string;
  /** 'queue' → awaiting_dealer_approval (müşteri görmez); 'send' → pending + müşteri bildirimi. */
  mode: 'queue' | 'send';
  options: RemedyOption[];
  /** Zaman çizelgesindeki "oluşturuldu" etiketi (otomasyon/churn için farklı metin). */
  createdLabel?: string;
  /** Zaman çizelgesi meta'sına eklenecek ek alanlar (ör. trigger). */
  createdMeta?: Record<string, unknown>;
  /** `false` ise kabul edilmiş teklif yeni teklifi engellemez (varsayılan: engeller). */
  blockIfAccepted?: boolean;
}

export interface CreateRemedyOfferResult {
  offerId: string;
  status: 'pending' | 'awaiting_dealer_approval';
  notificationSent: boolean;
}

type Tx = Prisma.TransactionClient;

/** Bayinin telafi oluşturma gövdesi (QR ve tüketim yorumu route'ları ortak). */
export const remedyCreateBodySchema = z
  .object({
    message: z
      .string({ invalid_type_error: 'Mesaj metin olmalı.' })
      .trim()
      .max(REMEDY_MESSAGE_MAX, `Mesaj en fazla ${REMEDY_MESSAGE_MAX} karakter olabilir.`)
      .optional(),
    sendNotification: z.boolean({ invalid_type_error: 'Bildirim tercihi geçersiz.' }).optional(),
    /** Verilirse bayinin şablon allowlist'inin alt kümesi olmalı (aksi 400). */
    options: z.array(z.unknown(), { invalid_type_error: 'Telafi seçenekleri liste olmalı.' }).max(10).optional(),
    /** true: müşteriye bildirim yok, onay kuyruğuna düşer (awaiting_dealer_approval). */
    queueForApproval: z.boolean({ invalid_type_error: 'Onay kuyruğu tercihi geçersiz.' }).optional(),
  })
  .default({});

export type RemedyCreateBody = z.infer<typeof remedyCreateBodySchema>;

/**
 * Gövdeyi doğrular. Başarısızlıkta SESSİZ VARSAYILAN YOK: ilk hatanın Türkçe mesajıyla
 * `{ ok:false }` döner, route 400 verir (onay kuyruğu bypass'ının kök nedeni buydu).
 */
export function parseRemedyCreateBody(
  raw: unknown
): { ok: true; body: RemedyCreateBody } | { ok: false; message: string; details: Array<{ path: string; message: string }> } {
  const parsed = remedyCreateBodySchema.safeParse(raw);
  if (parsed.success) return { ok: true, body: parsed.data };
  const details = parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
  const first = parsed.error.issues[0];
  // Şemadaki özel mesajlar Türkçe; zod'un İngilizce varsayılanları kullanıcıya gösterilmez.
  const isZodDefault = !first || /^(Expected|Required|Invalid|String must|Array must|Number must)/.test(first.message);
  const message = isZodDefault
    ? 'Telafi isteği geçersiz. Lütfen alanları kontrol edip tekrar deneyin.'
    : first.message;
  return { ok: false, message, details };
}

/**
 * İstek gövdesindeki bayraklardan mod: `queueForApproval` açıkça true ya da `sendNotification`
 * açıkça false ise KUYRUK. Yalnız ikisi de "gönder" yönündeyse müşteriye gönderilir.
 * (Eskiden "bildirim yok + kuyruk yok" = hiçbir şey oluşturmadan sahte başarıydı.)
 */
export function resolveRemedyMode(body: { queueForApproval?: boolean; sendNotification?: boolean }): 'queue' | 'send' {
  if (body.queueForApproval === true) return 'queue';
  if (body.sendNotification === false) return 'queue';
  return 'send';
}

function sourceWhere(source: RemedySource, dealerId: string, userId: string): Prisma.RemedyOfferWhereInput {
  if (source.kind === 'feedback') return { feedbackId: source.feedbackId };
  if (source.kind === 'consumption_review') return { consumptionReviewId: source.consumptionReviewId };
  return { dealerId, userId, feedbackId: null, consumptionReviewId: null };
}

function sourceLockKey(source: RemedySource, dealerId: string, userId: string): string {
  if (source.kind === 'feedback') return `remedy:fb:${source.feedbackId}`;
  if (source.kind === 'consumption_review') return `remedy:cr:${source.consumptionReviewId}`;
  return `remedy:personal:${dealerId}:${userId}`;
}

/** Kaynak için engelleyici teklifi bulur (yoksa null). Route'lar ön-kontrol için de kullanır. */
export async function findBlockingRemedyOffer(
  db: Pick<Tx, 'remedyOffer'>,
  source: RemedySource,
  dealerId: string,
  userId: string,
  blockIfAccepted = true
): Promise<{ id: string; status: string } | null> {
  const statuses: readonly string[] = blockIfAccepted ? REMEDY_BLOCKING_STATUSES : REMEDY_OPEN_STATUSES;
  return db.remedyOffer.findFirst({
    where: { ...sourceWhere(source, dealerId, userId), status: { in: [...statuses] } },
    select: { id: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
}

function conflictFor(existing: { id: string; status: string }): RemedyOfferError {
  if (existing.status === 'accepted') {
    return new RemedyOfferError(
      'ALREADY_REMEDIED',
      'Bu yorum için müşteri bir telafiyi zaten kabul etti. İkinci telafi açılamaz.',
      existing.id
    );
  }
  return new RemedyOfferError(
    'OPEN_OFFER_EXISTS',
    existing.status === 'awaiting_dealer_approval'
      ? 'Bu yorum için onay kuyruğunda bekleyen bir telafi taslağı zaten var.'
      : 'Bu yorum için müşteriye gönderilmiş açık bir telafi teklifi zaten var.',
    existing.id
  );
}

/**
 * Telafi teklifi oluşturur. Kurallar dosya başındaki değişmezlerdedir.
 * Hata durumunda `RemedyOfferError` fırlatır (route bunu durum koduna çevirir).
 */
export async function createRemedyOffer(
  input: CreateRemedyOfferInput,
  db: typeof prisma = prisma
): Promise<CreateRemedyOfferResult> {
  const { source, dealerId, mode } = input;
  const userId = input.userId ?? null;
  if (!userId) {
    throw new RemedyOfferError(
      'NO_CUSTOMER',
      'Bu geri bildirim anonim bırakıldığı için telafi teklifi gönderilemez.'
    );
  }
  const options = normalizeRemedyOptions(input.options);
  if (options.length === 0) {
    throw new RemedyOfferError('NO_OPTIONS', 'Geçerli bir telafi seçeneği tanımlı değil. Telafi şablonlarınızı kontrol edin.');
  }
  const message = (input.message || '').trim().slice(0, REMEDY_MESSAGE_MAX) || DEFAULT_REMEDY_MESSAGE;
  const status = mode === 'queue' ? 'awaiting_dealer_approval' : 'pending';
  const blockIfAccepted = input.blockIfAccepted !== false;

  try {
    return await db.$transaction(async (tx) => {
      // Aynı kaynağa eşzamanlı iki istek (çift tık, iki sekme, otomasyon + bayi) serileşir.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sourceLockKey(source, dealerId, userId)}))`;

      const existing = await findBlockingRemedyOffer(tx, source, dealerId, userId, blockIfAccepted);
      if (existing) throw conflictFor(existing);

      const offer = await tx.remedyOffer.create({
        data: {
          feedbackId: source.kind === 'feedback' ? source.feedbackId : null,
          consumptionReviewId: source.kind === 'consumption_review' ? source.consumptionReviewId : null,
          dealerId,
          userId,
          message,
          status,
          options: options as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      await appendRemedyTimelineEvent(tx, offer.id, 'created', input.createdLabel ?? 'Teklif oluşturuldu', {
        preview: message.slice(0, 120),
        ...(input.createdMeta ?? {}),
      });

      if (mode === 'queue') {
        await appendRemedyTimelineEvent(tx, offer.id, 'queued', 'Onay kuyruğunda');
        return { offerId: offer.id, status: 'awaiting_dealer_approval' as const, notificationSent: false };
      }

      await tx.notification.create({
        data: {
          userId,
          title: 'Telafi Fırsatı',
          message: 'Size özel bir telafi hazır. Tür ve miktar seçmek için tıklayın.',
          type: 'info',
          data: {
            type: 'remedy_campaign',
            remedyOfferId: offer.id,
            ...(source.kind === 'feedback' ? { feedbackId: source.feedbackId } : {}),
            ...(source.kind === 'consumption_review' ? { consumptionReviewId: source.consumptionReviewId } : {}),
          },
        },
      });
      await appendRemedyTimelineEvent(tx, offer.id, 'notified', 'Müşteriye bildirim gönderildi');
      return { offerId: offer.id, status: 'pending' as const, notificationSent: true };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Kısmi unique index (son savunma hattı) yarışı yakaladı.
      throw new RemedyOfferError('OPEN_OFFER_EXISTS', 'Bu kaynak için açık bir telafi teklifi zaten var.');
    }
    throw err;
  }
}

export interface AcceptRemedyOfferResult {
  offerId: string;
  status: 'accepted';
  acceptedAt: Date;
  selection: RemedySelection;
}

/**
 * Müşteri kabulü: seçim teklifin KENDİ seçeneklerine (allowlist) karşı doğrulanır; durum
 * `pending → accepted` atomik geçer; seçimin anlık görüntüsü (tür/etiket/birim/değer) zaman
 * çizelgesine yazılır ve bayiye "müşteri seçimini yaptı" bildirimi gider. Hepsi tek tx.
 */
export async function acceptRemedyOffer(
  params: { offerId: string; userId: string; selectedType: unknown; selectedValue: unknown; now?: Date },
  db: typeof prisma = prisma
): Promise<AcceptRemedyOfferResult> {
  const { offerId, userId } = params;
  const offer = await db.remedyOffer.findUnique({
    where: { id: offerId },
    select: { id: true, userId: true, dealerId: true, status: true, options: true },
  });
  if (!offer || offer.status === 'awaiting_dealer_approval' || offer.status === 'rejected') {
    // Onay bekleyen/reddedilmiş teklifin varlığı müşteriye sızdırılmaz.
    throw new RemedyOfferError('NOT_FOUND', 'Telafi teklifi bulunamadı.');
  }
  if (offer.userId !== userId) {
    throw new RemedyOfferError('FORBIDDEN', 'Bu teklifi kabul etme yetkiniz yok.');
  }
  if (offer.status !== 'pending') {
    throw new RemedyOfferError('NOT_PENDING', 'Bu teklif zaten işlendi.');
  }

  const selection = findRemedySelection(offer.options, params.selectedType, params.selectedValue);
  if (!selection) {
    throw new RemedyOfferError('INVALID_SELECTION', 'Seçtiğiniz telafi bu teklifte yok. Lütfen listeden bir seçenek seçin.');
  }

  const acceptedAt = params.now ?? new Date();
  const label = formatRemedySelection(selection);

  await db.$transaction(async (tx) => {
    const n = await tx.remedyOffer.updateMany({
      // `options` da koşulda değil: seçenekler yalnız oluştururken yazılır, sonradan değişmez.
      where: { id: offerId, userId, status: 'pending' },
      data: {
        status: 'accepted',
        selectedType: selection.type,
        selectedValue: String(selection.value),
        acceptedAt,
      },
    });
    if (n.count === 0) throw new RemedyOfferError('NOT_PENDING', 'Bu teklif zaten işlendi.');

    await appendRemedyTimelineEvent(tx, offerId, 'accepted', `Seçiminiz işletmeye iletildi: ${label}`, {
      selection: { ...selection },
    });

    await tx.notification.create({
      data: {
        userId: offer.dealerId,
        title: 'Telafi seçimi yapıldı',
        message: `Müşteri telafi teklifinizi kabul etti: ${label}.`,
        type: 'info',
        data: { type: 'remedy_accepted', remedyOfferId: offerId, selection: { ...selection } },
      },
    });
  });

  return { offerId, status: 'accepted', acceptedAt, selection };
}

/** Müşteriye/bayiye dönen güvenli teklif görünümü için seçenek + seçim çözümü. */
export function describeRemedyOffer(offer: {
  options: unknown;
  selectedType: string | null;
  selectedValue: string | null;
}): { options: RemedyOption[]; selection: RemedySelection | null; selectionLabel: string | null } {
  const options = normalizeRemedyOptions(offer.options);
  const selection =
    offer.selectedType && offer.selectedValue != null
      ? findRemedySelection(offer.options, offer.selectedType, offer.selectedValue)
      : null;
  return { options, selection, selectionLabel: selection ? formatRemedySelection(selection) : null };
}

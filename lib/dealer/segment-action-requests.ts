/**
 * Segment Aksiyon Merkezi — istemci ↔ mevcut aksiyon uçları SÖZLEŞMESİ (saf, Jest ile test edilir).
 *
 * Kök neden (P0-39 bayi): sayfa her aksiyon ucuna aynı `{ segment, source }` gövdesini
 * gönderiyordu. `/api/dealer/win-back` `userIds[] + offerType`, segment-proposals ise
 * `segmentKey` bekliyor → 5 butonun 4'ü HER ZAMAN 400 alıyordu; mantık testi yalnız adresi
 * doğruladığı için fark edilmedi. Burada her aksiyon tipinin (`SegmentAction.kind`)
 * gövdesi uçların gerçek zod/elle doğrulama kurallarıyla birebir kurulur ve yanıtlar
 * gerçek sayılara indirgenir ("0 kişiye gitse bile 'hazırlandı ✓'" sahte başarısı biter).
 */
import type { SegmentAction, SegmentProposalKey } from '@/lib/segment-action-center';
import { DEFAULT_WIN_BACK_OFFER_ID, isWinBackOfferId, type WinBackOfferId } from '@/lib/dealer/win-back-offers';

export const RISK_SEGMENT_ENDPOINT = '/api/dealer/campaigns/risk-segment';
export const WIN_BACK_ENDPOINT = '/api/dealer/win-back';
export const SEGMENT_PROPOSALS_ENDPOINT = '/api/dealer/innovation/segment-proposals';

/** `/api/dealer/win-back` POST tek istekte en fazla bu kadar kullanıcı işler (route: WIN_BACK_POST_MAX). */
export const WIN_BACK_POST_CHUNK = 100;
/** risk-segment POST varsayılanı (route: bodySchema.maxNotifications default). */
export const RISK_OFFER_MAX_NOTIFICATIONS = 50;

export type ActionRequest = { url: string; body: Record<string, unknown> };

const VALID_PROPOSAL_KEYS: readonly SegmentProposalKey[] = ['sleeping', 'loyal', 'first_visit'];

/** risk-segment: gövde zod şemasına uygun (tüm alanlar isteğe bağlı; sınır açıkça verilir). */
export function buildRiskOfferRequest(): ActionRequest {
  return { url: RISK_SEGMENT_ENDPOINT, body: { maxNotifications: RISK_OFFER_MAX_NOTIFICATIONS } };
}

/**
 * win-back: kullanıcı kimliklerini tekilleştirip ≤100'lük parçalara böler; her parça
 * `{ userIds, offerType }` taşır. Geçersiz teklif kimliği varsayılana düşer.
 */
export function buildWinBackRequests(customerIds: string[], offerType: string): ActionRequest[] {
  const offer: WinBackOfferId = isWinBackOfferId(offerType) ? offerType : DEFAULT_WIN_BACK_OFFER_ID;
  const ids = [...new Set(customerIds.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 64))];
  const requests: ActionRequest[] = [];
  for (let i = 0; i < ids.length; i += WIN_BACK_POST_CHUNK) {
    requests.push({ url: WIN_BACK_ENDPOINT, body: { userIds: ids.slice(i, i + WIN_BACK_POST_CHUNK), offerType: offer } });
  }
  return requests;
}

/** segment-proposals: zorunlu `segmentKey` + şablon. */
export function buildProposalRequest(segmentKey: SegmentProposalKey): ActionRequest {
  if (!VALID_PROPOSAL_KEYS.includes(segmentKey)) {
    throw new Error(`Geçersiz segment şablonu: ${segmentKey}`);
  }
  return { url: SEGMENT_PROPOSALS_ENDPOINT, body: { segmentKey, useTemplate: true } };
}

/** win-back yanıtındaki gönderim sayısı: `sent` alanı varsa o, yoksa mesajdaki ilk sayı. */
export function readWinBackSentCount(data: unknown, fallback: number): number {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.sent === 'number' && Number.isFinite(d.sent)) return d.sent;
    if (typeof d.message === 'string') {
      const m = d.message.match(/(\d+)/);
      if (m) return Number(m[1]);
    }
  }
  return fallback;
}

/** win-back GET listesinden müşteri kimliklerini çıkarır (`{ data: [{ id }] }`). */
export function readWinBackCandidateIds(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { data?: unknown }).data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => (r && typeof r === 'object' ? (r as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** risk-segment yanıtı → gerçek sonuç. */
export function readRiskOfferResult(data: unknown): { sent: number; eligible: number } {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const sent = typeof d.sent === 'number' ? d.sent : 0;
  const eligible = typeof d.eligibleCount === 'number' ? d.eligibleCount : sent;
  return { sent, eligible };
}

/** Sonuç metni — gerçek sayıyla; 0 kişiye gidince başarı gibi görünmez. */
export function describeSendResult(sent: number): { tone: 'success' | 'info'; message: string } {
  if (sent <= 0) {
    return { tone: 'info', message: 'Uygun müşteri bulunamadı; bildirim gönderilmedi.' };
  }
  return { tone: 'success', message: `${sent.toLocaleString('tr-TR')} müşteriye bildirim gönderildi.` };
}

/** Bir aksiyonun eski (kind'sız) sunucu yanıtıyla da çalışması için tip çıkarımı. */
export function resolveActionKind(action: Pick<SegmentAction, 'endpoint'> & Partial<Pick<SegmentAction, 'kind'>>): SegmentAction['kind'] | null {
  if (action.kind) return action.kind;
  if (action.endpoint === RISK_SEGMENT_ENDPOINT) return 'risk_offer';
  if (action.endpoint === WIN_BACK_ENDPOINT) return 'win_back';
  if (action.endpoint === SEGMENT_PROPOSALS_ENDPOINT) return 'segment_proposal';
  return null;
}

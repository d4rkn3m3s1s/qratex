/**
 * Teklifler (/dealer/offers) — `GET /api/dealer/offers` BFF sözleşmesi.
 *
 * Sunucu ve istemci ikisi de içe aktarır (Prisma bağımlılığı yok). Tarihler ISO metin.
 * Her bölüm kendi durumunu taşır: `ready` (veri), `disabled` (platform/modül kapalı — kart
 * kilit durumunu anlatır), `error` (yalnız o bölüm düştü; diğerleri çalışır). "Hata = boş
 * liste" yapısal olarak imkânsızdır: `error` bölümünde `data` yoktur.
 */
import type { FlashStatus } from './rules';

export const DEALER_OFFERS_QUERY_KEY = ['dealer', 'offers', 'overview'] as const;

export type SectionState<T> =
  | { status: 'ready'; data: T }
  | { status: 'disabled'; reason: 'platform' | 'module' }
  | { status: 'error'; message: string };

export interface FlashOfferDto {
  id: string;
  title: string;
  body: string;
  offerType: string;
  value: number | null;
  validFrom: string;
  validTo: string;
  status: FlashStatus;
  createdAt: string;
}

export interface FlashSection {
  /** Bayinin koordinatı var mı (yoksa yalnız kaydedenler + mekân sayfası görür). */
  hasLocation: boolean;
  /** İşletme adı tanımlı mı (müşteri listeleri adsız mekânı göstermez). */
  hasBusinessName: boolean;
  /** Mekânı kaydetmiş müşteri sayısı — teklif onların Fırsatlar sekmesinde görünür. */
  savedByCount: number;
  openCount: number;
  maxOpen: number;
  items: FlashOfferDto[];
  /** Listede gösterilenden eski kayıt var mı (yalnız son 30 teklif döner). */
  hasMore: boolean;
}

export interface HappyHourDto {
  id: string;
  name: string;
  multiplier: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isActive: boolean;
  /** Şu an (İstanbul saatiyle) puanlara uygulanıyor mu. */
  liveNow: boolean;
  validFrom: string | null;
  validUntil: string | null;
}

export interface HappyHourSection {
  activeCount: number;
  maxActive: number;
  items: HappyHourDto[];
}

export type PersonalOfferStatus = 'awaiting_dealer_approval' | 'pending' | 'accepted' | 'expired' | 'rejected' | 'other';

export interface PersonalOfferDto {
  id: string;
  customerName: string;
  status: PersonalOfferStatus;
  message: string;
  /** Kabul edildiyse seçim etiketi ("%20 İndirim"). */
  selectionLabel: string | null;
  /** Kim/ne oluşturdu: churn otomasyonu ya da bayi. */
  origin: 'churn' | 'dealer' | 'unknown';
  createdAt: string;
  acceptedAt: string | null;
}

export interface PersonalSection {
  awaitingApproval: number;
  openWithCustomer: number;
  acceptedLast30: number;
  items: PersonalOfferDto[];
  /** İşletme geneli telafi seçenekleri (kişiye özel teklifte sunulabilecek türler). */
  availableTypes: Array<{ type: string; label: string; summary: string }>;
}

export interface RemedyTemplateGroup {
  /** null = işletme geneli. */
  locationId: string | null;
  locationName: string | null;
  options: Array<{ type: string; label: string; unit: string; values: number[]; summary: string }>;
  inactiveCount: number;
}

export interface RemedyTemplatesSection {
  /** İşletme geneli şablon yoksa sistem varsayılanı kullanılıyor. */
  usingSystemDefault: boolean;
  groups: RemedyTemplateGroup[];
  editHref: string;
}

export interface DealerOffersOverview {
  generatedAt: string;
  flash: SectionState<FlashSection>;
  happyHours: SectionState<HappyHourSection>;
  personal: SectionState<PersonalSection>;
  remedyTemplates: SectionState<RemedyTemplatesSection>;
}

export interface PersonalCandidateDto {
  ref: string;
  name: string;
  visitCount: number;
  lastVisitAt: string | null;
  /** Kampanya bildirimlerini kapattıysa kişiye özel teklif gönderilemez. */
  reachable: boolean;
  /** Müşteride açık (yanıtlanmamış) bir kişisel teklif var mı. */
  hasOpenOffer: boolean;
}

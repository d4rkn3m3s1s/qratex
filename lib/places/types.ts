/**
 * Keşfet (/customer/places) BFF sözleşmesi — sunucu ve istemci AYNI tipleri kullanır
 * (eski kampanyalar sayfasının "API'nin döndürmediği alanı okuma" sınıfı hatası tip düzeyinde kapanır).
 * Tarihler ISO metin olarak taşınır.
 */
import type { OpenState } from './business-hours';
import type { PlaceCategory } from './categories';

export type PlacesTab = 'nearby' | 'saved' | 'deals' | 'top';
export const PLACES_TABS: readonly PlacesTab[] = ['nearby', 'saved', 'deals', 'top'];

export interface LiveBoostDto {
  happyHourId: string;
  name: string;
  /** Puana gerçekten uygulanan çarpan ([1,3] kırpılmış). */
  multiplier: number;
  /** Pencere sonu (ISO). */
  endsAt: string | null;
  scope: 'dealer' | 'global';
}

export interface VenueSummaryDto {
  dealerId: string;
  name: string;
  image: string | null;
  address: string | null;
  phone: string | null;
  categories: PlaceCategory[];
  latitude: number | null;
  longitude: number | null;
  /** Konum verildiyse km. */
  distanceKm: number | null;
  openState: OpenState | null;
  /** Güvenilir son 90 gün puanı; eşik altında `null` ("Yeni"). */
  rating: { avg: number; n: number } | null;
  /** Bu mekânda şu an canlı en yüksek mutlu saat (mekâna özel). */
  liveBoost: LiveBoostDto | null;
  /** Şu an aktif kısa süreli teklif sayısı. */
  flashCount: number;
  isSaved: boolean;
  /** Kullanıcının bu mekândaki ziyaretleri (kartla harcama + QR geri bildirim). */
  myVisits: number;
  myLastVisitAt: string | null;
}

export interface NearbyResponse {
  mode: 'nearby' | 'browse';
  items: VenueSummaryDto[];
  total: number;
  nextOffset: number | null;
  /** Bu sonuç kümesinde var olan kategoriler (çip listesi). */
  categories: PlaceCategory[];
  /** Tüm mekânlarda canlı platform geneli mutlu saat (mekâna atfedilmez). */
  globalBoost: LiveBoostDto | null;
  radiusKm: number | null;
}

export interface SavedVenueDto extends VenueSummaryDto {
  savedAt: string;
}

export interface SavedResponse {
  items: SavedVenueDto[];
  /** Kullanıcı başına üst sınır. */
  limit: number;
  /** Son ziyaret edilip kaydedilmemiş mekânlar (boş durumda tek dokunuşla kaydet). */
  suggestions: Array<Pick<VenueSummaryDto, 'dealerId' | 'name' | 'image' | 'address'> & { lastVisitAt: string }>;
}

export interface HappyHourDto {
  id: string;
  name: string;
  description: string | null;
  multiplier: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  dealer: { id: string; businessName: string | null; image: string | null } | null;
  dealerId: string | null;
  distanceKm: number | null;
}

export type ChallengeKind = 'games_played' | 'reviews_written';

export interface SeasonalEventDto {
  id: string;
  name: string;
  description: string | null;
  type: string;
  imageUrl: string | null;
  multiplier: number;
  bonusPoints: number;
  /** Çarpan/bonusun uygulandığı kazanımlar (sunucudaki çağrı yerleriyle aynı kaynak). */
  appliesTo: Array<'feedback' | 'consumption'>;
  startDate: string;
  endDate: string;
  /** Ödül talebinin son anı (bitiş + ek süre). */
  claimDeadline: string;
  phase: 'active' | 'ended';
  challenge: {
    type: ChallengeKind;
    goal: number;
    current: number;
    complete: boolean;
    rewardPoints: number;
    rewardBadge: { id: string; name: string; icon: string | null } | null;
    claimed: boolean;
  } | null;
}

export interface UpcomingEventDto {
  id: string;
  name: string;
  description: string | null;
  multiplier: number;
  bonusPoints: number;
  startDate: string;
  endDate: string;
}

export interface FlashOfferDto {
  id: string;
  title: string;
  body: string;
  offerType: string;
  value: number | null;
  validTo: string;
  dealerId: string;
  venueName: string;
  distanceKm: number | null;
}

export interface PersonalOfferDto {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  dealerId: string | null;
  venueName: string | null;
  proposalId: string | null;
  isRead: boolean;
}

export interface DealsResponse {
  /** `SS:dd` değerlerinin yorumlandığı saat dilimi. */
  timeZone: string;
  happyHours: HappyHourDto[];
  events: SeasonalEventDto[];
  upcomingEvents: UpcomingEventDto[];
  flash: FlashOfferDto[];
  personal: PersonalOfferDto[];
  savedDealerIds: string[];
  /** Konum verildi mi (yakınlık filtresi anlamlı mı). */
  located: boolean;
}

export interface TopEntryDto {
  rank: number;
  dealerId: string;
  name: string;
  image: string | null;
  address: string | null;
  categories: PlaceCategory[];
  score: number;
  avgRating: number;
  reviewers: number;
  isSaved: boolean;
  visitedByMe: boolean;
  isBusinessOfMonth: boolean;
}

export interface TopResponse {
  window: 30 | 90;
  category: PlaceCategory | null;
  categories: Array<{ slug: PlaceCategory; rankedCount: number }>;
  entries: TopEntryDto[];
  meta: { minReviewers: number; priorWeight: number; prior: number; generatedAt: string };
}

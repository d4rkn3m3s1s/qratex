/**
 * Rozet izlenebilirlik sınıfı — admin panelinin bir rozetin gerçek "sağlığını" göstermesi
 * için. surprise-badges.ts counterFor eşlemesinin TEK DOĞRULUK KAYNAĞI karşılığı:
 * bir requirement tipinin gerçek sayaca mı (TAM), toplam yoruma proxy mi (YAKLAŞIK),
 * yoksa hiç izlenemez mi (custom → otomatik ASLA açılmaz) olduğunu belirler.
 *
 * ÖNEMLİ: Bu liste counterFor ile SENKRON kalmalı. Yeni bir requirement tipi
 * surprise-badges'e eklenirse buraya da eklenmeli (drift = yanlış admin etiketi).
 */

export type Trackability = 'exact' | 'approximate' | 'untrackable' | 'character';

/** TAM eşleme — gerçek sayaç, ilerleme kesin ölçülür. */
export const EXACT_TYPES = new Set<string>([
  'feedback_count', 'points', 'total_points', 'streak', 'longest_streak', 'level',
  'referral', 'quests', 'five_star_count', 'low_rating_feedback', 'critical_feedback',
  'positive_feedback', 'photo_feedback', 'night_feedback', 'surprise_reward',
  'profile_complete', 'account_age_days', 'chat_messages', 'active_days',
  'unique_businesses', 'first_visit_feedback', 'revisit_business', 'leaderboard_top',
  'emoji_feedback',
]);

/** YAKLAŞIK — feedback_count'a proxy (ayrı metrik verisi yok). */
export const APPROXIMATE_TYPES = new Set<string>([
  'detailed_feedback_count', 'long_feedback_count', 'helpful_feedback', 'quick_feedback',
  'rapid_feedback', 'ultra_fast_feedback', 'efficient_feedback', 'last_minute_feedback',
  'inspiring_feedback', 'creative_suggestion', 'community_impact', 'unique_perspective',
  'hidden_detail', 'dramatic_feedback', 'funny_feedback', 'honest_feedback',
  'cafe_feedback', 'food_category_count', 'liked_feedback', 'anonymous_feedback',
  'milestone_reached',
]);

/** Admin'in dropdown'da seçebileceği geçerli requirement tipleri (kullanıcıya etiketli). */
export interface RequirementTypeOption {
  value: string;
  label: string;
  trackability: Trackability;
  hint: string;
}

export const REQUIREMENT_TYPE_OPTIONS: RequirementTypeOption[] = [
  // TAM (gerçek sayaç)
  { value: 'feedback_count', label: 'Toplam yorum sayısı', trackability: 'exact', hint: 'Kullanıcının yazdığı toplam yorum.' },
  { value: 'points', label: 'Toplam puan', trackability: 'exact', hint: 'Kullanıcının puanı.' },
  { value: 'five_star_count', label: '5 yıldızlı yorum', trackability: 'exact', hint: 'rating=5 olan yorum sayısı.' },
  { value: 'low_rating_feedback', label: 'Düşük puanlı yorum', trackability: 'exact', hint: '≤2 yıldız yorum sayısı.' },
  { value: 'positive_feedback', label: 'Olumlu yorum', trackability: 'exact', hint: 'Sentiment=pozitif yorum.' },
  { value: 'photo_feedback', label: 'Fotoğraflı yorum', trackability: 'exact', hint: 'Medya içeren yorum.' },
  { value: 'night_feedback', label: 'Gece yorumu (00-06)', trackability: 'exact', hint: 'TR saatiyle gece yazılan yorum.' },
  { value: 'emoji_feedback', label: 'Emojili yorum', trackability: 'exact', hint: 'Emoji içeren yorum.' },
  { value: 'surprise_reward', label: 'Açılan sürpriz kutu', trackability: 'exact', hint: 'Açılmış sürpriz kutu sayısı.' },
  { value: 'profile_complete', label: 'Profil tamamlama', trackability: 'exact', hint: 'Ad+foto+telefon+biyografi dolu (1 kez).' },
  { value: 'account_age_days', label: 'Hesap yaşı (gün)', trackability: 'exact', hint: 'Kayıttan bu yana geçen gün.' },
  { value: 'chat_messages', label: 'Sohbet mesajı', trackability: 'exact', hint: 'AI sohbet mesaj sayısı.' },
  { value: 'active_days', label: 'Aktif gün', trackability: 'exact', hint: 'Toplam aktif gün.' },
  { value: 'unique_businesses', label: 'Farklı işletme', trackability: 'exact', hint: 'Ziyaret edilen farklı işletme sayısı.' },
  { value: 'revisit_business', label: 'Tekrar ziyaret', trackability: 'exact', hint: 'Birden çok kez gidilen işletme.' },
  { value: 'leaderboard_top', label: 'Onur listesi', trackability: 'exact', hint: 'Hall of Fame üyesi (1 kez).' },
  { value: 'streak', label: 'Giriş serisi', trackability: 'exact', hint: 'Mevcut ardışık giriş günü.' },
  { value: 'longest_streak', label: 'En uzun seri', trackability: 'exact', hint: 'Ulaşılan en uzun seri.' },
  { value: 'level', label: 'Seviye', trackability: 'exact', hint: 'Kullanıcı seviyesi.' },
  { value: 'referral', label: 'Davet (tamamlanan)', trackability: 'exact', hint: 'Tamamlanan davet sayısı.' },
  { value: 'quests', label: 'Tamamlanan görev', trackability: 'exact', hint: 'Bitirilen görev sayısı.' },
  // YAKLAŞIK (feedback_count proxy)
  { value: 'detailed_feedback_count', label: 'Detaylı yorum (~yaklaşık)', trackability: 'approximate', hint: 'Toplam yoruma göre yaklaşık — ayrı "detay" ölçümü yok.' },
  { value: 'funny_feedback', label: 'Komik yorum (~yaklaşık)', trackability: 'approximate', hint: 'Toplam yoruma göre yaklaşık.' },
  { value: 'dramatic_feedback', label: 'Dramatik yorum (~yaklaşık)', trackability: 'approximate', hint: 'Toplam yoruma göre yaklaşık.' },
  { value: 'milestone_reached', label: 'İlk kilometre taşı', trackability: 'approximate', hint: 'İlk yorum atılınca (0/1).' },
];

/** Bir requirement tipinin izlenebilirlik sınıfını döndürür (karakter rozetleri hariç). */
export function trackabilityOf(type: string | null | undefined): Trackability {
  if (!type) return 'untrackable';
  if (EXACT_TYPES.has(type)) return 'exact';
  if (APPROXIMATE_TYPES.has(type)) return 'approximate';
  return 'untrackable'; // counterFor'da -1 döner → otomatik açılamaz (ölü rozet)
}

/** UI için Türkçe etiket + renk sınıfı. */
export function trackabilityLabel(t: Trackability): { label: string; tone: 'green' | 'amber' | 'red' | 'violet' } {
  switch (t) {
    case 'exact': return { label: 'Tam izlenebilir', tone: 'green' };
    case 'approximate': return { label: 'Yaklaşık', tone: 'amber' };
    case 'character': return { label: 'Karakter (dizi)', tone: 'violet' };
    default: return { label: 'İzlenemez — ölü rozet', tone: 'red' };
  }
}

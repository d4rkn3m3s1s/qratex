/**
 * Merkezi cache tag sabitleri. unstable_cache ile sarılan hot read path'leri
 * bu tag'lerle işaretlenir; ilgili veri değiştiğinde revalidateTag(tag) ile
 * seçici olarak bayatlatılır (tüm cache'i değil, yalnızca etkileneni).
 */
export const ADMIN_DASHBOARD_TAG = 'admin-dashboard';
export const LEADERBOARD_TAG = 'leaderboard';

/**
 * Leaderboard sıralama verisi puan/feedback/rozet/davet değiştikçe bayatlar.
 * feedback create, puan kredisi, rozet/davet mutasyonlarında revalidateTag ile
 * çağrılır. Kullanıcıya-özel alanlar (isCurrentUser, kendi sıran) cache DIŞINDA
 * uygulanır; bu yalnızca herkes için ortak olan sıralı listeyi kapsar.
 */
export const LEADERBOARD_RANKING_TAG = 'leaderboard-ranking';

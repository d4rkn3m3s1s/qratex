/**
 * Merkezi cache tag sabitleri. unstable_cache ile sarılan hot read path'leri
 * bu tag'lerle işaretlenir; ilgili veri değiştiğinde revalidateTag(tag) ile
 * seçici olarak bayatlatılır (tüm cache'i değil, yalnızca etkileneni).
 */
export const ADMIN_DASHBOARD_TAG = 'admin-dashboard';
export const LEADERBOARD_TAG = 'leaderboard';

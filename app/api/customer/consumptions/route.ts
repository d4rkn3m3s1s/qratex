/**
 * GET /api/customer/consumptions — EMEKLİ uç; Cüzdan → Hareketler → Ziyaretler ucunun takma adı.
 * Asıl uç: /api/customer/wallet/activity/visits (imleçli, filtreden bağımsız özet, sunucu araması).
 * `?hasReview=false|true` eski derin bağlantı parametresi orada da desteklenir.
 * Alt rotalar (`[id]`, `[id]/review`) Seslerim yüzeyinindir ve değişmedi.
 */
export { GET } from '../wallet/activity/visits/route';

export const dynamic = 'force-dynamic';

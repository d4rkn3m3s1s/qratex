/**
 * GET /api/customer/spending-overview — EMEKLİ uç; Cüzdan → Hareketler → Özet ucunun takma adı.
 * Asıl uç: /api/customer/wallet/activity/summary?range=month|quarter|year|all
 * (Europe/Istanbul kovaları, modül kapısı `spending_overview`, önbelleksiz taze veri).
 */
export { GET } from '../wallet/activity/summary/route';

export const dynamic = 'force-dynamic';

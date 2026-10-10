/**
 * /api/customer/donations — EMEKLİ uç; Cüzdan → Bağış ucunun takma adı (admin modül özeti bu
 * yolu listelediği için korunur). Asıl uç: /api/customer/wallet/donate
 * (GET katalog + kişisel etki + gerçek sıra; POST lib/economy debitPoints ile bağış + makbuz).
 */
export { GET, POST } from '../wallet/donate/route';

export const dynamic = 'force-dynamic';

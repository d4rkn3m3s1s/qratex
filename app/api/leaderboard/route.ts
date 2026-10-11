/**
 * EMEKLİ UÇ (oyunlaştırma-ekonomi O1): `GET /api/leaderboard`.
 *
 * Müşteri liderliği `lib/league-board` (Oyna → Lig, `/customer/leaderboard`; sunucu bileşeni +
 * `/api/customer/league`) üzerinden çalışıyor; bu eski ucun hiçbir ekran çağıranı kalmamıştı.
 * Buna karşın canlıydı ve rapordaki kural tutarsızlığını taşımaya devam ediyordu:
 *  - Varsayılan `period=weekly` ve `monthly` "puanı" SENTETİKTİ: `CASE WHEN length(text) > 50
 *    THEN 100 ELSE 50` — puan matrisini, tavanları, oyunları, tüketim yorumlarını yok sayıyor,
 *    eşik matrisle (`>= longTextThreshold`) çelişiyordu; tavan puanı durdurduğu hâlde spam yorum
 *    sıralamayı yükseltiyordu.
 *  - Haftalık hesap için 5.000 kullanıcıya kadar sayım + bellek içi sıralama yapıyordu.
 *  - Günlük önbellek ısıtma işi bu ucu oturumsuz çağırıyordu (401 — boşa iş).
 * Tek doğru sıralama: lib/league-board (defterden dönem kazancı, güven/fraud filtresi, gizlilik
 * tercihi, kararlı eşitlik kuralı). Tüm metotlar 410 döner.
 */
import { ApiError, defineRoute } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'leaderboard.retired', roles: ['CUSTOMER', 'ADMIN'], rateLimit: 'read' }, () => {
  throw new ApiError('GONE', 'Bu uç kaldırıldı. Liderlik tablosu Oyna → Lig ekranında.', { status: 410 });
});

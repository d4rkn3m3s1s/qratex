/**
 * EMEKLİ UÇ (mimari-api B11 — sahipsiz uç): `/api/admin/preagg`.
 *
 * `DailyDealerStats` tablosunu dolduruyordu ama tabloyu OKUYAN hiçbir kod yok (panolar canlı
 * sorgu kullanıyor), hiçbir zamanlayıcı (vercel.json / cron-job.org / Inngest) ve hiçbir ekran
 * bu ucu çağırmıyordu. Buna karşın:
 *  - GET ile durum değiştiriyordu (yöneticiye tıklatılan bir bağlantı 8000 bayi × 365 gün sıralı
 *    upsert = milyonlarca sorgu tetikleyebiliyordu),
 *  - sırrı `?cron_secret=` sorgu parametresinden ve sabit-zamansız `===` ile kabul ediyordu,
 *  - hata gövdesinde iç hata metnini (`detail: String(error)`) sızdırıyordu,
 *  - `scanCount = feedbackCount` ile yanlış metrik yazıyordu.
 * Tüm metotlar 410 döner; ön-agregasyon gerçekten gerekirse iş kayıt defterine (cron-runner)
 * okuyucusuyla birlikte eklenmelidir.
 */
import { ApiError, defineRoute } from '@/lib/http/define-route';

const gone = () => {
  throw new ApiError('GONE', 'Bu uç kaldırıldı. Bayi panoları güncel veriyi doğrudan hesaplıyor.', { status: 410 });
};

export const GET = defineRoute({ name: 'admin.preagg.retired.get', roles: ['ADMIN'] }, gone);
export const POST = defineRoute({ name: 'admin.preagg.retired.post', roles: ['ADMIN'] }, gone);

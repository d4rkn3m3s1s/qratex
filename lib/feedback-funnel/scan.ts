/**
 * QR tarama olayı — yan etkisiz okumadan AYRI, tekilleştirilmiş (rapor Bulgu 8, envanter #45-46).
 *
 * Eskiden `GET /api/qr-codes/public/[code]` her çağrıda `qr_scanned` yazıyordu: sayfa yenilemesi,
 * uygulama içi tarama doğrulaması ve botlar taramayı şişiriyordu; UTM hiç iletilmiyordu.
 * `QRCode.scanCount` ise aslında GÖNDERİM sayıyordu (admin "toplam tarama" diye okuyor).
 *
 * Şimdi: sayfa açılınca istemci bir kez beacon atar; sunucu aynı tarayıcıdan aynı QR için
 * 30 dk içinde ikinci olayı yazmaz (httpOnly çerez). Olay + `scanCount` artışı burada.
 */
import { prisma } from '@/lib/prisma';
import type { AttributionInput } from './schema';

export const SCAN_DEDUPE_SECONDS = 30 * 60;

/** Çerez adı QR kimliğine bağlı (kod değil — kod büyük/küçük harfle iki biçimde gelebilir). */
export function scanCookieName(qrCodeId: string): string {
  return `qxs_${qrCodeId.replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}`;
}

export async function recordScan(qr: { id: string; code: string; dealerId: string }, attribution: AttributionInput): Promise<void> {
  await prisma.$transaction([
    prisma.analyticsEvent.create({
      data: {
        event: 'qr_scanned',
        category: 'qr',
        data: {
          qrCodeId: qr.id,
          code: qr.code,
          dealerId: qr.dealerId,
          source: attribution.source ?? 'qr',
          segment: attribution.segment ?? null,
          ...(attribution.utmSource ? { utmSource: attribution.utmSource } : {}),
          ...(attribution.utmCampaign ? { utmCampaign: attribution.utmCampaign } : {}),
          ...(attribution.utmMedium ? { utmMedium: attribution.utmMedium } : {}),
        },
      },
    }),
    prisma.qRCode.update({ where: { id: qr.id }, data: { scanCount: { increment: 1 } } }),
  ]);
}

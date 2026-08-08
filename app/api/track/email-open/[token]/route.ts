import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Şeffaf 1x1 GIF (base64) — mail açılınca yüklenir; açılmayı kaydeder.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * GET /api/track/email-open/[token]  — MAIL AÇILMA TAKİBİ (tracking pixel).
 * Mail istemcisi görseli yüklerken çağrılır (AUTH YOK — public). Token'a karşılık gelen
 * gönderim kaydında firstOpenedAt/lastOpenedAt/openCount günceller, sonra 1x1 GIF döner.
 * NOT: bazı istemciler görselleri engeller → açıldığı halde kaydedilmeyebilir (sektör geneli).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Kaydı güncelle (hata olsa da pixel dönmeli — mail görünümü bozulmasın).
  try {
    if (token && /^[A-Za-z0-9_-]{6,64}$/.test(token)) {
      const now = new Date();
      // İlk açılışta firstOpenedAt'ı sadece null ise set et (koşullu), her açılışta count+last.
      await prisma.internEmailSend.updateMany({
        where: { token, firstOpenedAt: null },
        data: { firstOpenedAt: now },
      });
      await prisma.internEmailSend.updateMany({
        where: { token },
        data: { lastOpenedAt: now, openCount: { increment: 1 } },
      });
    }
  } catch {
    /* takip hatası pixel dönüşünü engellemesin */
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
    },
  });
}

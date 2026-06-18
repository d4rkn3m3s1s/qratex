import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/onboarding — bayinin kurulum ilerlemesini GERÇEK verilerden
 * türetir (adım durumları kalıcı bir flag değil; mevcut kayıtlardan hesaplanır →
 * her zaman doğru, manuel senkron gerekmez).
 *
 * Adımlar: profil (işletme adı+açıklama) · konum (adres veya lat/lng) · ilk QR ·
 * ilk ürün · ilk geri bildirim · plan seçimi.
 */
export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const [user, qrCount, productCount, feedbackCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: dealerId },
      select: {
        businessName: true,
        businessDesc: true,
        address: true,
        latitude: true,
        longitude: true,
        pricingPlanId: true,
        subscriptionStatus: true,
      },
    }),
    prisma.qRCode.count({ where: { dealerId } }),
    prisma.product.count({ where: { dealerId } }),
    prisma.feedback.count({ where: { qrCode: { dealerId } } }),
  ]);

  const hasProfile = Boolean(user?.businessName?.trim());
  const hasLocation = Boolean(user?.address?.trim()) || (user?.latitude != null && user?.longitude != null);
  const hasQR = qrCount > 0;
  const hasProduct = productCount > 0;
  const hasFeedback = feedbackCount > 0;
  const hasPlan = Boolean(user?.pricingPlanId);

  const steps = [
    { key: 'profile', done: hasProfile, href: '/dealer/settings', required: true },
    { key: 'location', done: hasLocation, href: '/dealer/settings', required: false },
    { key: 'qr', done: hasQR, href: '/dealer/qr-codes', required: true },
    { key: 'product', done: hasProduct, href: '/dealer/products', required: false },
    { key: 'feedback', done: hasFeedback, href: '/dealer/qr-codes', required: false },
    { key: 'plan', done: hasPlan, href: '/dealer/billing', required: false },
  ];

  const requiredDone = steps.filter((s) => s.required).every((s) => s.done);
  const completedCount = steps.filter((s) => s.done).length;

  return NextResponse.json(
    {
      steps,
      completedCount,
      total: steps.length,
      // "Tamamlandı" = tüm zorunlu adımlar bitti (kullanıcı sihirbazı kapatabilir).
      complete: requiredDone,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

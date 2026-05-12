import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerId: z.string().min(1),
  templateKey: z.enum(['tone', 'speed', 'quality', 'value', 'other']),
  message: z.string().min(5).max(2000),
  expectedHours: z.number().int().min(12).max(168).optional(),
});

const TEMPLATES: Record<string, string> = {
  tone: 'Genel üslup / iletişim',
  speed: 'Hız ve bekleme süresi',
  quality: 'Ürün / lezzet kalitesi',
  value: 'Fiyat-değer dengesi',
  other: 'Diğer iyileştirme',
};

/** Şikâyet değil — iyileştirme isteği (SLA mesajı ile). */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Geçersiz' }, { status: 400 });
  }

  const dealer = await prisma.user.findFirst({
    where: { id: parsed.data.dealerId, role: 'DEALER' },
    select: { id: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: 'İşletme bulunamadı' }, { status: 404 });
  }

  const hours = parsed.data.expectedHours ?? 48;

  const req = await prisma.improvementRequest.create({
    data: {
      userId: auth.session.user.id,
      dealerId: parsed.data.dealerId,
      templateKey: parsed.data.templateKey,
      message: `(${TEMPLATES[parsed.data.templateKey]}) ${parsed.data.message}`,
      expectedHours: hours,
    },
  });

  await prisma.notification.create({
    data: {
      userId: parsed.data.dealerId,
      title: 'İyileştirme isteği',
      message: `Müşteri şikâyet değil, iyileştirme talebi bıraktı (≈${hours} saat içinde dönüş önerilir).`,
      type: 'info',
      data: {
        type: 'improvement_request',
        improvementRequestId: req.id,
      } as object,
    },
  });

  return NextResponse.json({
    success: true,
    id: req.id,
    expectedResponseBy: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
    templateLabel: TEMPLATES[parsed.data.templateKey],
  });
}

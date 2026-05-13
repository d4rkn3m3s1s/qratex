import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  dealerId: z.string().min(1),
  qrCodeId: z.string().optional(),
  tableCode: z.string().max(32).optional(),
  mood: z.enum(['OK', 'CONCERN']),
  note: z.string().max(400).optional(),
});

/**
 * Masada sessiz sinyal — herkese açık POST (QR sayfası / kiosk).
 * İsteğe bağlı oturum: customerId ilişkilendirilir.
 */
export async function POST(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.tablePulse) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const { dealerId, qrCodeId, tableCode, mood, note } = parsed.data;

  const dealer = await prisma.user.findFirst({
    where: { id: dealerId, role: 'DEALER' },
    select: { id: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: 'İşletme bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (qrCodeId) {
    const qr = await prisma.qRCode.findFirst({
      where: { id: qrCodeId, dealerId },
      select: { id: true },
    });
    if (!qr) {
      return NextResponse.json({ error: 'QR kod bu işletmeye ait değil' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
  }

  const session = await getServerSession(authOptions);
  const customerId =
    session?.user?.role === 'CUSTOMER' ? session.user.id : undefined;

  const pulse = await prisma.tablePulse.create({
    data: {
      dealerId,
      qrCodeId: qrCodeId || null,
      tableCode: tableCode?.trim() || null,
      mood,
      note: note?.trim() || null,
      customerId: customerId || null,
    },
  });

  return NextResponse.json({ success: true, pulse }, { headers: PRIVATE_NO_STORE_HEADERS });
}

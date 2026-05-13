import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { sendKvkkReceiptEmail } from '@/lib/email';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  type: z.enum(['access', 'deletion', 'rectification']),
  message: z.string().max(4000).optional(),
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['CUSTOMER', 'DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Geçersiz talep türü' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const cfg = await getInnovationPlatformConfig();
  const user = await prisma.user.findUnique({
    where: { id: auth.session.user.id },
    select: { email: true },
  });
  const email = parsed.data.email?.trim() || user?.email;
  if (!email) {
    return NextResponse.json(
      { error: 'E-posta gerekli' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const row = await prisma.dataSubjectRequest.create({
    data: {
      userId: auth.session.user.id,
      email,
      type: parsed.data.type,
      message: parsed.data.message?.trim() || null,
      status: 'received',
    },
  });

  const mail = await sendKvkkReceiptEmail(email, {
    requestId: row.id,
    type: parsed.data.type,
    createdAt: row.createdAt.toISOString(),
  });

  if (mail.ok) {
    await prisma.dataSubjectRequest.update({
      where: { id: row.id },
      data: { receiptSentAt: new Date() },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: 'data_subject_request',
      entity: 'DataSubjectRequest',
      entityId: row.id,
      newData: { type: parsed.data.type } as object,
    },
  });

  return NextResponse.json(
    {
      success: true,
      requestId: row.id,
      receiptSent: mail.ok,
      complianceContact: cfg.compliance.deletionRequestContactEmail,
      note: mail.ok
        ? 'Makbuz e-postanıza gönderildi.'
        : 'Kayıt alındı; e-posta sunucusu yapılandırılmadıysa makbuz iletilemedi.',
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { exportUserData, anonymizeUser } from '@/lib/gdpr-core';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  status: z.enum(['received', 'in_review', 'completed', 'rejected']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'status gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const existing = await prisma.dataSubjectRequest.findUnique({
    where: { id },
    select: { id: true, type: true, userId: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Talep bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const row = await prisma.dataSubjectRequest.update({
    where: { id },
    data: {
      status: parsed.data.status,
      processedAt:
        parsed.data.status === 'completed' || parsed.data.status === 'rejected'
          ? new Date()
          : undefined,
    },
  });

  return NextResponse.json({ success: true, request: row }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/**
 * POST — talebi GERÇEKTEN yürütür (yalnızca statü değil):
 *   ?action=export      → kullanıcının tüm verisini taşınabilir JSON döndürür (access)
 *   ?action=anonymize   → PII'yi geri döndürülemez maskeler (deletion) + talebi completed yapar
 * Bu olmadan KVKK m.11 hakları "kayıt alındı" aşamasında kalıyordu.
 */
const POST_ACTIONS = ['export', 'anonymize'] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const action = new URL(request.url).searchParams.get('action');
  if (!action || !POST_ACTIONS.includes(action as (typeof POST_ACTIONS)[number])) {
    return NextResponse.json(
      { error: "action 'export' veya 'anonymize' olmalı" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const req = await prisma.dataSubjectRequest.findUnique({
    where: { id },
    select: { id: true, type: true, userId: true },
  });
  if (!req || !req.userId) {
    return NextResponse.json(
      { error: 'Talep veya ilişkili kullanıcı bulunamadı' },
      { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  try {
    if (action === 'export') {
      const data = await exportUserData(req.userId);
      // Export'u talep kanıtı olarak işaretle ama statüyü admin elle 'completed' yapar.
      return NextResponse.json(
        { success: true, requestId: id, export: data },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // anonymize — geri döndürülemez; talebi completed kapat.
    const summary = await anonymizeUser(req.userId);
    await prisma.dataSubjectRequest.update({
      where: { id },
      data: { status: 'completed', processedAt: new Date() },
    });
    return NextResponse.json(
      { success: true, requestId: id, ...summary },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'USER_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    console.error('[PRIVACY_REQUEST_EXECUTE]', e);
    return NextResponse.json(
      { error: 'İşlem yürütülemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

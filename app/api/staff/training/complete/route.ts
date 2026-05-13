import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const bodySchema = z.object({ moduleId: z.string().min(1).max(64) });

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['STAFF']);
    if ('error' in auth) return auth.error;
    const session = auth.session;
    const dealerId = getStaffDealerId(session);
    if (dealerId instanceof NextResponse) return dealerId;
    const userId = session.user.id;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'moduleId gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const trainingModule = await prisma.trainingModule.findFirst({
      where: {
        id: parsed.data.moduleId,
        isActive: true,
        OR: [{ dealerId }, { dealerId: null }],
      },
    });
    if (!trainingModule) {
      return NextResponse.json({ error: 'Modül bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    await prisma.staffTrainingCompletion.upsert({
      where: {
        userId_moduleId: { userId, moduleId: parsed.data.moduleId },
      },
      create: { userId, moduleId: parsed.data.moduleId },
      update: {},
    });

    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/training/complete POST:', error);
    return NextResponse.json(
      { error: 'Kayıt başarısız' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const CHECKLIST_ITEMS_MAX = 120;

const bodySchema = z.object({
  templateId: z.string().min(1).max(64),
  shiftId: z.string().max(64).optional(),
  items: z.array(z.object({ itemId: z.string().min(1).max(64), done: z.boolean() })).max(CHECKLIST_ITEMS_MAX),
});

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
      return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const template = await prisma.checklistTemplate.findFirst({
      where: { id: parsed.data.templateId, dealerId, isActive: true },
    });
    if (!template) {
      return NextResponse.json({ error: 'Checklist bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (parsed.data.shiftId) {
      const shift = await prisma.staffShift.findFirst({
        where: { id: parsed.data.shiftId, userId },
      });
      if (!shift) {
        return NextResponse.json({ error: 'Vardiya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
    }

    const completion = await prisma.staffChecklistCompletion.create({
      data: {
        userId,
        templateId: parsed.data.templateId,
        shiftId: parsed.data.shiftId ?? null,
        items: parsed.data.items as object,
      },
    });

    return NextResponse.json({ success: true, completion }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/checklists/complete POST:', error);
    return NextResponse.json(
      { error: 'Kayıt oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

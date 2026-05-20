import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const tones = await prisma.aITone.findMany({
      orderBy: { createdAt: 'asc' }
    });

    return NextResponse.json({ success: true, tones });
  } catch (error) {
    return NextResponse.json({ error: 'Üsluplar getirilemedi' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const { slug, name, systemPrompt } = body;

    const tone = await prisma.aITone.create({
      data: { slug, name, systemPrompt }
    });

    return NextResponse.json({ success: true, tone });
  } catch (error) {
    return NextResponse.json({ error: 'Üslup oluşturulamadı' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const { id, ...data } = body;

    const updated = await prisma.aITone.update({
      where: { id },
      data
    });

    return NextResponse.json({ success: true, tone: updated });
  } catch (error) {
    return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/** Kişisel veri sızdırmadan — işletme adı + anonim paylaşım metni. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const row = await prisma.experienceShareToken.findUnique({
    where: { token },
    include: {
      dealer: { select: { businessName: true, name: true } },
    },
  });

  if (!row || row.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link süresi dolmuş veya geçersiz' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const viewed = await prisma.experienceShareToken.update({
    where: { id: row.id },
    data: { viewCount: { increment: 1 } },
    select: { viewCount: true },
  });

  return NextResponse.json({
    dealerLabel: row.dealer.businessName || row.dealer.name || 'İşletme',
    caption: row.caption,
    mood: row.mood,
    viewCount: viewed.viewCount,
    disclaimer:
      'Bu kart anonimdir; arkadaşınızın kişisel bilgisi paylaşılmaz.',
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

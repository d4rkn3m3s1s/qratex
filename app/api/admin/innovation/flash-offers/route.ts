import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const offers = await prisma.dealerFlashOffer.findMany({
    orderBy: { validTo: 'desc' },
    take: 200,
    include: {
      dealer: { select: { id: true, businessName: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ offers }, { headers: PRIVATE_NO_STORE_HEADERS });
}

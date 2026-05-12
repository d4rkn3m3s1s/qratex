import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const proposals = await prisma.segmentCampaignProposal.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      dealer: { select: { id: true, businessName: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ proposals });
}

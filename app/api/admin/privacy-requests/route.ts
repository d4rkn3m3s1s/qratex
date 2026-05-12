import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const rows = await prisma.dataSubjectRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      email: true,
      type: true,
      status: true,
      message: true,
      receiptSentAt: true,
      createdAt: true,
      processedAt: true,
      userId: true,
    },
  });

  return NextResponse.json({ requests: rows });
}

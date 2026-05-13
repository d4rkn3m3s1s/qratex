import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const result = await prisma.featureFlag.updateMany({
    where: {
      isEnabled: true,
      expiresAt: { lt: new Date(), not: null },
    },
    data: { isEnabled: false },
  });
  return NextResponse.json({ disabled: result.count });
}

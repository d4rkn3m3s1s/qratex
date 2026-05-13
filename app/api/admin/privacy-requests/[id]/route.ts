import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';

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

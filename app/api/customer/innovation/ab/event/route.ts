import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { recordInnovationAbEvent } from '@/lib/innovation-ab';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  experimentId: z.string().min(1),
  variant: z.enum(['A', 'B']),
  kind: z.enum(['conversion']).optional(),
});

/** Dönüşüm (ör. buton tıklaması) — analytics */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'experimentId ve variant gerekli' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const session = await getServerSession(authOptions);
  await recordInnovationAbEvent(
    session?.user?.id ?? null,
    parsed.data.experimentId,
    parsed.data.variant,
    'conversion'
  );

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}

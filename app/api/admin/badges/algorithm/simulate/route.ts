import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { DEFAULT_BADGE_ALGORITHM_CONFIG, simulateBadgeScore } from '@/lib/badge-algorithm';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  feedbackCount: z.number().min(0),
  totalPoints: z.number().min(0),
  streak: z.number().min(0),
  level: z.number().min(0),
  referrals: z.number().min(0),
  quests: z.number().min(0),
  weekend: z.boolean().optional(),
  campaign: z.boolean().optional(),
  retentionRisk: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const row = await prisma.settings.findUnique({ where: { key: 'badge_algorithm_config' } });
    const config = (row?.value as any) ?? DEFAULT_BADGE_ALGORITHM_CONFIG;
    const result = simulateBadgeScore(config, parsed.data);

    return NextResponse.json({ success: true, result }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Badge simulation error:', error);
    return NextResponse.json({ success: false, error: 'Simülasyon çalıştırılamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}


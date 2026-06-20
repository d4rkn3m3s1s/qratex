import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { parseChurnInterventionConfig } from '@/lib/churn-intervention-core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * Bayi churn müdahale ayarları. GET mevcut config'i (varsayılanlarla),
 * PATCH günceller. Cron (churn-intervention) bu ayarı okur.
 */
const schema = z.object({
  enabled: z.boolean().optional(),
  churnThreshold: z.number().min(0).max(1).optional(),
  inactiveDays: z.number().int().min(1).max(365).optional(),
  autoFlashOffer: z.boolean().optional(),
  maxPerRun: z.number().int().min(1).max(100).optional(),
});

export async function GET() {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const user = await prisma.user.findUnique({
      where: { id: auth.session.user.id },
      select: { dealerChurnIntervention: true },
    });
    return NextResponse.json(
      { config: parseChurnInterventionConfig(user?.dealerChurnIntervention) },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[CHURN_CONFIG_GET]', error);
    return NextResponse.json({ error: 'Ayar alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz ayar' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const current = await prisma.user.findUnique({
      where: { id: auth.session.user.id },
      select: { dealerChurnIntervention: true },
    });
    const merged = { ...parseChurnInterventionConfig(current?.dealerChurnIntervention), ...parsed.data };
    await prisma.user.update({
      where: { id: auth.session.user.id },
      data: { dealerChurnIntervention: merged as object },
    });
    return NextResponse.json({ success: true, config: merged }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[CHURN_CONFIG_PATCH]', error);
    return NextResponse.json({ error: 'Ayar güncellenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

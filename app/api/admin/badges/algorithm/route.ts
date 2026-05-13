import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { DEFAULT_BADGE_ALGORITHM_CONFIG } from '@/lib/badge-algorithm';
import { z } from 'zod';
import { getAuditRequestMeta } from '@/lib/request-metadata';


export const dynamic = 'force-dynamic';

const configSchema = z.object({
  thresholds: z.object({
    common: z.number().min(0).max(100),
    rare: z.number().min(0).max(100),
    epic: z.number().min(0).max(100),
    legendary: z.number().min(0).max(100),
  }),
  weights: z.object({
    feedbackCount: z.number().min(0).max(1),
    totalPoints: z.number().min(0).max(1),
    streak: z.number().min(0).max(1),
    level: z.number().min(0).max(1),
    referrals: z.number().min(0).max(1),
    quests: z.number().min(0).max(1),
  }),
  multipliers: z.object({
    weekend: z.number().min(0.5).max(2),
    campaign: z.number().min(0.5).max(2),
    retentionBoost: z.number().min(0.5).max(2),
  }),
  rarityBasePointCost: z.object({
    COMMON: z.number().min(0),
    RARE: z.number().min(0),
    EPIC: z.number().min(0),
    LEGENDARY: z.number().min(0),
  }),
});

const KEY = 'badge_algorithm_config';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const row = await prisma.settings.findUnique({ where: { key: KEY } });
  return NextResponse.json({
    success: true,
    config: row?.value ?? DEFAULT_BADGE_ALGORITHM_CONFIG,
    source: row ? 'settings' : 'default',
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const auditMeta = getAuditRequestMeta(req);
    const body = await req.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const config = parsed.data;
    const sum =
      config.weights.feedbackCount +
      config.weights.totalPoints +
      config.weights.streak +
      config.weights.level +
      config.weights.referrals +
      config.weights.quests;

    if (Math.abs(sum - 1) > 0.01) {
      return NextResponse.json(
        { success: false, error: 'Ağırlıkların toplamı 1 olmalı (±0.01).' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const existing = await prisma.settings.findUnique({ where: { key: KEY } });
    const saved = await prisma.settings.upsert({
      where: { key: KEY },
      update: { value: config, category: 'gamification' },
      create: { key: KEY, value: config, category: 'gamification' },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'BADGE_ALGO_UPDATE',
        entity: 'settings',
        entityId: saved.id,
        oldData: (existing?.value as object) ?? null,
        newData: config as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, config: saved.value }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Badge algorithm save error:', error);
    return NextResponse.json({ success: false, error: 'Konfigürasyon kaydedilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

const defaultAutomation = {
  enabled: false,
  minRating: 2,
  maxPerRun: 5,
  maxMonthlyAuto: 40,
  messageTemplate:
    'Deneyiminiz için özür dileriz. Aşağıdan telafi türü ve miktarınızı seçin (otomatik teklif).',
};

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  minRating: z.number().min(1).max(5).optional(),
  maxPerRun: z.number().min(1).max(25).optional(),
  maxMonthlyAuto: z.number().min(1).max(500).optional(),
  messageTemplate: z.string().max(800).optional(),
});

function parseAutomation(raw: unknown) {
  const base = { ...defaultAutomation };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.enabled === 'boolean') base.enabled = o.enabled;
    if (typeof o.minRating === 'number') base.minRating = o.minRating;
    if (typeof o.maxPerRun === 'number') base.maxPerRun = o.maxPerRun;
    if (typeof o.maxMonthlyAuto === 'number') base.maxMonthlyAuto = o.maxMonthlyAuto;
    if (typeof o.messageTemplate === 'string') base.messageTemplate = o.messageTemplate;
  }
  return base;
}

export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { dealerRemedyAutomation: true },
  });

  return NextResponse.json({
    success: true,
    automation: parseAutomation(user?.dealerRemedyAutomation),
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { dealerRemedyAutomation: true },
  });
  const current = parseAutomation(user?.dealerRemedyAutomation);
  const next = { ...current, ...parsed.data };

  await prisma.user.update({
    where: { id: dealerId },
    data: { dealerRemedyAutomation: next as object },
  });

  return NextResponse.json({ success: true, automation: next }, { headers: PRIVATE_NO_STORE_HEADERS });
}

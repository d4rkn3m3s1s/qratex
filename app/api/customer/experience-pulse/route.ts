import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { assertModuleEnabled } from '@/lib/module-gate';
import {
  EXPERIENCE_PULSE_SETTINGS_KEY,
  normalizeExperiencePulsePayload,
  type PulseFace,
} from '@/lib/experience-pulse-settings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  if (session.user.role !== 'ADMIN') {
    // Feature removed: customer_pulse_lounge
  }

  const row = await prisma.settings.findUnique({
    where: { key: EXPERIENCE_PULSE_SETTINGS_KEY },
    select: { value: true, updatedAt: true },
  });
  const full = normalizeExperiencePulsePayload(row?.value);
  const spotlight: PulseFace = full.customer;

  if (session.user.role !== 'ADMIN') {
    await prisma.analyticsEvent.create({
      data: {
        userId: session.user.id,
        event: 'experience_pulse_view',
        category: 'experience_pulse',
        data: {
          surface: 'customer',
          mood: spotlight.mood,
          settingsUpdatedAt: row?.updatedAt?.toISOString() ?? null,
        } as object,
      },
    });
  }

  return NextResponse.json(
    {
      success: true,
      spotlight,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import {
  EXPERIENCE_PULSE_SETTINGS_KEY,
  experiencePulsePayloadSchema,
  normalizeExperiencePulsePayload,
} from '@/lib/experience-pulse-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const row = await prisma.settings.findUnique({
    where: { key: EXPERIENCE_PULSE_SETTINGS_KEY },
    select: { id: true, value: true, updatedAt: true },
  });
  const payload = normalizeExperiencePulsePayload(row?.value);
  return NextResponse.json(
    {
      success: true,
      id: row?.id ?? null,
      payload,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const rl = checkAdminRateLimit(auth.session.user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
        },
      }
    );
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = experiencePulsePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? 'Geçersiz vitrin ayarı';
    return NextResponse.json(
      { success: false, error: msg, details: parsed.error.flatten() },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const existing = await prisma.settings.findUnique({
    where: { key: EXPERIENCE_PULSE_SETTINGS_KEY },
    select: { id: true, value: true },
  });

  const saved = await prisma.settings.upsert({
    where: { key: EXPERIENCE_PULSE_SETTINGS_KEY },
    create: {
      key: EXPERIENCE_PULSE_SETTINGS_KEY,
      category: 'admin',
      value: parsed.data as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: parsed.data as unknown as Prisma.InputJsonValue,
    },
  });

  const auditMeta = getAuditRequestMeta(request);
  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: existing ? 'update_experience_pulse_studio' : 'create_experience_pulse_studio',
      entity: 'settings',
      entityId: saved.id,
      oldData: { [EXPERIENCE_PULSE_SETTINGS_KEY]: (existing?.value ?? Prisma.JsonNull) } as Prisma.InputJsonValue,
      newData: { [EXPERIENCE_PULSE_SETTINGS_KEY]: parsed.data } as Prisma.InputJsonValue,
      ...auditMeta,
    },
  });

  return NextResponse.json(
    {
      success: true,
      id: saved.id,
      payload: parsed.data,
      updatedAt: saved.updatedAt.toISOString(),
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

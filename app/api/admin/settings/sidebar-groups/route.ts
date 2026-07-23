import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import {
  normalizeSidebarNavGroups,
  groupsPayloadForAudit,
  SIDEBAR_NAV_GROUPS_SETTINGS_KEY,
  type SidebarNavGroupsPayload,
} from '@/lib/sidebar-groups-settings';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const rolePayloadSchema = z.object({
  groupLabels: z.record(z.string().min(1).max(200), z.string().max(60)).optional(),
  itemGroups: z.record(z.string().min(1).max(200), z.string().max(200)).optional(),
});

const putSchema = z.object({
  dealer: rolePayloadSchema.optional(),
  customer: rolePayloadSchema.optional(),
});

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const row = await prisma.settings.findUnique({
    where: { key: SIDEBAR_NAV_GROUPS_SETTINGS_KEY },
    select: { value: true, updatedAt: true },
  });
  const payload = normalizeSidebarNavGroups(row?.value);
  return NextResponse.json(
    { success: true, payload, updatedAt: row?.updatedAt?.toISOString() ?? null },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const rl = checkAdminRateLimit(auth.session.user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek.' },
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
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Geçersiz grup payload' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const existing = await prisma.settings.findUnique({
    where: { key: SIDEBAR_NAV_GROUPS_SETTINGS_KEY },
    select: { id: true, value: true },
  });
  const prev = normalizeSidebarNavGroups(existing?.value);
  // Rol bazında kısmi güncelleme (verilen rol tamamen o rolün payload'ıyla değişir).
  const merged: SidebarNavGroupsPayload = { ...prev };
  if (parsed.data.dealer) merged.dealer = parsed.data.dealer;
  if (parsed.data.customer) merged.customer = parsed.data.customer;
  const next = normalizeSidebarNavGroups(merged);

  const saved = await prisma.settings.upsert({
    where: { key: SIDEBAR_NAV_GROUPS_SETTINGS_KEY },
    create: {
      key: SIDEBAR_NAV_GROUPS_SETTINGS_KEY,
      category: 'admin',
      value: groupsPayloadForAudit(next),
    },
    update: { value: groupsPayloadForAudit(next) },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: existing ? 'update_sidebar_nav_groups' : 'create_sidebar_nav_groups',
      entity: 'settings',
      entityId: saved.id,
      oldData: { [SIDEBAR_NAV_GROUPS_SETTINGS_KEY]: (existing?.value ?? Prisma.JsonNull) } as Prisma.InputJsonValue,
      newData: { [SIDEBAR_NAV_GROUPS_SETTINGS_KEY]: next } as Prisma.InputJsonValue,
      ...getAuditRequestMeta(request),
    },
  });

  return NextResponse.json(
    { success: true, payload: next, updatedAt: saved.updatedAt.toISOString() },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

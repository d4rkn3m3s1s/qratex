import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import {
  normalizeSidebarNavOrder,
  orderPayloadForAudit,
  SIDEBAR_NAV_ORDER_SETTINGS_KEY,
  type SidebarNavOrderPayload,
} from '@/lib/sidebar-order-settings';
import { z } from 'zod';
import { canonicalizeOrderIds } from '@/lib/navigation/settings';
import { NAV_SETTINGS_TAG } from '@/lib/navigation/cache-tags';

export const dynamic = 'force-dynamic';

const putSchema = z.object({
  admin: z.array(z.string().min(1).max(200)).optional(),
  dealer: z.array(z.string().min(1).max(200)).optional(),
  customer: z.array(z.string().min(1).max(200)).optional(),
});

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const row = await prisma.settings.findUnique({
    where: { key: SIDEBAR_NAV_ORDER_SETTINGS_KEY },
    select: { value: true, updatedAt: true },
  });
  // Eski kimlikler (key/href) okumada kayıt kimliğine göç eder (lib/navigation/registry).
  const stored = normalizeSidebarNavOrder(row?.value);
  const payload: SidebarNavOrderPayload = {};
  for (const role of ['admin', 'dealer', 'customer'] as const) {
    if (stored[role]) payload[role] = canonicalizeOrderIds(role, stored[role]!).value;
  }
  return NextResponse.json(
    {
      success: true,
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
      { success: false, error: 'Geçersiz sıra payload' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  // Varsayılan reddet: her kimlik kayıtta çözülmeli; çözülenler kayıt kimliğiyle saklanır.
  const canonical: SidebarNavOrderPayload = {};
  const unknown: string[] = [];
  for (const role of ['admin', 'dealer', 'customer'] as const) {
    const ids = parsed.data[role];
    if (!ids) continue;
    const res = canonicalizeOrderIds(role, ids);
    canonical[role] = res.value;
    unknown.push(...res.unknown.map((id) => `${role}:${id}`));
  }
  if (unknown.length) {
    return NextResponse.json(
      { success: false, error: 'Menü kaydında olmayan öğe kimlikleri', code: 'VALIDATION', details: { unknown } },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  const existing = await prisma.settings.findUnique({
    where: { key: SIDEBAR_NAV_ORDER_SETTINGS_KEY },
    select: { id: true, value: true },
  });
  const prev = normalizeSidebarNavOrder(existing?.value);
  const next: SidebarNavOrderPayload = { ...prev };
  if (canonical.admin) next.admin = canonical.admin;
  if (canonical.dealer) next.dealer = canonical.dealer;
  if (canonical.customer) next.customer = canonical.customer;

  const saved = await prisma.settings.upsert({
    where: { key: SIDEBAR_NAV_ORDER_SETTINGS_KEY },
    create: {
      key: SIDEBAR_NAV_ORDER_SETTINGS_KEY,
      category: 'admin',
      value: orderPayloadForAudit(next),
    },
    update: { value: orderPayloadForAudit(next) },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: existing ? 'update_sidebar_nav_order' : 'create_sidebar_nav_order',
      entity: 'settings',
      entityId: saved.id,
      oldData: { [SIDEBAR_NAV_ORDER_SETTINGS_KEY]: (existing?.value ?? Prisma.JsonNull) } as Prisma.InputJsonValue,
      newData: { [SIDEBAR_NAV_ORDER_SETTINGS_KEY]: next } as Prisma.InputJsonValue,
      ...getAuditRequestMeta(request),
    },
  });

  // Sunucuda önbelleklenen kabuk menüsünü tazele (getShellConfig).
  const { revalidateTag } = await import('next/cache');
  revalidateTag(NAV_SETTINGS_TAG, 'max');

  return NextResponse.json(
    { success: true, payload: next, updatedAt: saved.updatedAt.toISOString() },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

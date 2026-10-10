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
import {
  baseVersionRequiredResponse,
  isVersionConflictError,
  readBaseVersion,
  versionConflictResponse,
  versionFromDate,
  writeVersionedSetting,
} from '@/lib/settings-version';
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

/** GET — canlı grup override'ları + sürüm. Okuma hatası 500 (istemci formu açmaz — P0-28). */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const row = await prisma.settings.findUnique({
      where: { key: SIDEBAR_NAV_GROUPS_SETTINGS_KEY },
      select: { value: true, updatedAt: true },
    });
    const payload = normalizeSidebarNavGroups(row?.value);
    return NextResponse.json(
      {
        success: true,
        payload,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
        version: versionFromDate(row?.updatedAt),
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Sidebar groups fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Menü grupları alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
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

  const baseVersion = readBaseVersion(raw);
  if (!baseVersion) return baseVersionRequiredResponse();

  try {
    const result = await prisma.$transaction(async (tx) => {
      let next: SidebarNavGroupsPayload = {};
      const written = await writeVersionedSetting(tx, {
        key: SIDEBAR_NAV_GROUPS_SETTINGS_KEY,
        category: 'admin',
        baseVersion,
        // Rol bazında kısmi güncelleme (verilen rol tamamen o rolün payload'ıyla değişir);
        // birleştirme kilit altında okunan GÜNCEL değer üzerinden yapılır.
        value: (previous) => {
          const prev = normalizeSidebarNavGroups(previous);
          const merged: SidebarNavGroupsPayload = { ...prev };
          if (parsed.data.dealer) merged.dealer = parsed.data.dealer;
          if (parsed.data.customer) merged.customer = parsed.data.customer;
          next = normalizeSidebarNavGroups(merged);
          return groupsPayloadForAudit(next);
        },
      });
      await tx.auditLog.create({
        data: {
          userId: auth.session.user.id,
          action: written.created ? 'create_sidebar_nav_groups' : 'update_sidebar_nav_groups',
          entity: 'settings',
          entityId: written.id,
          oldData: { [SIDEBAR_NAV_GROUPS_SETTINGS_KEY]: (written.previous ?? Prisma.JsonNull) } as Prisma.InputJsonValue,
          newData: { [SIDEBAR_NAV_GROUPS_SETTINGS_KEY]: next } as Prisma.InputJsonValue,
          ...getAuditRequestMeta(request),
        },
      });
      return { written, next };
    });

    return NextResponse.json(
      {
        success: true,
        payload: result.next,
        updatedAt: result.written.version,
        version: result.written.version,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isVersionConflictError(error)) return versionConflictResponse(error);
    console.error('Sidebar groups update error:', error);
    return NextResponse.json(
      { success: false, error: 'Menü grupları kaydedilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

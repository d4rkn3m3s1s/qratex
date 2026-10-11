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
import { canonicalizeGroupsPayload } from '@/lib/navigation/settings';
import { NAV_SETTINGS_TAG } from '@/lib/navigation/cache-tags';

export const dynamic = 'force-dynamic';

// Grup başlığı: düz metin (eski, iki dilde aynı) ya da { tr, en } (B12.2).
const labelSchema = z.union([
  z.string().max(60),
  z.object({ tr: z.string().max(60).optional(), en: z.string().max(60).optional() }).strict(),
]);

const rolePayloadSchema = z.object({
  groupLabels: z.record(z.string().min(1).max(200), labelSchema).optional(),
  itemGroups: z.record(z.string().min(1).max(200), z.string().max(200)).optional(),
});

const putSchema = z.object({
  admin: rolePayloadSchema.optional(),
  dealer: rolePayloadSchema.optional(),
  customer: rolePayloadSchema.optional(),
});

const GROUP_ROLES = ['admin', 'dealer', 'customer'] as const;

/** GET — canlı grup override'ları + sürüm. Okuma hatası 500 (istemci formu açmaz — P0-28). */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const row = await prisma.settings.findUnique({
      where: { key: SIDEBAR_NAV_GROUPS_SETTINGS_KEY },
      select: { value: true, updatedAt: true },
    });
    // Eski öğe kimlikleri kayıt kimliğine göç eder; kayıtta olmayan grup/öğe düşer.
    const stored = normalizeSidebarNavGroups(row?.value);
    const payload: SidebarNavGroupsPayload = {};
    for (const role of GROUP_ROLES) {
      if (stored[role]) payload[role] = canonicalizeGroupsPayload(role, stored[role]!).value;
    }
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
  const rl = await checkAdminRateLimit(auth.session.user.id);
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

  // Varsayılan reddet: öğe ve grup kimlikleri kayıtta (lib/navigation/registry) çözülmeli.
  const canonical: SidebarNavGroupsPayload = {};
  const unknown: string[] = [];
  for (const role of GROUP_ROLES) {
    const rp = parsed.data[role];
    if (!rp) continue;
    const res = canonicalizeGroupsPayload(role, rp);
    canonical[role] = res.value;
    unknown.push(...res.unknown.map((id) => `${role}:${id}`));
  }
  if (unknown.length) {
    return NextResponse.json(
      { success: false, error: 'Menü kaydında olmayan grup ya da öğe kimlikleri', code: 'VALIDATION', details: { unknown } },
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
          for (const role of GROUP_ROLES) {
            if (canonical[role]) merged[role] = canonical[role];
          }
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

    // Sunucuda önbelleklenen kabuk menüsünü tazele (getShellConfig).
    const { revalidateTag } = await import('next/cache');
    revalidateTag(NAV_SETTINGS_TAG, 'max');

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

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminSeoRateLimit } from '@/lib/rate-limit';
import { SEO_SETTINGS_KEY, SEO_CACHE_TAG, type SeoSettingsPayload } from '@/lib/seo-settings';
import { adminSeoRollbackSchema } from '@/lib/validations-admin';
import { Prisma } from '@prisma/client';


export const dynamic = 'force-dynamic';

/** Audit log kaydındaki önceki sürüme (oldData) geri döner. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const rl = checkAdminSeoRateLimit(auth.session.user.id);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
          },
        }
      );
    }
    const raw = await request.json();
    const parsed = adminSeoRollbackSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json({ error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const { auditLogId } = parsed.data;

    const seoSetting = await prisma.settings.findUnique({
      where: { key: SEO_SETTINGS_KEY },
      select: { id: true },
    });
    if (!seoSetting) return NextResponse.json({ error: 'SEO ayarları bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });

    const log = await prisma.auditLog.findFirst({
      where: { id: auditLogId, entity: 'settings', entityId: seoSetting.id },
    });
    if (!log || !log.oldData || typeof log.oldData !== 'object') {
      return NextResponse.json({ error: 'Geçersiz veya bulunamadı audit kaydı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const oldPayload = log.oldData as unknown as SeoSettingsPayload;
    if (!oldPayload.global) return NextResponse.json({ error: 'Eski veri geçersiz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });

    const current = await prisma.settings.findUnique({
      where: { key: SEO_SETTINGS_KEY },
      select: { value: true },
    });
    const value = {
      global: oldPayload.global,
      pageOverrides: Array.isArray(oldPayload.pageOverrides) ? oldPayload.pageOverrides : [],
    };

    await prisma.settings.upsert({
      where: { key: SEO_SETTINGS_KEY },
      create: { key: SEO_SETTINGS_KEY, value: value as object, category: 'seo' },
      update: { value: value as object, updatedAt: new Date() },
    });

    const auditMeta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'rollback',
        entity: 'settings',
        entityId: seoSetting.id,
        oldData: (current?.value ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        newData: value as unknown as Prisma.InputJsonValue,
        ...auditMeta,
      },
    });

    revalidateTag(SEO_CACHE_TAG, 'max');
    return NextResponse.json({ ok: true, settings: value }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('SEO rollback error:', e);
    return NextResponse.json({ error: 'Geri alma başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
// P0-01: gizli kapı ayarı rollback ile geri yüklenemez (eski düz metin cevap dirilmesin).
import { isProtectedSettingKey } from '@/lib/admin-gate';
import { RETIRED_SECRET_SETTING_KEYS, isDedicatedSettingKey } from '@/lib/platform-settings/registry';
import { revalidateTag } from 'next/cache';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';


export const dynamic = 'force-dynamic';

const schema = z.object({
  auditLogId: z.string().min(1),
});

type SettingsMap = Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('admin.settings.rollback.post', auth.session.user.id, 'mutation');
    if (limited) return limited;
    const { session } = auth;
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const entry = await prisma.auditLog.findUnique({
      where: { id: parsed.data.auditLogId },
      select: { id: true, entity: true, entityId: true, action: true, oldData: true, newData: true },
    });
    if (!entry || entry.entity !== 'settings') {
      return NextResponse.json({ error: 'Audit kaydı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // B3: yalnız {anahtar: değer} biçimli toplu kayıtlar geri alınabilir (modül/SEO/rozet vb.
    // kayıtlarının üst düzey alanları ayar anahtarı sanılıp çöp satır açılıyordu).
    if (entry.entityId || (entry.action !== 'batch_update' && entry.action !== 'rollback')) {
      return NextResponse.json({ error: 'Bu kayıt bu uçla geri alınamaz' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const oldData = entry.oldData;
    if (!oldData || typeof oldData !== 'object' || Array.isArray(oldData)) {
      return NextResponse.json({ error: 'Bu kayıt rollback için uygun değil' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const map = oldData as SettingsMap;
    const candidateKeys = Object.keys(map).filter(
      // Kayıt defteri anahtarları kendi sürümlü geri almasıyla döner (Ayarlar › Geçmiş); burada atlanır.
      (k) =>
        !isProtectedSettingKey(k) &&
        !RETIRED_SECRET_SETTING_KEYS.has(k) &&
        !isDedicatedSettingKey(k) &&
        map[k] !== null &&
        map[k] !== undefined
    );
    // Yalnız VAR OLAN satırlar geri yüklenir (yeni, okuyucusuz satır açılmaz).
    const present = await prisma.settings.findMany({ where: { key: { in: candidateKeys } }, select: { key: true } });
    const presentSet = new Set(present.map((r) => r.key));
    const keys = candidateKeys.filter((k) => presentSet.has(k));
    if (keys.length === 0) {
      return NextResponse.json({ error: 'Rollback edilecek ayar bulunamadı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const existing = await prisma.settings.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const currentMap = existing.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    await prisma.$transaction(
      keys.map((key) =>
        prisma.settings.upsert({
          where: { key },
          update: { value: map[key] as Prisma.InputJsonValue },
          create: {
            key,
            category: 'general',
            value: map[key] as Prisma.InputJsonValue,
          },
        })
      )
    );

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'rollback',
        entity: 'settings',
        oldData: currentMap as Prisma.InputJsonValue,
        newData: map as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });

    for (const tag of ['settings', 'module-gate-settings', 'public-theme-settings']) {
      try {
        revalidateTag(tag, { expire: 0 });
      } catch {
        /* yut */
      }
    }

    return NextResponse.json({ success: true, restoredKeys: keys }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Settings rollback error:', error);
    return NextResponse.json({ error: 'Rollback başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

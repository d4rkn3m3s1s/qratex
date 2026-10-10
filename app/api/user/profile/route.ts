import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { z } from 'zod';
import {
  VersionConflictError,
  isVersionConflictError,
  lockResource,
  readBaseVersion,
  versionConflictResponse,
  versionFromContent,
} from '@/lib/settings-version';


export const dynamic = 'force-dynamic';

const updateProfileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  image: z.string().max(2048).optional(),
  phone: z.string().max(30).optional().nullable(),
  businessName: z.string().max(100).optional().nullable(),
  businessDesc: z.string().max(500).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  businessHours: z.string().max(2000).optional().nullable(),
  defaultReplyTemplate: z.string().max(2000).optional().nullable(),
  preferredLanguage: z.string().max(10).optional().nullable(),
  holidayMode: z.boolean().optional(),
});

/**
 * Profil sürümü (P0-28): YALNIZ düzenlenebilir alanların içerik özeti. `User.updatedAt` puan,
 * son giriş vb. her yazımda değiştiği için kullanılmaz (sahte çakışma üretirdi).
 */
const PROFILE_VERSION_SELECT = {
  name: true,
  image: true,
  phone: true,
  businessName: true,
  businessDesc: true,
  address: true,
  latitude: true,
  longitude: true,
  businessHours: true,
  defaultReplyTemplate: true,
  preferredLanguage: true,
  holidayMode: true,
} as const;

type ProfileVersionFields = { [K in keyof typeof PROFILE_VERSION_SELECT]?: unknown };

function profileVersion(user: ProfileVersionFields): string {
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(PROFILE_VERSION_SELECT)) {
    picked[key] = (user as Record<string, unknown>)[key] ?? null;
  }
  return versionFromContent(picked);
}

export async function PATCH(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth();
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Geçersiz veri' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { name, image, phone, businessName, businessDesc, address, latitude, longitude, businessHours, defaultReplyTemplate, preferredLanguage, holidayMode } = parsed.data;
    // İsteğe bağlı iyimser kilit: `baseVersion` gönderen istemciler (bayi ayarları) için
    // kilit altında sürüm karşılaştırılır; uyuşmazlıkta 409. Göndermeyenler (müşteri ayarları,
    // dil seçici) eski davranışla devam eder.
    const baseVersion = readBaseVersion(body);

    const updatedUser = await prisma.$transaction(async (tx) => {
      if (baseVersion) {
        await lockResource(tx, `profile:${session.user.id}`);
        const current = await tx.user.findUnique({ where: { id: session.user.id }, select: PROFILE_VERSION_SELECT });
        const currentVersion = current ? profileVersion(current) : 'none';
        if (currentVersion !== baseVersion) {
          throw new VersionConflictError(currentVersion, [{ key: 'profile', currentVersion }]);
        }
      }
      return tx.user.update({
      where: { id: session.user.id },
      data: {
        ...(name && { name }),
        ...(image && { image }),
        ...(typeof phone !== 'undefined' ? { phone } : {}),
        ...(typeof businessName !== 'undefined' ? { businessName } : {}),
        ...(typeof businessDesc !== 'undefined' ? { businessDesc } : {}),
        ...(typeof address !== 'undefined' ? { address } : {}),
        ...(typeof latitude !== 'undefined' ? { latitude } : {}),
        ...(typeof longitude !== 'undefined' ? { longitude } : {}),
        ...(typeof businessHours !== 'undefined' ? { businessHours } : {}),
        ...(typeof defaultReplyTemplate !== 'undefined' ? { defaultReplyTemplate } : {}),
        ...(typeof preferredLanguage !== 'undefined' ? { preferredLanguage } : {}),
        ...(typeof holidayMode !== 'undefined' ? { holidayMode } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        phone: true,
        role: true,
        businessName: true,
        businessDesc: true,
        address: true,
        latitude: true,
        longitude: true,
        businessHours: true,
        defaultReplyTemplate: true,
        preferredLanguage: true,
        holidayMode: true,
      },
      });
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_PROFILE',
        entity: 'User',
        entityId: session.user.id,
        newData: { name, image, phone, businessName, businessDesc, address, latitude, longitude, holidayMode } as object,
        ...auditMeta,
      },
    });

    return NextResponse.json(
      { success: true, user: updatedUser, version: profileVersion(updatedUser) },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isVersionConflictError(error)) return versionConflictResponse(error);
    console.error('Error updating profile:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Profil güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        phone: true,
        role: true,
        businessName: true,
        businessDesc: true,
        address: true,
        latitude: true,
        longitude: true,
        businessHours: true,
        defaultReplyTemplate: true,
        preferredLanguage: true,
        holidayMode: true,
        points: true,
        level: true,
        createdAt: true,
        password: true,
        _count: {
          select: {
            feedbacks: true,
            badges: true,
            quests: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { password: _pw, ...rest } = user;

    return NextResponse.json(
      {
        success: true,
        user: {
          ...rest,
          hasPassword: Boolean(_pw),
        },
        version: profileVersion(rest),
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching profile:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Profil getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { z } from 'zod';
import {
  SEASONAL_BONUS_MAX,
  SEASONAL_MULTIPLIER_MAX,
  SEASONAL_MULTIPLIER_MIN,
} from '@/lib/points-multipliers';
import { SEASONAL_CAMPAIGN_TYPES, seasonalCampaignConditionsSchema } from '@/lib/seasonal-campaign-live';

export const dynamic = 'force-dynamic';

/**
 * Sezonsal kampanya yönetimi (admin). SeasonalCampaign gerçek puan kazanımına bağlı
 * (lib/seasonal-campaign-live → feedback + tüketim pasif puanı).
 *
 * P0-21: çarpan [1, 3] (önceden 10), bonus ≤ 250 (önceden 100.000), `conditions` tipli
 * (`{ minLevel? }`), BIRTHDAY/ANNIVERSARY yalnız ilgili kullanıcıya uygulanır. PUT'ta
 * mevcut kayıtla birleştirilmiş tarih doğrulaması ve tam önce/sonra denetim kaydı.
 */
const campaignFields = {
  name: z
    .string({ required_error: 'Ad gerekli', invalid_type_error: 'Ad metin olmalı' })
    .trim()
    .min(2, 'Ad en az 2 karakter olmalı')
    .max(120, 'Ad en fazla 120 karakter olabilir'),
  description: z
    .string({ required_error: 'Açıklama gerekli', invalid_type_error: 'Açıklama metin olmalı' })
    .trim()
    .min(1, 'Açıklama gerekli')
    .max(2000, 'Açıklama en fazla 2000 karakter olabilir'),
  type: z.enum(SEASONAL_CAMPAIGN_TYPES, {
    errorMap: () => ({ message: 'Geçersiz kampanya türü (Sezonluk, Özel, Doğum günü veya Yıl dönümü)' }),
  }),
  multiplier: z
    .number({ invalid_type_error: 'Çarpan sayı olmalı' })
    .finite('Çarpan sayı olmalı')
    .min(SEASONAL_MULTIPLIER_MIN, `Çarpan en az ${SEASONAL_MULTIPLIER_MIN} olmalı`)
    .max(SEASONAL_MULTIPLIER_MAX, `Çarpan en fazla ${SEASONAL_MULTIPLIER_MAX} olabilir`),
  bonusPoints: z
    .number({ invalid_type_error: 'Bonus puan sayı olmalı' })
    .int('Bonus puan tam sayı olmalı')
    .min(0, 'Bonus puan negatif olamaz')
    .max(SEASONAL_BONUS_MAX, `Bonus puan en fazla ${SEASONAL_BONUS_MAX} olabilir`),
  discount: z
    .number({ invalid_type_error: 'İndirim sayı olmalı' })
    .min(0, 'İndirim negatif olamaz')
    .max(100, 'İndirim en fazla %100 olabilir')
    .nullable(),
  imageUrl: z.string().url('Geçersiz görsel adresi').max(2000).nullable(),
  conditions: seasonalCampaignConditionsSchema.nullable(),
  isActive: z.boolean({ invalid_type_error: 'Durum true/false olmalı' }),
  startDate: z.string({ required_error: 'Başlangıç tarihi gerekli' }).datetime({ offset: true, message: 'Geçersiz başlangıç tarihi' }),
  endDate: z.string({ required_error: 'Bitiş tarihi gerekli' }).datetime({ offset: true, message: 'Geçersiz bitiş tarihi' }),
};

const seasonalCampaignCreateSchema = z.object({
  name: campaignFields.name,
  description: campaignFields.description,
  type: campaignFields.type,
  multiplier: campaignFields.multiplier.optional(),
  bonusPoints: campaignFields.bonusPoints.optional(),
  discount: campaignFields.discount.optional(),
  imageUrl: campaignFields.imageUrl.optional(),
  conditions: campaignFields.conditions.optional(),
  isActive: campaignFields.isActive.optional(),
  startDate: campaignFields.startDate,
  endDate: campaignFields.endDate,
});

const seasonalCampaignUpdateSchema = seasonalCampaignCreateSchema
  .partial()
  .extend({ id: z.string({ required_error: 'Kampanya kimliği gerekli' }).min(1, 'Kampanya kimliği gerekli').max(64) });

const AUDITED_FIELDS = [
  'name',
  'description',
  'type',
  'multiplier',
  'bonusPoints',
  'discount',
  'imageUrl',
  'conditions',
  'isActive',
  'startDate',
  'endDate',
] as const;

type CampaignRow = Record<(typeof AUDITED_FIELDS)[number], unknown>;

function snapshot(row: CampaignRow): Prisma.InputJsonObject {
  const out: Record<string, unknown> = {};
  for (const k of AUDITED_FIELDS) {
    const v = row[k];
    out[k] = v instanceof Date ? v.toISOString() : v ?? null;
  }
  return out as Prisma.InputJsonObject;
}

function changedFields(before: Prisma.InputJsonObject, after: Prisma.InputJsonObject): string[] {
  return AUDITED_FIELDS.filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
}

function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

async function readJson(request: NextRequest): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const isActiveParam = new URL(request.url).searchParams.get('isActive');
    const where =
      isActiveParam === 'true' ? { isActive: true } : isActiveParam === 'false' ? { isActive: false } : {};
    const campaigns = await prisma.seasonalCampaign.findMany({
      where,
      orderBy: { startDate: 'desc' },
      take: 200,
    });
    return NextResponse.json(campaigns, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('SeasonalCampaign GET error:', e);
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    return NextResponse.json({ error: 'Kampanyalar alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const body = await readJson(request);
    if (body === undefined) return badRequest('Geçersiz JSON gövdesi');
    const parsed = seasonalCampaignCreateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.errors[0]?.message ?? 'Geçersiz istek', parsed.error.flatten());
    }
    const d = parsed.data;
    const start = new Date(d.startDate);
    const end = new Date(d.endDate);
    if (end <= start) return badRequest('Bitiş tarihi başlangıçtan sonra olmalı');

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.seasonalCampaign.create({
        data: {
          name: d.name,
          description: d.description,
          type: d.type,
          multiplier: d.multiplier ?? 1.5,
          bonusPoints: d.bonusPoints ?? 0,
          discount: d.discount ?? null,
          imageUrl: d.imageUrl ?? null,
          conditions: d.conditions ? (d.conditions as Prisma.InputJsonObject) : Prisma.DbNull,
          isActive: d.isActive ?? true,
          startDate: start,
          endDate: end,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: auth.session.user.id,
          action: 'CREATE_SEASONAL_CAMPAIGN',
          entity: 'SeasonalCampaign',
          entityId: created.id,
          newData: snapshot(created as unknown as CampaignRow),
          ...getAuditRequestMeta(request),
        },
      });
      return created;
    });
    return NextResponse.json(campaign, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('SeasonalCampaign POST error:', e);
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    return NextResponse.json({ error: 'Kampanya oluşturulamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const body = await readJson(request);
    if (body === undefined) return badRequest('Geçersiz JSON gövdesi');
    const parsed = seasonalCampaignUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.errors[0]?.message ?? 'Geçersiz istek', parsed.error.flatten());
    }
    const { id, startDate, endDate, conditions, ...rest } = parsed.data;
    const existing = await prisma.seasonalCampaign.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Tarih doğrulaması mevcut kayıtla BİRLEŞTİRİLMİŞ değerler üzerinde (yalnız biri gelse de).
    const nextStart = startDate ? new Date(startDate) : existing.startDate;
    const nextEnd = endDate ? new Date(endDate) : existing.endDate;
    if (nextEnd <= nextStart) return badRequest('Bitiş tarihi başlangıçtan sonra olmalı');

    const data: Prisma.SeasonalCampaignUpdateInput = { ...rest };
    if (startDate) data.startDate = nextStart;
    if (endDate) data.endDate = nextEnd;
    if (conditions !== undefined) {
      data.conditions = conditions ? (conditions as Prisma.InputJsonObject) : Prisma.DbNull;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.seasonalCampaign.update({ where: { id }, data });
      const before = snapshot(existing as unknown as CampaignRow);
      const after = snapshot(row as unknown as CampaignRow);
      await tx.auditLog.create({
        data: {
          userId: auth.session.user.id,
          action: 'UPDATE_SEASONAL_CAMPAIGN',
          entity: 'SeasonalCampaign',
          entityId: id,
          oldData: before,
          newData: { ...after, changedFields: changedFields(before, after) } as Prisma.InputJsonObject,
          ...getAuditRequestMeta(request),
        },
      });
      return row;
    });
    return NextResponse.json(updated, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('SeasonalCampaign PUT error:', e);
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    return NextResponse.json({ error: 'Kampanya güncellenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

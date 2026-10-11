/**
 * Bayi Ayarlar yazma yolları. Her yazım: tek transaction + kaynağa özel advisory kilit +
 * iyimser sürüm (`baseVersion`) karşılaştırması → uyuşmazlıkta 409 (denetim B1/B2/B4: yükleme
 * hatası sonrası "varsayılanlarla Kaydet" ya da iki sekmenin birbirini ezmesi durur).
 * Alan bazlı: yalnız gönderilen (değişen) alan yazılır. Her değişiklik denetim kaydına düşer.
 */
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { NO_VERSION, VERSION_CONFLICT_CODE, VERSION_CONFLICT_MESSAGE, lockResource, nextUpdatedAt, versionFromDate } from '@/lib/settings-version';
import { detectPromptInjection } from '@/lib/prompt-injection';
import { invalidateDealerAiPolicy } from '@/lib/ai-policy';
import { defaultAvatars } from '@/lib/avatar-options';
import { deleteFromR2, keyFromPublicUrl, uploadToR2 } from '@/lib/r2-storage';
import { feedbackPhotosEnabled, MAX_UPLOAD_BYTES, processFeedbackPhoto } from '@/lib/feedback-funnel/media';
import type { AccountPatch, AiPatch, AiSettingsView, BusinessPatch, WeeklyHours } from './contract';
import { validateWeek, weekToStored } from './hours';
import {
  ACCOUNT_VERSION_SELECT,
  AI_DEFAULTS,
  AI_SETTINGS_SELECT,
  BUSINESS_VERSION_SELECT,
  accountVersionOf,
  businessVersionOf,
  toAiView,
} from './load.server';

export interface AuditMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function conflict(currentVersion: string): ApiError {
  return new ApiError(VERSION_CONFLICT_CODE, VERSION_CONFLICT_MESSAGE, { status: 409, details: { currentVersion } });
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ───────────────────────────── İşletme ─────────────────────────────

const BUSINESS_FIELDS = ['businessName', 'businessDesc', 'address', 'latitude', 'longitude', 'holidayMode', 'defaultReplyTemplate'] as const;

export interface BusinessPatchParsed extends Omit<BusinessPatch, 'hours' | 'baseVersion'> {
  baseVersion: string;
  hours?: WeeklyHours;
}

export async function updateDealerBusiness(
  dealerId: string,
  patch: BusinessPatchParsed,
  meta: AuditMeta = {}
): Promise<{ version: string; changed: string[] }> {
  let hoursText: string | null | undefined;
  if (patch.hours !== undefined) {
    const issues = validateWeek(patch.hours);
    if (issues.length > 0) {
      throw new ApiError('VALIDATION', issues[0].message, {
        details: issues.map((i) => ({ path: `hours.${i.day}${i.range !== undefined ? `.ranges.${i.range}` : ''}`, message: i.message })),
      });
    }
    hoursText = weekToStored(patch.hours);
  }

  return prisma.$transaction(async (tx) => {
    await lockResource(tx, `profile:${dealerId}`);
    const current = await tx.user.findUnique({ where: { id: dealerId }, select: BUSINESS_VERSION_SELECT });
    if (!current) throw new ApiError('NOT_FOUND', 'Hesap bulunamadı.');
    const currentVersion = businessVersionOf(current as unknown as Record<string, unknown>);
    if (currentVersion !== patch.baseVersion) throw conflict(currentVersion);

    const data: Record<string, unknown> = {};
    for (const key of BUSINESS_FIELDS) {
      const value = (patch as unknown as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (!same(value, (current as Record<string, unknown>)[key])) data[key] = value;
    }
    if (hoursText !== undefined && !same(hoursText, current.businessHours)) data.businessHours = hoursText;

    const changed = Object.keys(data);
    if (changed.length === 0) return { version: currentVersion, changed };

    const next = await tx.user.update({ where: { id: dealerId }, data, select: BUSINESS_VERSION_SELECT });
    await tx.auditLog.create({
      data: {
        userId: dealerId,
        action: 'UPDATE_BUSINESS_PROFILE',
        entity: 'User',
        entityId: dealerId,
        newData: { fields: changed } as Prisma.InputJsonObject,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
    return { version: businessVersionOf(next as unknown as Record<string, unknown>), changed };
  });
}

// ───────────────────────────── Logo ─────────────────────────────

export const LOGO_KEY_PREFIX = 'logos/';

export function logoUploadEnabled(): boolean {
  return feedbackPhotosEnabled();
}

function ownLogoKey(url: string | null | undefined, dealerId: string): string | null {
  if (!url) return null;
  const key = keyFromPublicUrl(url);
  const safe = dealerId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return key && key.startsWith(`${LOGO_KEY_PREFIX}${safe}/`) ? key : null;
}

/** Baytlardan biçim doğrular, yeniden kodlar (EXIF atılır), R2'ye yazar, eski logoyu siler. */
export async function uploadDealerLogo(
  dealerId: string,
  file: { size: number; arrayBuffer(): Promise<ArrayBuffer> },
  meta: AuditMeta = {}
): Promise<{ logo: string }> {
  if (!logoUploadEnabled()) throw new ApiError('SERVICE_UNAVAILABLE', 'Logo yükleme şu anda kullanılamıyor.', { retryable: false });
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Görsel çok büyük (en fazla 4 MB).');
  const processed = await processFeedbackPhoto(Buffer.from(await file.arrayBuffer()));
  if (!processed) throw new ApiError('VALIDATION', 'Yalnız JPEG, PNG, WebP ya da HEIC görsel yüklenebilir.');
  const safe = dealerId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'dealer';
  const key = `${LOGO_KEY_PREFIX}${safe}/${randomBytes(18).toString('base64url')}.jpg`;
  const url = await uploadToR2(key, processed.buffer, 'image/jpeg', 'inline');

  const previous = await prisma.$transaction(async (tx) => {
    await lockResource(tx, `logo:${dealerId}`);
    const before = await tx.user.findUnique({ where: { id: dealerId }, select: { businessLogo: true } });
    await tx.user.update({ where: { id: dealerId }, data: { businessLogo: url }, select: { id: true } });
    await tx.auditLog.create({
      data: {
        userId: dealerId,
        action: 'UPDATE_BUSINESS_PROFILE',
        entity: 'User',
        entityId: dealerId,
        newData: { fields: ['businessLogo'] } as Prisma.InputJsonObject,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
    return before?.businessLogo ?? null;
  });
  const oldKey = ownLogoKey(previous, dealerId);
  if (oldKey) await deleteFromR2(oldKey).catch(() => undefined);
  return { logo: url };
}

export async function removeDealerLogo(dealerId: string, meta: AuditMeta = {}): Promise<void> {
  const previous = await prisma.$transaction(async (tx) => {
    await lockResource(tx, `logo:${dealerId}`);
    const before = await tx.user.findUnique({ where: { id: dealerId }, select: { businessLogo: true } });
    if (!before?.businessLogo) return null;
    await tx.user.update({ where: { id: dealerId }, data: { businessLogo: null }, select: { id: true } });
    await tx.auditLog.create({
      data: {
        userId: dealerId,
        action: 'UPDATE_BUSINESS_PROFILE',
        entity: 'User',
        entityId: dealerId,
        newData: { fields: ['businessLogo'], removed: true } as Prisma.InputJsonObject,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
    return before.businessLogo;
  });
  const oldKey = ownLogoKey(previous, dealerId);
  if (oldKey) await deleteFromR2(oldKey).catch(() => undefined);
}

// ───────────────────────────── Hesabım ─────────────────────────────

const PRESET_AVATARS: ReadonlySet<string> = new Set(defaultAvatars);

/** Bayi `image` olarak yalnız hazır avatar, zaten kayıtlı görsel ya da boş (baş harf) yazabilir (B13). */
export function isAllowedDealerAvatar(image: string | null, current: string | null | undefined): boolean {
  if (image === null) return true;
  if (PRESET_AVATARS.has(image)) return true;
  return !!current && image === current;
}

const ACCOUNT_FIELDS = ['name', 'phone', 'image', 'preferredLanguage'] as const;

export interface AccountPatchParsed extends Omit<AccountPatch, 'baseVersion'> {
  baseVersion: string;
}

export async function updateDealerAccount(
  userId: string,
  patch: AccountPatchParsed,
  meta: AuditMeta = {}
): Promise<{ version: string; changed: string[]; name: string; image: string | null; preferredLanguage: 'tr' | 'en' }> {
  return prisma.$transaction(async (tx) => {
    await lockResource(tx, `profile:${userId}`);
    const current = await tx.user.findUnique({ where: { id: userId }, select: ACCOUNT_VERSION_SELECT });
    if (!current) throw new ApiError('NOT_FOUND', 'Hesap bulunamadı.');
    const currentVersion = accountVersionOf(current as unknown as Record<string, unknown>);
    if (currentVersion !== patch.baseVersion) throw conflict(currentVersion);

    if (patch.image !== undefined && !isAllowedDealerAvatar(patch.image ?? null, current.image)) {
      throw new ApiError('VALIDATION', 'Bu görsel seçilemez. Listeden bir avatar seçin.', {
        details: [{ path: 'image', message: 'Listeden bir avatar seçin.' }],
      });
    }

    const data: Record<string, unknown> = {};
    for (const key of ACCOUNT_FIELDS) {
      const value = (patch as unknown as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (!same(value, (current as Record<string, unknown>)[key])) data[key] = value;
    }
    const changed = Object.keys(data);
    const next = changed.length
      ? await tx.user.update({ where: { id: userId }, data, select: ACCOUNT_VERSION_SELECT })
      : current;
    if (changed.length) {
      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE_ACCOUNT',
          entity: 'User',
          entityId: userId,
          newData: { fields: changed } as Prisma.InputJsonObject,
          ipAddress: meta.ipAddress ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });
    }
    return {
      version: accountVersionOf(next as unknown as Record<string, unknown>),
      changed,
      name: next.name ?? '',
      image: next.image ?? null,
      preferredLanguage: next.preferredLanguage === 'en' ? 'en' : 'tr',
    };
  });
}

// ───────────────────────────── AI ─────────────────────────────

const AI_FIELDS = ['isEnabled', 'autoAnalyze', 'alertOnToxic', 'alertOnUrgent', 'alertOnChurnRisk', 'weeklyReportEnabled', 'customPrompt'] as const;

export type AiPatchParsed = { [K in (typeof AI_FIELDS)[number]]?: K extends 'customPrompt' ? string | null : boolean } & {
  baseVersion: string;
};

/**
 * AI politikası yazımı (tek kaynak `AISettings`; okuyucu `lib/ai-policy`). Ana anahtar
 * alt ayarları SIFIRLAMAZ (B9): yalnız etkisiz kılar, açılınca bayinin yapılandırması geri gelir.
 * İşletme bağlamı enjeksiyon desenine karşı reddedilir (B2); politika önbelleği hemen bayatlatılır.
 */
export async function updateDealerAiSettings(dealerId: string, patch: AiPatchParsed, meta: AuditMeta = {}): Promise<AiSettingsView> {
  if (typeof patch.customPrompt === 'string' && detectPromptInjection(patch.customPrompt)) {
    throw new ApiError('VALIDATION', 'İşletme bağlamında izin verilmeyen bir ifade var (komut/HTML benzeri).', {
      details: [{ path: 'customPrompt', message: 'Yalnız işletmenizi anlatan düz metin yazın; talimat, kod ya da bağlantı eklemeyin.' }],
    });
  }

  const view = await prisma.$transaction(async (tx) => {
    await lockResource(tx, `ai-settings:${dealerId}`);
    const current = await tx.aISettings.findUnique({ where: { dealerId }, select: AI_SETTINGS_SELECT });
    const currentVersion = current ? versionFromDate(current.updatedAt) : NO_VERSION;
    if (currentVersion !== patch.baseVersion) throw conflict(currentVersion);

    const before = current ?? { ...AI_DEFAULTS };
    const data: Record<string, unknown> = {};
    for (const key of AI_FIELDS) {
      const value = patch[key];
      if (value === undefined) continue;
      if (!same(value, (before as Record<string, unknown>)[key])) data[key] = value;
    }
    const changed = Object.keys(data);
    if (changed.length === 0 && current) return toAiView(current);

    const row = current
      ? await tx.aISettings.update({
          where: { dealerId },
          data: { ...data, updatedAt: nextUpdatedAt(current.updatedAt) },
          select: AI_SETTINGS_SELECT,
        })
      : await tx.aISettings.create({
          data: { dealerId, analysisLanguage: 'tr', ...AI_DEFAULTS, ...data },
          select: AI_SETTINGS_SELECT,
        });

    if (changed.length) {
      const oldData: Record<string, unknown> = {};
      const newData: Record<string, unknown> = {};
      for (const k of changed) {
        // Serbest metnin kendisi değil uzunluğu denetime yazılır (gereksiz kişisel/ticari veri tutulmaz).
        oldData[k] = k === 'customPrompt' ? ((before as Record<string, unknown>)[k] as string | null)?.length ?? 0 : (before as Record<string, unknown>)[k];
        newData[k] = k === 'customPrompt' ? ((data[k] as string | null)?.length ?? 0) : data[k];
      }
      await tx.auditLog.create({
        data: {
          userId: dealerId,
          action: 'UPDATE_AI_SETTINGS',
          entity: 'AISettings',
          entityId: dealerId,
          oldData: oldData as Prisma.InputJsonObject,
          newData: newData as Prisma.InputJsonObject,
          ipAddress: meta.ipAddress ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });
    }
    return toAiView(row);
  });

  invalidateDealerAiPolicy(dealerId);
  return view;
}

export type { AiPatch };

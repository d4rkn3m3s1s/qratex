/**
 * QR kodlar ve şubeler — sunucu YAZMA katmanı (BFF uçları çağırır; kapsam `dealerId`).
 *
 * Değişmezler:
 *  - Silme YOK (C1): "kaldır" = arşiv. Yorumlar, AI analizleri, telafiler korunur.
 *  - Kota (D5): canlı kod = iptal ve arşiv dışı. Oluşturma / iptali geri alma / arşivden geri
 *    alma canlı sayıyı artırır → bayi kilidi altında kota kontrolü; rotate kota-nötr (aynı
 *    transaction'da 1 oluştur + 1 iptal); iptal ve arşiv kota boşaltır.
 *  - Şube kotası: etkin şube sayısı plan `maxBranches`'ı aşamaz (oluşturma + geri alma).
 *  - Her yazım denetim kaydı (AuditLog) bırakır.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { generateQRCode } from '@/lib/utils';
import { getDealerPlanLimits } from '@/lib/plan-limits';
import { checkLiveQrQuota, lockDealerQrQuota } from '@/lib/qr-quota';
import {
  istanbulDayEnd,
  segmentConfigFromLinks,
  seriesNames,
  type LocationCreateInput,
  type QrCreateInput,
  type QrLifecycleAction,
  type QrUpdateInput,
} from './rules';

type Tx = Prisma.TransactionClient;

export interface ActorInfo {
  dealerId: string;
  actorId: string;
}

async function audit(tx: Tx, actor: ActorInfo, action: string, entity: string, entityId: string, data: Record<string, unknown>) {
  await tx.auditLog.create({
    data: {
      userId: actor.actorId,
      actorType: 'user',
      action,
      entity,
      entityId,
      newData: data as Prisma.InputJsonValue,
    },
  });
}

function quotaError(v: { live: number; limit: number | null; planName: string }, delta: number): ApiError {
  return new ApiError(
    'PLAN_LIMIT_REACHED',
    `"${v.planName}" planınızda en fazla ${v.limit} etkin QR kodu olabilir (şu an ${v.live}${delta > 1 ? `, istenen ${delta}` : ''}). Kullanılmayan bir kodu arşivleyin ya da planınızı yükseltin.`,
    { status: 402, details: { quota: { used: v.live, limit: v.limit, planName: v.planName } } }
  );
}

async function ensureQuota(tx: Tx, dealerId: string, delta: number) {
  await lockDealerQrQuota(tx, dealerId);
  const v = await checkLiveQrQuota(tx, dealerId, delta);
  if (!v.allowed) throw quotaError(v, delta);
}

async function assertLocation(tx: Tx, dealerId: string, locationId: string | null | undefined) {
  if (!locationId) return;
  const loc = await tx.dealerLocation.findFirst({ where: { id: locationId, dealerId }, select: { isActive: true } });
  if (!loc) throw new ApiError('VALIDATION', 'Şube bulunamadı.', { details: [{ path: 'locationId', message: 'Şube bulunamadı' }] });
  if (!loc.isActive) {
    throw new ApiError('VALIDATION', 'Arşivlenmiş şubeye kod bağlanamaz.', {
      details: [{ path: 'locationId', message: 'Arşivlenmiş şube' }],
    });
  }
}

async function uniqueCodes(n: number): Promise<string[]> {
  const out = new Set<string>();
  for (let attempt = 0; attempt < 6 && out.size < n; attempt++) {
    const batch = Array.from({ length: (n - out.size) * 2 }, () => generateQRCode()).filter((c) => !out.has(c));
    const taken = await prisma.qRCode.findMany({ where: { code: { in: batch } }, select: { code: true } });
    const takenSet = new Set(taken.map((t) => t.code));
    for (const c of batch) if (!takenSet.has(c) && out.size < n) out.add(c);
  }
  if (out.size < n) throw new ApiError('INTERNAL', 'Benzersiz kod üretilemedi, tekrar deneyin.', { retryable: true });
  return Array.from(out);
}

const expiryFrom = (day: string | null | undefined) => (day === undefined ? undefined : day === null ? null : istanbulDayEnd(day));

// ───────────────────────────── Oluştur ─────────────────────────────

export async function createQrCodes(actor: ActorInfo, input: QrCreateInput, now = new Date()) {
  const names = input.mode === 'single' ? [input.name] : seriesNames(input.prefix, input.from, input.to);
  const expiresAt = expiryFrom(input.expiresOn) ?? null;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    throw new ApiError('VALIDATION', 'Son kullanma tarihi bugünden önce olamaz.', {
      details: [{ path: 'expiresOn', message: 'Geçmiş tarih' }],
    });
  }
  const codes = await uniqueCodes(names.length);
  const created = await prisma.$transaction(async (tx) => {
    await ensureQuota(tx, actor.dealerId, names.length);
    await assertLocation(tx, actor.dealerId, input.locationId);
    const rows: Array<{ id: string; code: string; name: string }> = [];
    for (let i = 0; i < names.length; i++) {
      rows.push(
        await tx.qRCode.create({
          data: {
            code: codes[i],
            name: names[i],
            description: input.description ?? null,
            dealerId: actor.dealerId,
            locationId: input.locationId ?? null,
            expiresAt,
          },
          select: { id: true, code: true, name: true },
        })
      );
    }
    await audit(tx, actor, names.length > 1 ? 'CREATE_QR_SERIES' : 'CREATE_QR_CODE', 'QRCode', rows[0].id, {
      ids: rows.map((r) => r.id),
      count: rows.length,
    });
    return rows;
  });
  return { created };
}

// ───────────────────────────── Düzenle ─────────────────────────────

async function ownQr(tx: Tx, dealerId: string, id: string) {
  const qr = await tx.qRCode.findFirst({
    where: { id, dealerId },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isActive: true,
      expiresAt: true,
      revokedAt: true,
      archivedAt: true,
      segmentConfig: true,
      locationId: true,
    },
  });
  if (!qr) throw new ApiError('NOT_FOUND', 'QR kod bulunamadı.');
  return qr;
}

export async function updateQrCode(actor: ActorInfo, id: string, input: QrUpdateInput, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const qr = await ownQr(tx, actor.dealerId, id);
    if (qr.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki kod düzenlenemez. Önce arşivden geri alın.');
    if (input.locationId !== undefined) await assertLocation(tx, actor.dealerId, input.locationId);
    const expiresAt = expiryFrom(input.expiresOn);
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      throw new ApiError('VALIDATION', 'Son kullanma tarihi bugünden önce olamaz.', {
        details: [{ path: 'expiresOn', message: 'Geçmiş tarih' }],
      });
    }
    const data: Prisma.QRCodeUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.locationId !== undefined) data.locationId = input.locationId;
    if (expiresAt !== undefined) data.expiresAt = expiresAt;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.links !== undefined) {
      const cfg = segmentConfigFromLinks(input.links);
      data.segmentConfig = cfg ?? Prisma.DbNull;
    }
    await tx.qRCode.update({ where: { id }, data, select: { id: true } });
    await audit(tx, actor, 'UPDATE_QR_CODE', 'QRCode', id, { fields: Object.keys(data) });
    return { id };
  });
}

// ───────────────────────────── Yaşam döngüsü ─────────────────────────────

export async function qrLifecycle(actor: ActorInfo, id: string, action: QrLifecycleAction, now = new Date()) {
  const newCode = action === 'rotate' ? (await uniqueCodes(1))[0] : null;
  return prisma.$transaction(async (tx) => {
    // Kota kilidi her yaşam döngüsü işleminde önce alınır → eşzamanlı işlemler sıraya girer.
    await lockDealerQrQuota(tx, actor.dealerId);
    const qr = await ownQr(tx, actor.dealerId, id);
    switch (action) {
      case 'revoke': {
        if (qr.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki kod iptal edilemez.');
        if (qr.revokedAt) return { id, action, changed: false };
        await tx.qRCode.update({ where: { id }, data: { revokedAt: now } });
        await audit(tx, actor, 'REVOKE_QR_CODE', 'QRCode', id, { code: qr.code });
        return { id, action, changed: true };
      }
      case 'unrevoke': {
        if (qr.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki kod için önce arşivden geri alın.');
        if (!qr.revokedAt) return { id, action, changed: false };
        const v = await checkLiveQrQuota(tx, actor.dealerId, 1);
        if (!v.allowed) throw quotaError(v, 1);
        await tx.qRCode.update({ where: { id }, data: { revokedAt: null } });
        await audit(tx, actor, 'UNREVOKE_QR_CODE', 'QRCode', id, { code: qr.code });
        return { id, action, changed: true };
      }
      case 'archive': {
        if (qr.archivedAt) return { id, action, changed: false };
        // Arşivle birlikte konan iptal aynı zaman damgasını taşır → geri alınca o da kalkar
        // (eski /api/qr-codes/[id] geri alma mantığıyla uyumlu).
        await tx.qRCode.update({
          where: { id },
          data: { archivedAt: now, isActive: false, ...(qr.revokedAt ? {} : { revokedAt: now }) },
        });
        await audit(tx, actor, 'ARCHIVE_QR_CODE', 'QRCode', id, { code: qr.code });
        return { id, action, changed: true };
      }
      case 'restore': {
        if (!qr.archivedAt) return { id, action, changed: false };
        const revokedByArchive = qr.revokedAt != null && qr.revokedAt.getTime() === qr.archivedAt.getTime();
        if (revokedByArchive || qr.revokedAt == null) {
          const v = await checkLiveQrQuota(tx, actor.dealerId, 1);
          if (!v.allowed) throw quotaError(v, 1);
        }
        await tx.qRCode.update({
          where: { id },
          data: { archivedAt: null, isActive: true, ...(revokedByArchive ? { revokedAt: null } : {}) },
        });
        await audit(tx, actor, 'RESTORE_QR_CODE', 'QRCode', id, { code: qr.code });
        return { id, action, changed: true };
      }
      case 'rotate': {
        if (qr.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki kod yenilenemez.');
        if (qr.revokedAt) throw new ApiError('CONFLICT', 'İptal edilmiş kod yenilenemez.');
        const created = await tx.qRCode.create({
          data: {
            code: newCode as string,
            name: qr.name,
            description: qr.description,
            dealerId: actor.dealerId,
            isActive: qr.isActive,
            expiresAt: qr.expiresAt,
            locationId: qr.locationId,
            ...(qr.segmentConfig != null ? { segmentConfig: qr.segmentConfig as Prisma.InputJsonValue } : {}),
          },
          select: { id: true, code: true },
        });
        const rev = await tx.qRCode.updateMany({ where: { id, revokedAt: null, archivedAt: null }, data: { revokedAt: now } });
        if (rev.count !== 1) throw new ApiError('CONFLICT', 'Kod eşzamanlı değişti, tekrar deneyin.');
        // Rotate zinciri bu olaydan okunur (load.server rotationLinks).
        await tx.analyticsEvent.create({
          data: {
            userId: actor.actorId,
            event: 'qr_code_rotated',
            category: 'qr',
            data: { oldQrCodeId: id, newQrCodeId: created.id, oldCode: qr.code, newCode: created.code, dealerId: actor.dealerId },
          },
        });
        await audit(tx, actor, 'ROTATE_QR_CODE', 'QRCode', id, { newId: created.id });
        return { id: created.id, action, changed: true, replacedId: id };
      }
    }
  });
}

// ───────────────────────────── Toplu ─────────────────────────────

export async function bulkQr(actor: ActorInfo, action: 'activate' | 'deactivate', ids: string[]) {
  const unique = Array.from(new Set(ids));
  return prisma.$transaction(async (tx) => {
    const res = await tx.qRCode.updateMany({
      where: { id: { in: unique }, dealerId: actor.dealerId, archivedAt: null, revokedAt: null },
      data: { isActive: action === 'activate' },
    });
    await audit(tx, actor, action === 'activate' ? 'BULK_ACTIVATE_QR_CODES' : 'BULK_DEACTIVATE_QR_CODES', 'QRCode', `${res.count} QR`, {
      ids: unique,
      affected: res.count,
    });
    return { count: res.count, skipped: unique.length - res.count };
  });
}

// ───────────────────────────── Şubeler ─────────────────────────────

async function lockBranches(tx: Tx, dealerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`branch-quota:${dealerId}`}))`;
}

async function ensureBranchQuota(tx: Tx, dealerId: string) {
  await lockBranches(tx, dealerId);
  const limits = await getDealerPlanLimits(dealerId);
  if (limits.maxBranches == null) return;
  const used = await tx.dealerLocation.count({ where: { dealerId, isActive: true } });
  if (used + 1 > limits.maxBranches) {
    throw new ApiError(
      'PLAN_LIMIT_REACHED',
      `"${limits.planName}" planınızda en fazla ${limits.maxBranches} etkin şube olabilir. Bir şubeyi arşivleyin ya da planınızı yükseltin.`,
      { status: 402, details: { quota: { used, limit: limits.maxBranches, planName: limits.planName } } }
    );
  }
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

const DUP_NAME = () =>
  new ApiError('VALIDATION', 'Bu adda bir şube zaten var.', { details: [{ path: 'name', message: 'Bu adda bir şube zaten var' }] });

export async function createLocation(actor: ActorInfo, input: LocationCreateInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      await ensureBranchQuota(tx, actor.dealerId);
      const loc = await tx.dealerLocation.create({
        data: { dealerId: actor.dealerId, name: input.name, address: input.address },
        select: { id: true },
      });
      await audit(tx, actor, 'CREATE_LOCATION', 'DealerLocation', loc.id, { name: input.name });
      return loc;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw DUP_NAME();
    throw e;
  }
}

export async function updateLocation(
  actor: ActorInfo,
  id: string,
  input: { action: 'archive' | 'restore' } | { name?: string; address?: string | null }
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const loc = await tx.dealerLocation.findFirst({ where: { id, dealerId: actor.dealerId }, select: { id: true, isActive: true } });
      if (!loc) throw new ApiError('NOT_FOUND', 'Şube bulunamadı.');
      if ('action' in input) {
        if (input.action === 'archive') {
          if (!loc.isActive) return { id, changed: false };
          // Şube silinmez (C1): arşivlenir; bağlı QR'lar şube bağını korur ve çalışmaya devam eder.
          await tx.dealerLocation.update({ where: { id }, data: { isActive: false } });
        } else {
          if (loc.isActive) return { id, changed: false };
          await ensureBranchQuota(tx, actor.dealerId);
          await tx.dealerLocation.update({ where: { id }, data: { isActive: true } });
        }
        await audit(tx, actor, input.action === 'archive' ? 'ARCHIVE_LOCATION' : 'RESTORE_LOCATION', 'DealerLocation', id, {});
        return { id, changed: true };
      }
      const data: Prisma.DealerLocationUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.address !== undefined) data.address = input.address;
      if (Object.keys(data).length === 0) throw new ApiError('VALIDATION', 'Değiştirilecek alan yok.');
      await tx.dealerLocation.update({ where: { id }, data });
      await audit(tx, actor, 'UPDATE_LOCATION', 'DealerLocation', id, { fields: Object.keys(data) });
      return { id, changed: true };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw DUP_NAME();
    throw e;
  }
}

/**
 * adjustPointsByAdmin — admin'in manuel puan düzeltmesinin TEK yolu (P0-19).
 *
 * Önceki durum: `app/api/admin/users/route.ts` ham `points: { increment }` yapıyordu —
 * sınırsız, ondalık, eksi bakiyeye izin veren, `points_credited`'sız ve transaction'sız.
 *
 * Kurallar (hepsi aynı transaction içinde):
 *   - Aktör veritabanında ADMIN olmalı (JWT'ye güvenilmez); kendi bakiyesini düzeltemez.
 *   - Gerekçe zorunlu (5–500 karakter).
 *   - |delta| ≤ 100.000 (tek işlem); aynı kullanıcıya günlük pozitif toplam ≤ 200.000.
 *   - |delta| > 10.000 → ikinci, FARKLI bir ADMIN'in onayı zorunlu: onaylayan kimliği
 *     istemciden ALINMAZ; ikinci admin kendi oturumuyla imzalı, tek kullanımlık bir
 *     onay belirteci üretir (admin-approval.ts). Belirteç kullanıcı+miktara bağlıdır.
 *   - Pozitif → mintPoints (ledger + points_credited{admin_adjust}); negatif → debitPoints
 *     (bakiye eksiye düşemez → InsufficientPointsError).
 *   - AuditLog: aktör snapshot'ı, önceki/sonraki bakiye, gerekçe, defter satırı.
 */
import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';
import { startOfDayUTC } from '@/lib/timezone';
import { debitPoints } from '@/lib/points-wallet';
import { ADMIN_ADJUST_LIMITS, MAX_SINGLE_XP } from './caps';
import { EconomyError } from './errors';
import { verifyAdjustApproval } from './admin-approval';
import { lockUserForUpdate, mintPoints, type EconomyDb, type EconomyTx } from './mint';

export interface AdminAdjustInput {
  adminId: string;
  userId: string;
  /** + ekle / − düş. Tam sayı, sıfır olamaz (xp verilmediyse). */
  delta: number;
  /** Opsiyonel XP ekleme (yalnız pozitif). */
  xp?: number;
  reason: string;
  /**
   * |delta| eşiğin üstündeyse zorunlu: ikinci adminin KENDİ oturumuyla aldığı imzalı onay
   * belirteci (`issueAdjustApproval`). Onaylayan kimliği yalnız belirteçten okunur.
   */
  approvalToken?: string | null;
  /** Tekrar gönderimde çift düzeltmeyi önler (ör. istemci tarafı istek id'si). */
  idempotencyKey?: string | null;
  auditMeta?: { ipAddress?: string | null; userAgent?: string | null };
  now?: Date;
}

export interface AdminAdjustResult {
  delta: number;
  xpDelta: number;
  pointsBefore: number;
  points: number;
  xp: number;
  level: number;
  isLevelUp: boolean;
  ledgerId: string | null;
  duplicate: boolean;
}

function isRootClient(db: EconomyDb): db is typeof prisma {
  return typeof (db as { $transaction?: unknown }).$transaction === 'function';
}

function validate(input: AdminAdjustInput) {
  if (!input?.adminId || !input.userId) {
    throw new EconomyError('INVALID_INPUT', 'Admin ve kullanıcı belirtilmeli.');
  }
  if (typeof input.delta !== 'number' || !Number.isInteger(input.delta)) {
    throw new EconomyError('INVALID_AMOUNT', 'Puan miktarı tam sayı olmalı.');
  }
  const xp = input.xp ?? 0;
  if (typeof xp !== 'number' || !Number.isInteger(xp) || xp < 0 || xp > MAX_SINGLE_XP) {
    throw new EconomyError('INVALID_AMOUNT', 'XP miktarı 0 ile 100.000 arasında bir tam sayı olmalı.');
  }
  if (input.delta === 0 && xp === 0) {
    throw new EconomyError('INVALID_AMOUNT', 'Düzeltme miktarı sıfır olamaz.');
  }
  if (Math.abs(input.delta) > ADMIN_ADJUST_LIMITS.perOperation) {
    throw new EconomyError('CAP_EXCEEDED', 'Tek işlemde en fazla 100.000 puan düzeltilebilir.', {
      max: ADMIN_ADJUST_LIMITS.perOperation,
    });
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < ADMIN_ADJUST_LIMITS.reasonMin) {
    throw new EconomyError('REASON_REQUIRED', 'Puan düzeltmesi için en az 5 karakterlik bir gerekçe yazın.');
  }
  if (input.adminId === input.userId) {
    throw new EconomyError('SELF_ADJUST_FORBIDDEN', 'Kendi puan bakiyenizi düzeltemezsiniz.');
  }
  const needsSecond =
    Math.abs(input.delta) > ADMIN_ADJUST_LIMITS.secondApprovalAbove ||
    xp > ADMIN_ADJUST_LIMITS.secondApprovalAbove;
  let approval: { approverId: string; nonce: string } | null = null;
  if (needsSecond) {
    if (!input.approvalToken) {
      throw new EconomyError(
        'SECOND_APPROVAL_REQUIRED',
        '10.000 puanın üzerindeki düzeltmeler ikinci bir yöneticinin onayını gerektirir.',
        { threshold: ADMIN_ADJUST_LIMITS.secondApprovalAbove }
      );
    }
    const c = verifyAdjustApproval(input.approvalToken, {
      requesterId: input.adminId,
      userId: input.userId,
      delta: input.delta,
      xp,
      now: input.now,
    });
    approval = { approverId: c.approverId, nonce: c.nonce };
  }
  return { xp, reason: reason.slice(0, ADMIN_ADJUST_LIMITS.reasonMax), needsSecond, approval };
}

async function adjustInTx(
  tx: EconomyTx,
  input: AdminAdjustInput,
  v: ReturnType<typeof validate>
): Promise<AdminAdjustResult> {
  // Yetki DB'den (JWT bayat olabilir). İkinci onaylayan da gerçek ADMIN olmalı.
  // Onay kullanıldıysa defter anahtarı belirtece bağlanır → aynı onay ikinci kez kredi üretmez.
  if (v.approval) input = { ...input, idempotencyKey: `admin-approval:${v.approval.nonce}` };
  const approverId = v.approval?.approverId ?? null;
  const ids = approverId ? [input.adminId, approverId] : [input.adminId];
  const actors = await tx.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true, email: true, name: true },
  });
  const admin = actors.find((a) => a.id === input.adminId);
  if (!admin || admin.role !== 'ADMIN') {
    throw new EconomyError('FORBIDDEN', 'Bu işlem için yönetici yetkisi gerekir.');
  }
  if (v.needsSecond) {
    const approver = actors.find((a) => a.id === approverId);
    if (!approver || approver.role !== 'ADMIN') {
      throw new EconomyError('SECOND_APPROVAL_REQUIRED', 'İkinci onaylayan kişi yönetici olmalı.');
    }
  }

  // Hedef kullanıcıyı kilitle: önceki bakiye ve günlük toplam okuması yarışsız olsun.
  await lockUserForUpdate(tx, input.userId);

  if (input.idempotencyKey) {
    const existing = await tx.pointsLedger.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, userId: true, delta: true, xpDelta: true, source: true },
    });
    if (existing) {
      if (existing.userId !== input.userId || existing.source !== 'admin_adjust') {
        throw new EconomyError('IDEMPOTENCY_CONFLICT', 'Bu işlem anahtarı başka bir işleme ait.');
      }
      const w = await tx.user.findUnique({
        where: { id: input.userId },
        select: { points: true, xp: true, level: true },
      });
      if (!w) throw new EconomyError('USER_NOT_FOUND', 'Kullanıcı bulunamadı.');
      return {
        delta: existing.delta,
        xpDelta: existing.xpDelta,
        pointsBefore: w.points - existing.delta,
        points: w.points,
        xp: w.xp,
        level: w.level,
        isLevelUp: false,
        ledgerId: existing.id,
        duplicate: true,
      };
    }
  }

  const before = await tx.user.findUnique({
    where: { id: input.userId },
    select: { points: true, xp: true, level: true },
  });
  if (!before) throw new EconomyError('USER_NOT_FOUND', 'Kullanıcı bulunamadı.');

  if (input.delta > 0) {
    const agg = await tx.pointsLedger.aggregate({
      where: {
        userId: input.userId,
        source: 'admin_adjust',
        delta: { gt: 0 },
        createdAt: { gte: startOfDayUTC(input.now ?? new Date()) },
      },
      _sum: { delta: true },
    });
    const today = agg._sum.delta ?? 0;
    if (today + input.delta > ADMIN_ADJUST_LIMITS.dailyPerUser) {
      throw new EconomyError(
        'CAP_EXCEEDED',
        'Bu kullanıcıya bugün verilebilecek manuel puan sınırı (200.000) aşılıyor.',
        { today, max: ADMIN_ADJUST_LIMITS.dailyPerUser }
      );
    }
  }

  const meta = {
    secondApproverId: approverId,
  };

  let points = before.points;
  let xp = before.xp;
  let level = before.level;
  let isLevelUp = false;
  let ledgerId: string | null = null;

  if (input.delta > 0 || v.xp > 0) {
    const minted = await mintPoints(tx, {
      userId: input.userId,
      points: Math.max(0, input.delta),
      xp: v.xp,
      source: 'admin_adjust',
      // Pozitif ile negatif aynı istekte olamaz; anahtar tek satıra bağlanır.
      idempotencyKey: input.delta < 0 ? null : input.idempotencyKey ?? null,
      actorId: input.adminId,
      reason: v.reason,
      meta,
      capCategory: null, // tavanı yukarıda admin kuralları uyguladı
      fraudGate: false, // bilinçli admin kararı; gölge ban kapısı burada uygulanmaz
      now: input.now,
    });
    points = minted.points;
    xp = minted.xp;
    level = minted.level;
    isLevelUp = minted.isLevelUp;
    ledgerId = minted.ledgerId;
  }

  if (input.delta < 0) {
    const debited = await debitPoints(tx, {
      userId: input.userId,
      points: -input.delta,
      source: 'admin_adjust',
      idempotencyKey: input.idempotencyKey ?? null,
      actorId: input.adminId,
      reason: v.reason,
      meta,
    });
    points = debited.points;
    xp = debited.xp;
    level = debited.level;
    ledgerId = debited.ledgerId ?? ledgerId;
  }

  await tx.auditLog.create({
    data: {
      userId: input.adminId,
      actorType: 'user',
      actorSnapshot: { email: admin.email, role: admin.role, name: admin.name ?? null },
      action: 'ADMIN_POINTS_ADJUST',
      entity: 'User',
      entityId: input.userId,
      oldData: { points: before.points, xp: before.xp, level: before.level },
      newData: {
        delta: input.delta,
        xp: v.xp,
        points,
        reason: v.reason,
        ledgerId,
        secondApproverId: meta.secondApproverId,
      } as Prisma.InputJsonObject,
      ipAddress: input.auditMeta?.ipAddress ?? null,
      userAgent: input.auditMeta?.userAgent ?? null,
    },
  });

  return {
    delta: input.delta,
    xpDelta: v.xp,
    pointsBefore: before.points,
    points,
    xp,
    level,
    isLevelUp,
    ledgerId,
    duplicate: false,
  };
}

export async function adjustPointsByAdmin(db: EconomyDb, input: AdminAdjustInput): Promise<AdminAdjustResult> {
  const v = validate(input);
  if (isRootClient(db)) {
    return db.$transaction((tx) => adjustInTx(tx, input, v));
  }
  return adjustInTx(db, input, v);
}

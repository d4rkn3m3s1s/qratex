/**
 * Kullanıcı 360 yazma işlemleri (sunucu otoriter; her biri denetim izi yazar).
 *
 * Kapanan bulgular (docs/audit/2026-10-08/admin/admin_users.md):
 *  - B3  puan/XP yalnız `adjustPointsByAdmin` (gerekçe kodu + açıklama, tavan, eşik üstü dört göz)
 *  - B4  "Seviye Ayarla" kaldırıldı; seviye XP'den türer (XP yalnız defterden eklenir)
 *  - B5  rol değişimi: kendine yok, son yönetici korunur, ADMIN'e yükseltme dört göz,
 *        STAFF yalnız bayi davetiyle, oturumlar `sessionVersion` ile anında düşer
 *  - B13 ödül verme: etkin/arşivsiz + koşullu stok düşümü + denetim; rozet geri alma denetimli
 *  - B2  silme yok: askıya alma (geri alınabilir) ve KVKK anonimleştirmesi (etki önizlemeli)
 */
import { revokeNativePushTokens } from '@/lib/push-native-revoke';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { adjustPointsByAdmin, isEconomyError } from '@/lib/economy';
import { InsufficientPointsError } from '@/lib/points-wallet';
import { awardBadgeInTx, AWARD_BADGE_REJECT_MESSAGES } from '@/lib/badges/award';
import { invalidateSessionState } from '@/lib/auth/session-state';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { previewUserErasure } from '@/lib/data-safety/user-erasure';
import { anonymizeUser } from '@/lib/gdpr-core';
import { takePoolCode } from '@/lib/admin-store/code-pool';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  REASON_CODE_LABELS,
  type AdjustPointsInput,
  type AssignableRole,
  type ProfilePatch,
} from './contract';
import { ELEVATION_REQUEST_ACTION, findPendingElevation } from './detail.server';

type Req = { headers: { get(name: string): string | null } } | null;

export interface ActionCtx {
  actor: AuditActor & { id: string };
  request: Req;
}

const TARGET_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  suspendedAt: true,
  anonymizedAt: true,
} as const;

async function loadTarget(userId: string) {
  const t = await prisma.user.findUnique({ where: { id: userId }, select: TARGET_SELECT });
  if (!t) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
  return { ...t, role: String(t.role) };
}

function assertNotAnonymized(t: { anonymizedAt: Date | null }) {
  if (t.anonymizedAt) throw new ApiError('CONFLICT', 'Bu hesap anonimleştirilmiş; üzerinde işlem yapılamaz.', { status: 409 });
}

/** Yetki DB'den: aktör gerçekten (askıda olmayan) ADMIN mi? */
async function assertActorIsAdmin(actorId: string) {
  const a = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true, suspendedAt: true, anonymizedAt: true } });
  if (!a || String(a.role) !== 'ADMIN' || a.suspendedAt || a.anonymizedAt) {
    throw new ApiError('FORBIDDEN', 'Bu işlem için yönetici yetkisi gerekir.');
  }
}

async function dropSessions(userId: string) {
  await invalidateSessionState(userId).catch(() => undefined);
  await revokeNativePushTokens(userId);
}

// ───────────────────────────── Puan / XP ─────────────────────────────

export async function adjustPoints(ctx: ActionCtx, userId: string, input: AdjustPointsInput) {
  const target = await loadTarget(userId);
  assertNotAnonymized(target);
  const reason = `${REASON_CODE_LABELS[input.reasonCode]}: ${input.note}`;
  let res;
  try {
    res = await adjustPointsByAdmin(prisma, {
      adminId: ctx.actor.id,
      userId,
      delta: input.delta,
      xp: input.xp,
      reason,
      approvalToken: input.approvalToken || null,
      idempotencyKey: input.requestId ? `admin-adjust:${ctx.actor.id}:${input.requestId}` : null,
      auditMeta: ctx.request ? getAuditRequestMeta(ctx.request) : undefined,
    });
  } catch (err) {
    if (err instanceof InsufficientPointsError) {
      throw new ApiError(
        'INSUFFICIENT_POINTS',
        `Kullanıcının bakiyesi yetersiz: mevcut ${err.currentPoints.toLocaleString('tr-TR')} puan, düşülmek istenen ${err.requiredPoints.toLocaleString('tr-TR')} puan.`,
        { details: { currentPoints: err.currentPoints } }
      );
    }
    if (isEconomyError(err)) {
      throw new ApiError(err.code, err.message, { status: err.httpStatus, details: err.details });
    }
    throw err;
  }

  if (!res.duplicate) {
    const parts: string[] = [];
    if (res.delta > 0) parts.push(`${res.delta.toLocaleString('tr-TR')} puan hesabınıza eklendi`);
    if (res.delta < 0) parts.push(`${Math.abs(res.delta).toLocaleString('tr-TR')} puan hesabınızdan düşüldü`);
    if (res.xpDelta > 0) parts.push(`${res.xpDelta.toLocaleString('tr-TR')} XP eklendi`);
    await prisma.notification
      .create({
        data: {
          userId,
          title: res.delta < 0 ? 'Puan düzeltmesi' : 'Hesabınıza ekleme yapıldı',
          message: `${parts.join(', ')}. Gerekçe: ${reason}`.slice(0, 500),
          type: res.delta < 0 ? 'warning' : 'success',
        },
      })
      .catch((e: unknown) => console.error('[admin-users] puan bildirimi yazılamadı', e));
  }
  return res;
}

// ───────────────────────────── Rol ─────────────────────────────

export interface RoleChangeResult {
  status: 'changed' | 'pending_approval';
  role: string;
  requestId?: string;
}

/** Saf kural denetimi (test edilebilir). */
export function checkRoleChange(input: {
  actorId: string;
  target: { id: string; role: string; anonymizedAt: Date | null };
  newRole: AssignableRole;
  activeAdminCount: number;
}): void {
  const { actorId, target, newRole, activeAdminCount } = input;
  if (target.anonymizedAt) throw new ApiError('CONFLICT', 'Anonimleştirilmiş hesabın rolü değiştirilemez.', { status: 409 });
  if (target.id === actorId) throw new ApiError('FORBIDDEN', 'Kendi rolünüzü değiştiremezsiniz.');
  if (target.role === newRole) throw new ApiError('CONFLICT', 'Kullanıcı zaten bu rolde.', { status: 409 });
  if (target.role === 'ADMIN' && activeAdminCount <= 1) {
    throw new ApiError('CONFLICT', 'Platformdaki son etkin yönetici düşürülemez.', { status: 409 });
  }
}

async function applyRole(ctx: ActionCtx, target: { id: string; role: string }, newRole: AssignableRole, extra: Record<string, unknown>) {
  await prisma.$transaction(async (tx) => {
    const w = await tx.user.updateMany({
      where: { id: target.id, role: target.role as never, anonymizedAt: null },
      data: { role: newRole, sessionVersion: { increment: 1 } },
    });
    if (w.count !== 1) throw new ApiError('CONFLICT', 'Kullanıcının rolü bu arada değişti; sayfayı yenileyin.', { status: 409 });
    // STAFF'tan çıkan hesabın personel kaydı silinmez, pasifleşir (bayi panelinde geçmiş korunur).
    if (target.role === 'STAFF') {
      await tx.dealerStaff.updateMany({ where: { userId: target.id }, data: { isActive: false } });
    }
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: 'USER_ROLE_CHANGE', entity: 'User', entityId: target.id, oldData: { role: target.role }, newData: { role: newRole, ...extra } },
        ctx.request
      ),
    });
  });
  await dropSessions(target.id);
}

export async function changeRole(
  ctx: ActionCtx,
  userId: string,
  input: { role: AssignableRole; reason: string; confirmPhrase?: string }
): Promise<RoleChangeResult> {
  await assertActorIsAdmin(ctx.actor.id);
  const target = await loadTarget(userId);
  const activeAdminCount = await prisma.user.count({ where: { role: 'ADMIN', suspendedAt: null, anonymizedAt: null } });
  checkRoleChange({ actorId: ctx.actor.id, target, newRole: input.role, activeAdminCount });

  if (input.role === 'ADMIN') {
    if ((input.confirmPhrase ?? '').trim().toLowerCase() !== target.email.toLowerCase()) {
      throw new ApiError('VALIDATION', 'Yönetici yetkisi için kullanıcının e-posta adresini yazarak onaylayın.', {
        details: [{ path: 'confirmPhrase', message: 'E-posta eşleşmiyor' }],
      });
    }
    if (target.suspendedAt) throw new ApiError('CONFLICT', 'Askıdaki hesap yönetici yapılamaz.', { status: 409 });
    const pending = await findPendingElevation(userId);
    if (pending) {
      throw new ApiError('CONFLICT', 'Bu kullanıcı için zaten bekleyen bir yönetici yükseltme talebi var.', { status: 409 });
    }
    const req = await prisma.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: ELEVATION_REQUEST_ACTION, entity: 'User', entityId: userId, oldData: { role: target.role }, newData: { role: 'ADMIN', reason: input.reason } },
        ctx.request
      ),
      select: { id: true },
    });
    return { status: 'pending_approval', role: target.role, requestId: req.id };
  }

  await applyRole(ctx, target, input.role, { reason: input.reason });
  return { status: 'changed', role: input.role };
}

/** Dört göz: talep eden dışındaki bir yönetici yükseltmeyi onaylar ya da herhangi bir yönetici reddeder. */
export async function decideElevation(
  ctx: ActionCtx,
  userId: string,
  input: { requestId: string; decision: 'approve' | 'reject'; note?: string }
): Promise<RoleChangeResult> {
  await assertActorIsAdmin(ctx.actor.id);
  const pending = await findPendingElevation(userId);
  if (!pending || pending.requestId !== input.requestId) {
    throw new ApiError('NOT_FOUND', 'Bekleyen yükseltme talebi bulunamadı ya da süresi doldu.');
  }
  const target = await loadTarget(userId);
  if (input.decision === 'reject') {
    await prisma.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: 'ROLE_ELEVATION_REJECTED', entity: 'User', entityId: userId, newData: { requestId: pending.requestId, note: input.note ?? null } },
        ctx.request
      ),
    });
    return { status: 'changed', role: target.role };
  }
  if (pending.requesterId === ctx.actor.id) {
    throw new ApiError('FORBIDDEN', 'Talebi açan yönetici kendi talebini onaylayamaz; başka bir yöneticinin onayı gerekir.');
  }
  if (target.id === ctx.actor.id) throw new ApiError('FORBIDDEN', 'Kendi yükseltmenizi onaylayamazsınız.');
  if (target.suspendedAt) throw new ApiError('CONFLICT', 'Askıdaki hesap yönetici yapılamaz.', { status: 409 });
  const activeAdminCount = await prisma.user.count({ where: { role: 'ADMIN', suspendedAt: null, anonymizedAt: null } });
  checkRoleChange({ actorId: ctx.actor.id, target, newRole: 'ADMIN', activeAdminCount });
  await applyRole(ctx, target, 'ADMIN', { requestId: pending.requestId, requesterId: pending.requesterId, secondApproverId: ctx.actor.id });
  await prisma.auditLog.create({
    data: auditEntry(
      ctx.actor,
      { action: 'ROLE_ELEVATION_APPROVED', entity: 'User', entityId: userId, newData: { requestId: pending.requestId, note: input.note ?? null } },
      ctx.request
    ),
  });
  return { status: 'changed', role: 'ADMIN' };
}

// ───────────────────────────── Askıya alma / oturum ─────────────────────────────

export async function setSuspension(ctx: ActionCtx, userId: string, input: { action: 'suspend' | 'unsuspend'; reason?: string }) {
  const target = await loadTarget(userId);
  assertNotAnonymized(target);
  if (target.id === ctx.actor.id) throw new ApiError('FORBIDDEN', 'Kendi hesabınızı askıya alamazsınız.');
  const suspend = input.action === 'suspend';
  if (suspend && target.role === 'ADMIN') {
    throw new ApiError('CONFLICT', 'Yönetici hesapları askıya alınamaz; önce rolü değiştirin.', { status: 409 });
  }
  const now = new Date();
  const changed = await prisma.$transaction(async (tx) => {
    const w = suspend
      ? await tx.user.updateMany({
          where: { id: userId, suspendedAt: null, anonymizedAt: null, role: { not: 'ADMIN' } },
          data: { suspendedAt: now, suspendedReason: input.reason ?? null, sessionVersion: { increment: 1 } },
        })
      : await tx.user.updateMany({
          where: { id: userId, suspendedAt: { not: null }, anonymizedAt: null },
          data: { suspendedAt: null, suspendedReason: null },
        });
    if (w.count === 0) return false;
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        {
          action: suspend ? 'USER_SUSPEND' : 'USER_UNSUSPEND',
          entity: 'User',
          entityId: userId,
          oldData: { suspendedAt: target.suspendedAt },
          newData: { reason: input.reason ?? null },
        },
        ctx.request
      ),
    });
    return true;
  });
  if (!changed) {
    throw new ApiError('CONFLICT', suspend ? 'Hesap zaten askıda.' : 'Hesap askıda değil.', { status: 409 });
  }
  await dropSessions(userId);
  return { suspended: suspend };
}

export async function revokeSessions(ctx: ActionCtx, userId: string) {
  const target = await loadTarget(userId);
  assertNotAnonymized(target);
  if (target.id === ctx.actor.id) {
    throw new ApiError('FORBIDDEN', 'Kendi oturumlarınızı hesap ayarlarınızdan kapatın.');
  }
  const row = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
    await tx.auditLog.create({
      data: auditEntry(ctx.actor, { action: 'USER_SESSIONS_REVOKE', entity: 'User', entityId: userId, newData: { sessionVersion: u.sessionVersion } }, ctx.request),
    });
    return u;
  });
  await dropSessions(userId);
  return { sessionVersion: row.sessionVersion, revokedAt: new Date().toISOString() };
}

// ───────────────────────────── Bildirim ─────────────────────────────

export async function sendDirectNotification(ctx: ActionCtx, userId: string, input: { title: string; message: string; type: string }) {
  const target = await loadTarget(userId);
  assertNotAnonymized(target);
  const n = await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({
      data: { userId, title: input.title, message: input.message, type: input.type, data: { kind: 'admin_direct' } },
      select: { id: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: 'USER_DIRECT_NOTIFICATION', entity: 'User', entityId: userId, newData: { notificationId: created.id, title: input.title, type: input.type } },
        ctx.request
      ),
    });
    return created;
  });
  return { id: n.id, createdAt: n.createdAt.toISOString() };
}

// ───────────────────────────── Rozet ─────────────────────────────

export async function grantBadge(ctx: ActionCtx, userId: string, input: { badgeId: string; note?: string }) {
  const target = await loadTarget(userId);
  assertNotAnonymized(target);
  const result = await prisma.$transaction(async (tx) => {
    const award = await awardBadgeInTx(tx, {
      userId,
      badgeId: input.badgeId,
      source: 'admin',
      reward: 'none',
      requireActive: false,
      actorId: ctx.actor.id,
    });
    if (!award.awarded) return award;
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: 'grant_badge', entity: 'user_badge', entityId: award.userBadgeId ?? `${userId}:${input.badgeId}`, newData: { userId, badgeId: input.badgeId, note: input.note ?? null } },
        ctx.request
      ),
    });
    return award;
  });
  if (!result.awarded) {
    if (result.reason === 'ALREADY_OWNED') throw new ApiError('CONFLICT', 'Kullanıcı bu rozete zaten sahip.', { status: 409 });
    throw new ApiError('NOT_FOUND', AWARD_BADGE_REJECT_MESSAGES[result.reason]);
  }
  await prisma.notification
    .create({
      data: {
        userId,
        title: 'Yeni rozet kazandınız',
        message: `"${result.badge.name}" rozeti hesabınıza eklendi.`,
        type: 'success',
        data: { badgeId: input.badgeId },
      },
    })
    .catch((e: unknown) => console.error('[admin-users] rozet bildirimi yazılamadı', e));
  return { badgeId: input.badgeId, name: result.badge.name };
}

export async function revokeBadge(ctx: ActionCtx, userId: string, input: { badgeId: string; reason: string }) {
  const target = await loadTarget(userId);
  assertNotAnonymized(target);
  const removed = await prisma.$transaction(async (tx) => {
    const ub = await tx.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId: input.badgeId } },
      select: { id: true, earnedAt: true, badge: { select: { name: true } } },
    });
    if (!ub) return null;
    await tx.userBadge.delete({ where: { id: ub.id } });
    // Vitrindeki karakter rozeti kaldırıldıysa vitrin boşalır (yetim kimlik kalmaz).
    await tx.user.updateMany({ where: { id: userId, featuredCharacterBadgeId: input.badgeId }, data: { featuredCharacterBadgeId: null } });
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        { action: 'revoke_badge', entity: 'user_badge', entityId: ub.id, oldData: { userId, badgeId: input.badgeId, earnedAt: ub.earnedAt }, newData: { reason: input.reason } },
        ctx.request
      ),
    });
    return ub;
  });
  if (!removed) throw new ApiError('NOT_FOUND', 'Kullanıcı bu rozete sahip değil.');
  await prisma.notification
    .create({
      data: { userId, title: 'Rozet kaldırıldı', message: `"${removed.badge.name}" rozeti hesabınızdan kaldırıldı.`, type: 'warning' },
    })
    .catch((e: unknown) => console.error('[admin-users] rozet bildirimi yazılamadı', e));
  return { badgeId: input.badgeId };
}

// ───────────────────────────── Ödül ─────────────────────────────

export function generateGiftCode(): string {
  return `GIFT-${randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
}

export async function grantReward(ctx: ActionCtx, userId: string, input: { rewardId: string; note?: string }) {
  const target = await loadTarget(userId);
  assertNotAnonymized(target);
  // Puan düzeltmesindeki "kendi bakiyesine dokunamaz" kuralının ödül karşılığı: yönetici
  // kendine (puan karşılığı olan) ödül hediye edemez.
  if (target.id === ctx.actor.id) throw new ApiError('FORBIDDEN', 'Kendinize ödül hediye edemezsiniz.');
  const out = await prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findUnique({
      where: { id: input.rewardId },
      select: { id: true, name: true, type: true, stock: true, isActive: true, archivedAt: true },
    });
    if (!reward) throw new ApiError('NOT_FOUND', 'Ödül bulunamadı.');
    if (!reward.isActive || reward.archivedAt) throw new ApiError('CONFLICT', 'Bu ödül etkin değil ya da arşivlenmiş.', { status: 409 });
    // Koşullu stok düşümü: eşzamanlı iki hediye son stoğu iki kez tüketemez.
    if (reward.stock >= 0) {
      const w = await tx.reward.updateMany({
        where: { id: reward.id, isActive: true, archivedAt: null, stock: { gt: 0 } },
        data: { stock: { decrement: 1 } },
      });
      if (w.count !== 1) throw new ApiError('CONFLICT', 'Ödülün stoğu tükendi.', { status: 409 });
    }
    // Partner kod havuzu açıksa kod havuzdan gelir (satır yukarıdaki koşullu yazımla kilitli):
    // aksi hâlde partnerin tanımadığı sahte GIFT- kodu verilir ve stok havuzdan kopardı.
    const pooled = await takePoolCode(tx, reward.id);
    if (pooled.exhausted) throw new ApiError('CONFLICT', 'Ödülün kod havuzu boş; önce kod ekleyin.', { status: 409 });
    const code = pooled.code ?? (reward.type === 'coupon' ? generateGiftCode() : null);
    const ur = await tx.userReward.create({
      data: { userId, rewardId: reward.id, code },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        {
          action: 'grant_reward',
          entity: 'user_reward',
          entityId: ur.id,
          newData: { userId, rewardId: reward.id, stockBefore: reward.stock, note: input.note ?? null } as Prisma.InputJsonObject,
        },
        ctx.request
      ),
    });
    return { userRewardId: ur.id, rewardName: reward.name, hasCode: !!code };
  });
  await prisma.notification
    .create({
      data: {
        userId,
        title: 'Hediye ödül',
        message: `"${out.rewardName}" ödülü hesabınıza eklendi.`,
        type: 'success',
        // Kod bildirim gövdesine yazılmaz; kullanıcı cüzdanında görür.
        data: { rewardId: input.rewardId, userRewardId: out.userRewardId },
      },
    })
    .catch((e: unknown) => console.error('[admin-users] ödül bildirimi yazılamadı', e));
  return out;
}

// ───────────────────────────── Profil ─────────────────────────────

const PROFILE_KEYS = ['name', 'phone', 'businessName', 'businessDesc', 'businessCategory', 'address', 'latitude', 'longitude'] as const;
const BUSINESS_KEYS = new Set(['businessName', 'businessDesc', 'businessCategory', 'address', 'latitude', 'longitude']);

export async function updateProfile(ctx: ActionCtx, userId: string, patch: ProfilePatch) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, anonymizedAt: true, name: true, phone: true, businessName: true, businessDesc: true, businessCategory: true, address: true, latitude: true, longitude: true },
  });
  if (!current) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
  assertNotAnonymized(current);
  const isDealer = String(current.role) === 'DEALER';
  const data: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) {
    if (!(k in patch)) continue;
    if (BUSINESS_KEYS.has(k) && !isDealer) {
      throw new ApiError('VALIDATION', 'İşletme bilgileri yalnız bayi hesaplarında düzenlenebilir.');
    }
    const next = (patch as Record<string, unknown>)[k];
    const normalized = typeof next === 'string' && next.trim() === '' ? null : next;
    if (normalized === (current as Record<string, unknown>)[k]) continue;
    data[k] = normalized;
    before[k] = (current as Record<string, unknown>)[k];
  }
  if (Object.keys(data).length === 0) return { changed: [] as string[] };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data });
    await tx.auditLog.create({
      data: auditEntry(ctx.actor, { action: 'USER_PROFILE_UPDATE', entity: 'User', entityId: userId, oldData: before, newData: data }, ctx.request),
    });
  });
  return { changed: Object.keys(data) };
}

// ───────────────────────────── Anonimleştirme ─────────────────────────────

export async function previewAnonymize(ctx: ActionCtx, userId: string) {
  const p = await previewUserErasure(userId, { actorId: ctx.actor.id, context: 'admin' });
  if (!p) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
  return { impact: p.impact, alreadyAnonymized: p.alreadyAnonymized };
}

export async function confirmAnonymize(ctx: ActionCtx, userId: string, confirmPhrase: string) {
  const p = await previewUserErasure(userId, { actorId: ctx.actor.id, context: 'admin' });
  if (!p) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
  if (p.alreadyAnonymized) return { anonymized: true, alreadyAnonymized: true, archivedQrCodes: 0 };
  if (p.impact.blockers?.length) {
    throw new ApiError('ARCHIVE_BLOCKED', p.impact.blockers[0], { status: 409, details: { impact: p.impact } });
  }
  if (confirmPhrase.trim().toLowerCase() !== p.target.email.toLowerCase()) {
    throw new ApiError('VALIDATION', 'Onay için kullanıcının e-posta adresini tam olarak yazın.', {
      details: [{ path: 'confirmPhrase', message: 'E-posta eşleşmiyor' }],
    });
  }
  const r = await anonymizeUser(userId, { actor: ctx.actor, reason: 'admin_delete', request: ctx.request });
  return { anonymized: true, alreadyAnonymized: r.alreadyAnonymized, archivedQrCodes: r.archivedQrCodes };
}

/** Route bağlamından aksiyon bağlamı (aktör anlık görüntüsü + istek meta). */
export function actionCtx(
  session: { user: { id: string; email?: string | null; role?: string | null; name?: string | null } },
  request: Req
): ActionCtx {
  return {
    actor: {
      id: session.user.id,
      email: session.user.email ?? null,
      role: session.user.role ?? null,
      name: session.user.name ?? null,
      type: 'user',
    },
    request,
  };
}

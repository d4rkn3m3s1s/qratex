import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { anonymizeUser } from '@/lib/gdpr-core';
import type { DeletionImpact } from '@/lib/data-safety/archive';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import { previewUserErasure } from '@/lib/data-safety/user-erasure';
import { invalidateSessionState } from '@/lib/auth/session-state';


export const dynamic = 'force-dynamic';

const bulkRoleSchema = z.object({
  action: z.literal('update_role'),
  userIds: z.array(z.string().cuid()).min(1).max(100),
  role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']),
});

const bulkDeleteSchema = z.object({
  action: z.literal('delete'),
  userIds: z.array(z.string().cuid()).min(1).max(100),
  /** Geri döndürülemez anonimleştirme için açık onay (P0-25). */
  confirm: z.boolean().optional(),
  /** Yalnız etki önizlemesi. */
  dryRun: z.boolean().optional(),
});

/**
 * Askıya alma (P0-25): kalıcı ve geri döndürülemez anonimleştirmenin GERİ ALINABİLİR
 * alternatifi. Hesap silinmez/maskelenmez; giriş ve API erişimi kapanır (requireAuth +
 * authorize `suspendedAt` kontrolü), açık oturumlar `sessionVersion` ile düşer.
 */
const bulkSuspendSchema = z.object({
  action: z.literal('suspend'),
  userIds: z.array(z.string().cuid()).min(1).max(100),
  reason: z.string().trim().min(3, 'Askıya alma gerekçesi en az 3 karakter olmalı').max(500),
});

const bulkUnsuspendSchema = z.object({
  action: z.literal('unsuspend'),
  userIds: z.array(z.string().cuid()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const rl = checkAdminRateLimit(auth.session.user.id);
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

    // Bozuk JSON → 400 (500 değil).
    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (body.action === 'suspend' || body.action === 'unsuspend') {
      return handleSuspension(request, auth.session, body);
    }
    if (body.action === 'update_role') {
      const parsed = bulkRoleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      const { userIds, role } = parsed.data;
      // Dalga 2 (admin_users.md B5): toplu ADMIN yükseltmesi yok — yükseltme kişi başına ve
      // ikinci bir yöneticinin onayıyla (POST /api/admin/users/[id]/role → /elevation).
      if (role === 'ADMIN') {
        return NextResponse.json(
          { error: 'Yönetici yükseltmesi toplu yapılamaz; her kullanıcı için ikinci bir yöneticinin onayı gerekir.', code: 'ELEVATION_REQUIRES_APPROVAL' },
          { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      const currentUser = auth.session.user.id;
      const ids = userIds.filter((id) => id !== currentUser);
      if (ids.length === 0) {
        return NextResponse.json({ error: 'Kendinizin rolünü toplu değiştiremezsiniz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      // P0-07: rolü GERÇEKTEN değişenlerin açık oturumları düşer (eski rolle verilmiş token geçersiz).
      const changing = await prisma.user.findMany({
        where: { id: { in: ids }, role: { not: role } },
        select: { id: true },
      });
      const changedIds = changing.map((u) => u.id);
      if (changedIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: changedIds }, role: { not: role } },
          data: { role, sessionVersion: { increment: 1 } },
        });
        await Promise.all(changedIds.map((id) => invalidateSessionState(id).catch(() => undefined)));
      }
      // Toplu rol değişikliği izlenmeli (tekil işlemler gibi) — kritik yetki değişimi.
      await prisma.auditLog.create({
        data: {
          userId: currentUser, action: 'BULK_UPDATE_USER_ROLE', entity: 'User', entityId: `${ids.length} kullanıcı`,
          newData: { userIds: ids, role } as object, ...getAuditRequestMeta(request),
        },
      }).catch((e) => console.error('[users/bulk] audit failed:', e));
      return NextResponse.json({ ok: true, success: true, updated: changedIds.length }, { headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (body.action === 'delete') {
      const parsed = bulkDeleteSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      // P0-25: toplu "silme" = toplu KVKK anonimleştirmesi (hard delete YOK). Her kullanıcı
      // ayrı kontrol edilir; yönetici, kendi hesabı ve faturalanabilir aboneliği olan bayi
      // atlanır. Geri döndürülemez olduğu için açık onay (`confirm: true`) zorunlu; onaysız
      // istek 409 + toplu etki önizlemesi döner.
      const { userIds, confirm, dryRun } = parsed.data;
      const currentUser = auth.session.user.id;
      const ids = Array.from(new Set(userIds)).filter((id) => id !== currentUser);
      if (ids.length === 0) {
        return NextResponse.json({ error: 'Kendinizi silemezsiniz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      const previews = [];
      for (const id of ids) {
        previews.push({ id, preview: await previewUserErasure(id, { actorId: currentUser, context: 'admin' }) });
      }
      const eligible = previews.filter(
        (p) => p.preview && !p.preview.alreadyAnonymized && !(p.preview.impact.blockers?.length)
      );
      const skipped = previews
        .filter((p) => !eligible.includes(p))
        .map((p) => ({
          id: p.id,
          reason: !p.preview
            ? 'Kullanıcı bulunamadı'
            : p.preview.alreadyAnonymized
              ? 'Zaten anonimleştirilmiş'
              : p.preview.impact.blockers?.[0] ?? 'Atlandı',
        }));
      const sumOf = (key: string) =>
        eligible.reduce((acc, p) => acc + (p.preview?.impact.items.find((i) => i.key === key)?.value ?? 0), 0);
      const impact: DeletionImpact = {
        entity: 'User',
        entityId: `${eligible.length} kullanıcı`,
        items: [
          { key: 'accounts', label: 'Anonimleştirilecek hesap', value: eligible.length, emphasis: true },
          { key: 'feedbacks', label: 'Metni silinecek geri bildirim (puanı korunur)', value: sumOf('feedbacks') },
          { key: 'reviews', label: 'Metni silinecek tüketim yorumu', value: sumOf('reviews') },
          { key: 'qrCodes', label: 'Arşivlenecek QR kod (yorumlar korunur)', value: sumOf('qrCodes') },
          { key: 'skipped', label: 'Atlanacak hesap (yönetici / abonelik / bulunamadı)', value: skipped.length },
        ],
        warning:
          'Hesaplar silinmez, KVKK kapsamında geri döndürülemez biçimde anonimleştirilir; denetim izi ve istatistikler korunur.',
      };

      if (dryRun) {
        return NextResponse.json({ ok: true, success: true, dryRun: true, impact, skipped }, { headers: PRIVATE_NO_STORE_HEADERS });
      }
      if (eligible.length === 0) {
        return NextResponse.json(
          { error: 'Seçilen kullanıcıların hiçbiri silinemiyor.', code: 'ARCHIVE_BLOCKED', impact, skipped },
          { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      if (confirm !== true) {
        return NextResponse.json(
          {
            ok: false,
            success: false,
            code: 'CONFIRM_REQUIRED',
            error: `${eligible.length} hesap geri döndürülemez biçimde anonimleştirilecek. Onaylamak için isteği "confirm": true ile tekrarlayın.`,
            impact,
            skipped,
          },
          { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }

      const actor = actorFromSession(auth.session);
      const anonymized: string[] = [];
      const failed: Array<{ id: string; reason: string }> = [];
      for (const p of eligible) {
        try {
          await anonymizeUser(p.id, { actor, reason: 'admin_bulk_delete', request });
          anonymized.push(p.id);
        } catch (e) {
          console.error('[users/bulk] anonymize failed:', p.id, e);
          failed.push({ id: p.id, reason: 'Anonimleştirme başarısız' });
        }
      }
      await prisma.auditLog.create({
        data: auditEntry(
          actor,
          {
            action: 'BULK_ANONYMIZE_USERS',
            entity: 'User',
            entityId: `${anonymized.length} kullanıcı`,
            newData: { anonymized, skipped, failed },
          },
          request
        ),
      }).catch((e) => console.error('[users/bulk] audit failed:', e));
      return NextResponse.json(
        { ok: true, success: true, deleted: anonymized.length, anonymized: anonymized.length, skipped, failed },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    return NextResponse.json({ error: 'Bilinmeyen işlem' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Bulk users error:', e);
    return NextResponse.json({ error: 'Toplu işlem başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

type AdminSession = Parameters<typeof actorFromSession>[0];

/** Toplu askıya alma / askıdan çıkarma — yönetici hedefler ve kendi hesap atlanır. */
async function handleSuspension(request: NextRequest, session: AdminSession, body: unknown) {
  const suspend = (body as { action?: unknown }).action === 'suspend';
  const parsed = suspend ? bulkSuspendSchema.safeParse(body) : bulkUnsuspendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Geçersiz istek' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  const reason = suspend ? (parsed.data as z.infer<typeof bulkSuspendSchema>).reason : null;
  const currentUser = session.user.id;
  const requested = Array.from(new Set(parsed.data.userIds));
  const ids = requested.filter((id) => id !== currentUser);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Kendi hesabınızı askıya alamazsınız' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const targets = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true, suspendedAt: true, anonymizedAt: true },
  });
  const byId = new Map(targets.map((t) => [t.id, t]));
  const skipped: Array<{ id: string; reason: string }> = [];
  if (requested.length !== ids.length) skipped.push({ id: currentUser, reason: 'Kendi hesabınız' });
  const eligible: string[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t) skipped.push({ id, reason: 'Kullanıcı bulunamadı' });
    else if (t.anonymizedAt) skipped.push({ id, reason: 'Hesap anonimleştirilmiş' });
    else if (suspend && String(t.role) === 'ADMIN') skipped.push({ id, reason: 'Yönetici hesapları askıya alınamaz; önce rolü değiştirin' });
    else if (suspend && t.suspendedAt) skipped.push({ id, reason: 'Zaten askıda' });
    else if (!suspend && !t.suspendedAt) skipped.push({ id, reason: 'Askıda değil' });
    else eligible.push(id);
  }

  const actor = actorFromSession(session);
  const now = new Date();
  const changed = eligible.length
    ? await prisma.$transaction(async (tx) => {
        const done: string[] = [];
        for (const id of eligible) {
          // Koşullu yazım: arada durum değiştiyse (yarış) dokunulmaz.
          const w = suspend
            ? await tx.user.updateMany({
                where: { id, suspendedAt: null, anonymizedAt: null, role: { not: 'ADMIN' } },
                data: { suspendedAt: now, suspendedReason: reason, sessionVersion: { increment: 1 } },
              })
            : await tx.user.updateMany({
                where: { id, suspendedAt: { not: null }, anonymizedAt: null },
                data: { suspendedAt: null, suspendedReason: null },
              });
          if (w.count > 0) done.push(id);
        }
        await tx.auditLog.create({
          data: auditEntry(
            actor,
            {
              action: suspend ? 'BULK_SUSPEND_USERS' : 'BULK_UNSUSPEND_USERS',
              entity: 'User',
              entityId: `${done.length} kullanıcı`,
              newData: { userIds: done, reason, skipped },
            },
            request
          ),
        });
        return done;
      })
    : [];

  // Commit SONRASI: oturum durumu sıcak önbelleği bayatlatılır → erişim hemen kapanır/açılır.
  await Promise.all(changed.map((id) => invalidateSessionState(id).catch(() => undefined)));

  return NextResponse.json(
    {
      ok: true,
      success: true,
      ...(suspend ? { suspended: changed.length } : { unsuspended: changed.length }),
      skipped,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

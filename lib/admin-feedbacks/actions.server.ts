/**
 * Toplu moderasyon — platform yöneticisinin geri bildirim aksiyonları.
 *
 * Değişmezler:
 *  - Kalıcı silme YOK: "sil" = çöp kutusu (`deletedAt`), "geri yükle" ile döner. Tüketim yorumu
 *    satırı kaldığı için aynı tüketime ikinci puanlı yorum açılmaz (P0-23).
 *  - Her aksiyon koşullu yazımdır (yalnız durumu gerçekten değişecek satırlar) ve gerçek
 *    etkilenen sayıyı döner; denetim satırı AYNI transaction'da, değişiklik öncesi anlık
 *    görüntü (`oldData`) ve gerekçeyle yazılır.
 *  - Görünürlük/işaret alanları yalnız QR yorumunda var; tüketim yorumu bu aksiyonlarda
 *    açık gerekçeyle "atlandı" döner (sessizce yok sayılmaz).
 *  - Bayiye hatırlatma: yalnız silinmemiş + yanıtsız kayıtlar; aynı bayiye 24 saatte bir.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { clawBackModeratedCredits, restoreModeratedCredits, type ModerationItem } from '@/lib/economy/clawback';
import {
  REMIND_COOLDOWN_HOURS,
  feedKey,
  type BulkAction,
  type BulkBody,
  type BulkResult,
  type FeedSource,
} from './contract';

export interface ActionCtx {
  actor: AuditActor;
  request?: { headers: { get(name: string): string | null } } | null;
}

type Mutation = 'delete' | 'restore' | 'hide' | 'show' | 'flag' | 'clearFlags';

export function feedbackMutation(action: Mutation, now: Date): { where: Prisma.FeedbackWhereInput; data: Prisma.FeedbackUpdateManyMutationInput } {
  switch (action) {
    case 'delete':
      return { where: { deletedAt: null }, data: { deletedAt: now } };
    case 'restore':
      return { where: { deletedAt: { not: null } }, data: { deletedAt: null } };
    case 'hide':
      return { where: { deletedAt: null, isPublic: true }, data: { isPublic: false } };
    case 'show':
      return { where: { isPublic: false }, data: { isPublic: true } };
    case 'flag':
      return { where: { deletedAt: null, OR: [{ isToxic: false }, { isPublic: true }] }, data: { isToxic: true, isPublic: false } };
    case 'clearFlags':
      return { where: { OR: [{ isToxic: true }, { trustFlagged: true }] }, data: { isToxic: false, trustFlagged: false } };
  }
}

export function reviewMutation(action: Mutation, now: Date): { where: Prisma.ConsumptionReviewWhereInput; data: Prisma.ConsumptionReviewUpdateManyMutationInput } | null {
  if (action === 'delete') return { where: { deletedAt: null }, data: { deletedAt: now } };
  if (action === 'restore') return { where: { deletedAt: { not: null } }, data: { deletedAt: null } };
  return null;
}

const NOT_APPLICABLE = 'Bu durum değişikliği gerekmiyor ya da kayıt bulunamadı';
const QR_ONLY_REASON = 'Tüketim yorumunda görünürlük ve işaret alanı yok';

export async function runBulk(body: BulkBody, ctx: ActionCtx): Promise<BulkResult> {
  if (body.action === 'remind') return remindDealers(body, ctx);
  const action = body.action as Mutation;
  const qrIds = body.keys.filter((k) => k.source === 'qr').map((k) => k.id);
  const revIds = body.keys.filter((k) => k.source === 'consumption').map((k) => k.id);
  const skipped: BulkResult['skipped'] = [];
  const now = new Date();

  const revMut = reviewMutation(action, now);
  if (!revMut) for (const id of revIds) skipped.push({ key: feedKey('consumption', id), reason: QR_ONLY_REASON });

  let pointsAdjusted: { affected: number; points: number } | null = null;
  const affected = await prisma.$transaction(async (tx) => {
    let count = 0;
    const snapshot: Record<string, unknown>[] = [];
    const changedKeys: string[] = [];

    if (qrIds.length) {
      const m = feedbackMutation(action, now);
      const before = await tx.feedback.findMany({
        where: { id: { in: qrIds }, ...m.where },
        select: { id: true, rating: true, text: true, isPublic: true, isToxic: true, trustFlagged: true, deletedAt: true },
      });
      const ids = before.map((b) => b.id);
      if (ids.length) {
        const res = await tx.feedback.updateMany({ where: { id: { in: ids }, ...m.where }, data: m.data });
        count += res.count;
      }
      const hit = new Set(ids);
      for (const id of qrIds) if (!hit.has(id)) skipped.push({ key: feedKey('qr', id), reason: NOT_APPLICABLE });
      for (const b of before) {
        snapshot.push({ source: 'qr', ...b });
        changedKeys.push(feedKey('qr', b.id));
      }
    }

    if (revIds.length && revMut) {
      const before = await tx.consumptionReview.findMany({
        where: { id: { in: revIds }, ...revMut.where },
        select: { id: true, rating: true, text: true, deletedAt: true, consumptionId: true },
      });
      const ids = before.map((b) => b.id);
      if (ids.length) {
        const res = await tx.consumptionReview.updateMany({ where: { id: { in: ids }, ...revMut.where }, data: revMut.data });
        count += res.count;
      }
      const hit = new Set(ids);
      for (const id of revIds) if (!hit.has(id)) skipped.push({ key: feedKey('consumption', id), reason: NOT_APPLICABLE });
      for (const b of before) {
        snapshot.push({ source: 'consumption', ...b });
        changedKeys.push(feedKey('consumption', b.id));
      }
    }

    // Ekonomi (oyunlaştırma-ekonomi Y4): çöp kutusuna atılan yorumun puanı geri alınır, geri
    // yüklenince iade edilir — aynı transaction'da, defterli ve tek-kez (lib/economy/clawback).
    if ((action === 'delete' || action === 'restore') && changedKeys.length) {
      const items: ModerationItem[] = [];
      for (const snap of snapshot) {
        if (snap.source === 'qr') items.push({ kind: 'feedback', feedbackId: String(snap.id) });
        else if (typeof snap.consumptionId === 'string') items.push({ kind: 'consumption_review', consumptionId: snap.consumptionId });
      }
      const actorId = ctx.actor.id ?? 'system';
      const ledger =
        action === 'delete'
          ? await clawBackModeratedCredits(tx, items, { actorId, reason: body.reason ? `Moderasyon: ${body.reason}` : undefined })
          : await restoreModeratedCredits(tx, items, { actorId });
      if (ledger.affected > 0) pointsAdjusted = ledger;
    }

    if (changedKeys.length) {
      const sources = new Set(snapshot.map((s) => s.source as FeedSource));
      await tx.auditLog.create({
        data: auditEntry(
          ctx.actor,
          {
            action: `FEEDBACK_MOD_${action.toUpperCase()}`,
            entity: sources.size === 1 && sources.has('consumption') ? 'ConsumptionReview' : 'Feedback',
            // Kimlikler denetim satırında aranabilir (detay çekmecesi `contains` ile okur).
            entityId: changedKeys.join(',').slice(0, 4000),
            oldData: { items: snapshot },
            newData: { action, reason: body.reason ?? null, affected: count, keys: changedKeys, pointsAdjusted },
          },
          ctx.request
        ),
      });
      // Tüketim yorumu da aynı işlemden etkilendiyse kendi varlık adıyla da bulunabilsin.
      if (sources.size === 2) {
        await tx.auditLog.create({
          data: auditEntry(
            ctx.actor,
            {
              action: `FEEDBACK_MOD_${action.toUpperCase()}`,
              entity: 'ConsumptionReview',
              entityId: changedKeys.filter((k) => k.startsWith('consumption:')).join(',').slice(0, 4000),
              newData: { action, reason: body.reason ?? null },
            },
            ctx.request
          ),
        });
      }
    }
    return count;
  });

  return { action: body.action, requested: body.keys.length, affected, skipped };
}

/** Yanıtsız kayıtlar için bayiye uygulama içi bildirim (kayıt başına değil, bayi başına tek). */
async function remindDealers(body: BulkBody, ctx: ActionCtx): Promise<BulkResult> {
  const qrIds = body.keys.filter((k) => k.source === 'qr').map((k) => k.id);
  const revIds = body.keys.filter((k) => k.source === 'consumption').map((k) => k.id);
  const skipped: BulkResult['skipped'] = [];

  const [qr, rev] = await Promise.all([
    qrIds.length
      ? prisma.feedback.findMany({
          where: { id: { in: qrIds }, deletedAt: null, OR: [{ dealerReply: null }, { dealerReply: '' }] },
          select: { id: true, rating: true, qrCode: { select: { dealerId: true } } },
        })
      : Promise.resolve([]),
    revIds.length
      ? prisma.consumptionReview.findMany({
          where: { id: { in: revIds }, deletedAt: null, OR: [{ dealerReply: null }, { dealerReply: '' }] },
          select: { id: true, rating: true, consumption: { select: { dealerId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const byDealer = new Map<string, { keys: string[]; low: number }>();
  const add = (dealerId: string, key: string, rating: number) => {
    const g = byDealer.get(dealerId) ?? { keys: [], low: 0 };
    g.keys.push(key);
    if (rating <= 2) g.low += 1;
    byDealer.set(dealerId, g);
  };
  for (const f of qr) add(f.qrCode.dealerId, feedKey('qr', f.id), f.rating);
  for (const r of rev) add(r.consumption.dealerId, feedKey('consumption', r.id), r.rating);

  const eligible = new Set([...qr.map((f) => feedKey('qr', f.id)), ...rev.map((r) => feedKey('consumption', r.id))]);
  for (const k of body.keys) {
    const key = feedKey(k.source, k.id);
    if (!eligible.has(key)) skipped.push({ key, reason: 'Silinmiş, zaten yanıtlanmış ya da bulunamadı' });
  }

  const since = new Date(Date.now() - REMIND_COOLDOWN_HOURS * 3_600_000);
  const dealerIds = [...byDealer.keys()];
  const recent = dealerIds.length
    ? await prisma.notification.findMany({
        where: { userId: { in: dealerIds }, createdAt: { gte: since }, data: { path: ['kind'], equals: 'admin_feedback_reminder' } },
        select: { userId: true },
      })
    : [];
  const cooled = new Set(recent.map((n) => n.userId));

  let affected = 0;
  let notified = 0;
  const sent: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const [dealerId, g] of byDealer) {
      if (cooled.has(dealerId)) {
        for (const key of g.keys) skipped.push({ key, reason: `Bu bayiye son ${REMIND_COOLDOWN_HOURS} saatte hatırlatma gönderildi` });
        continue;
      }
      const n = g.keys.length;
      await tx.notification.create({
        data: {
          userId: dealerId,
          type: 'warning',
          title: 'Yanıt bekleyen müşteri yorumları',
          message:
            g.low > 0
              ? `${n} müşteri yorumu yanıtınızı bekliyor; ${g.low} tanesi düşük puanlı. Hızlı bir yanıt müşteriyi geri kazanmanın en etkili yolu.`
              : `${n} müşteri yorumu yanıtınızı bekliyor. Yanıtlamak müşteriye sesinin duyulduğunu gösterir.`,
          data: { kind: 'admin_feedback_reminder', href: '/dealer/inbox', keys: g.keys.slice(0, 50) },
        },
      });
      notified += 1;
      affected += n;
      sent.push(...g.keys);
    }
    if (sent.length) {
      await tx.auditLog.create({
        data: auditEntry(
          ctx.actor,
          {
            action: 'FEEDBACK_MOD_REMIND',
            entity: 'Feedback',
            entityId: sent.join(',').slice(0, 4000),
            newData: { action: 'remind', dealers: notified, keys: sent, reason: body.reason ?? null },
          },
          ctx.request
        ),
      });
    }
  });

  return { action: 'remind' as BulkAction, requested: body.keys.length, affected, skipped, notifiedDealers: notified };
}


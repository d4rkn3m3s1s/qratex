import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { isR2Configured, setR2Disposition, keyFromPublicUrl } from '@/lib/r2-storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ATTACHMENT BACKFILL: inline-disposition düzeltmesinden ÖNCE yüklenen ekler R2'de
 * `attachment` disposition ile duruyor → Safari (iOS/Mac) açamıyor. Bu endpoint eski
 * ekleri displayable türler (görsel/pdf/video) için `inline`'a çevirir (CopyObject REPLACE).
 * Tek seferlik: cron-job.org'dan birkaç kez çalıştır (Bearer CRON_SECRET), sayılar 0'lanınca biter.
 * Zaman-bütçeli (25sn) + koşu başına sınırlı. İdempotent (tekrar çalıştırmak zararsız).
 */
function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret.trim()}`;
  const got = (authHeader ?? '').trim();
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

/** Tarayıcıda gösterilebilir mi (inline yapılmalı mı). Diğerleri attachment kalır. */
function isDisplayable(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase();
  return m.startsWith('image/') || m.startsWith('video/') || m === 'application/pdf';
}

function inlineDisposition(filename: string): string {
  const safe = (filename || 'file').replace(/["\r\n]/g, '');
  return `inline; filename="${encodeURIComponent(safe)}"`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'R2 yapılandırılmamış' }, { status: 503 });
  }

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 25_000;
  let taskFixed = 0, inboxFixed = 0, skipped = 0, failed = 0;

  // 1) Görev ekleri (TaskAttachment) — displayable türler, en yeniden eskiye, koşu başına 120.
  const tasks = await prisma.taskAttachment.findMany({
    where: { OR: [{ mime: { startsWith: 'image/' } }, { mime: { startsWith: 'video/' } }, { mime: 'application/pdf' }] },
    select: { id: true, path: true, mime: true, filename: true },
    orderBy: { createdAt: 'desc' },
    take: 120,
  }).catch(() => []);

  for (const a of tasks) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const key = keyFromPublicUrl(a.path);
    if (!key || !isDisplayable(a.mime)) { skipped++; continue; }
    try {
      await setR2Disposition(key, a.mime, inlineDisposition(a.filename));
      taskFixed++;
    } catch { failed++; }
  }

  // 2) Gelen kutusu ekleri (InboxMessage.attachments JSON) — koşu başına 60 mesaj.
  // Json-null filtresi (DbNull/JsonNull) kırılgan → filtresiz çek, JS'te ele.
  const msgs = await prisma.inboxMessage.findMany({
    select: { id: true, attachments: true },
    orderBy: { createdAt: 'desc' },
    take: 60,
  }).catch(() => []);

  for (const msg of msgs) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
    if (atts.length === 0) continue;
    for (const raw of atts) {
      const att = raw as { url?: string | null; contentType?: string | null; filename?: string | null };
      if (!att?.url || !isDisplayable(att.contentType)) { skipped++; continue; }
      const key = keyFromPublicUrl(att.url);
      if (!key) { skipped++; continue; }
      try {
        await setR2Disposition(key, att.contentType!, inlineDisposition(att.filename || 'ek'));
        inboxFixed++;
      } catch { failed++; }
    }
  }

  return NextResponse.json({
    ok: true,
    taskFixed,
    inboxFixed,
    skipped,     // displayable değil / key çıkmadı (attachment kalması doğru)
    failed,
    tookMs: Date.now() - startedAt,
  });
}

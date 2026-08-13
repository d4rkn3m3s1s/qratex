import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { syncInbox, isInboxConfigured } from '@/lib/mail-inbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // IMAP çekimi yavaş olabilir

/**
 * GET /api/admin/inbox?filter=all|intern&q=...  — Gelen kutusu listesi (depolanmış).
 * filter=intern → yalnız stajyer/görev alıcılarından gelenler (otomatik ayrılmış).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') === 'intern' ? 'intern' : 'all';
  const q = (url.searchParams.get('q') ?? '').trim();

  const where: Record<string, unknown> = {};
  if (filter === 'intern') where.isFromIntern = true;
  if (q) {
    where.OR = [
      { fromEmail: { contains: q, mode: 'insensitive' } },
      { fromName: { contains: q, mode: 'insensitive' } },
      { subject: { contains: q, mode: 'insensitive' } },
      { matchedRecipientName: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [messages, totalAll, totalIntern, unread] = await Promise.all([
    prisma.inboxMessage.findMany({
      where, orderBy: { sentAt: 'desc' }, take: 100,
      select: {
        id: true, fromEmail: true, fromName: true, subject: true, snippet: true,
        sentAt: true, seen: true, isFromIntern: true,
        matchedRecipientName: true, matchedDepartment: true,
        threadRoot: true, isBounce: true,
      },
    }).catch(() => []),
    prisma.inboxMessage.count().catch(() => 0),
    prisma.inboxMessage.count({ where: { isFromIntern: true } }).catch(() => 0),
    prisma.inboxMessage.count({ where: { seen: false } }).catch(() => 0),
  ]);

  return NextResponse.json(
    { success: true, messages, counts: { all: totalAll, intern: totalIntern, unread }, inboxConfigured: isInboxConfigured() },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/** POST /api/admin/inbox — IMAP'ten yeni mailleri çekip depola (sync). Rate-limitli. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const rl = await checkRateLimitDb(`inbox-sync:${userId}`, 6, 60_000); // dk'da 6 sync
  if (!rl.ok) {
    return NextResponse.json({ success: false, error: 'Çok sık senkronizasyon. Biraz bekle.' }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (!isInboxConfigured()) {
    return NextResponse.json({ success: false, error: 'IMAP yapılandırması eksik (IMAP_USER/PASS veya SMTP_USER/PASS).' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(100, Math.max(10, Number(body?.limit) || 40));
  const r = await syncInbox(limit);
  if (!r.ok) {
    return NextResponse.json({ success: false, error: r.error }, { status: 502, headers: PRIVATE_NO_STORE_HEADERS });
  }
  return NextResponse.json({ success: true, ...r }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** PATCH /api/admin/inbox — { id, seen } okundu/okunmadı işaretle. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  const seen = Boolean(body?.seen);
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

  await prisma.inboxMessage.update({ where: { id }, data: { seen } }).catch(() => {});
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}

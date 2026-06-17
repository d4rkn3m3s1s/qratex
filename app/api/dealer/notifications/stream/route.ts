import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/dealer/notifications/stream — gerçek zamanlı bildirim akışı (SSE).
 *
 * Serverless'te kalıcı pub/sub yok; bunun yerine bu kısa ömürlü SSE bağlantısı
 * son bildirim zamanını imleç tutarak DB'yi birkaç saniyede bir yoklar ve YENİ
 * bildirimleri anında iter. İstemci EventSource ile bağlanır; bağlantı maxDuration
 * sonunda kapanınca otomatik yeniden bağlanır. 30sn client polling'e kıyasla
 * negatif feedback/uyarılar <~3sn görünür.
 */
const POLL_MS = 3000;

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN', 'STAFF']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const url = new URL(req.url);
  // İmleç: istemci son aldığı bildirim zamanını gönderebilir (reconnect'te kaçırma yok).
  const sinceParam = url.searchParams.get('since');
  let cursor = sinceParam ? new Date(sinceParam) : new Date();
  if (Number.isNaN(cursor.getTime())) cursor = new Date();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(poller);
        try { controller.close(); } catch { /* ignore */ }
      };

      req.signal.addEventListener('abort', cleanup);

      // İlk açılışta okunmamış sayısını gönder (UI rozeti hemen güncellensin).
      try {
        const unread = await prisma.notification.count({ where: { userId, isRead: false } });
        send('init', { unread, since: cursor.toISOString() });
      } catch {
        send('init', { unread: 0, since: cursor.toISOString() });
      }

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 15000);

      const poll = async () => {
        if (closed) return;
        try {
          const fresh = await prisma.notification.findMany({
            where: { userId, createdAt: { gt: cursor } },
            orderBy: { createdAt: 'asc' },
            take: 20,
            select: { id: true, title: true, message: true, type: true, createdAt: true, isRead: true },
          });
          if (fresh.length > 0) {
            cursor = fresh[fresh.length - 1].createdAt;
            send('notifications', { items: fresh });
          }
        } catch (err) {
          console.error('[NOTIF_STREAM] poll failed:', err);
        }
      };

      const poller = setInterval(poll, POLL_MS);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0, no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

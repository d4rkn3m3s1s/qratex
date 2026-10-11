/**
 * POST /api/admin/inbox/sync — IMAP'ten yeni mailleri UID artımlı çeker (elle "Şimdi senkronla").
 * Koşu başına parti + süre bütçesi; kalan varsa `hasMore: true` döner (istemci tekrar çağırabilir).
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { isInboxConfigured, syncInbox } from '@/lib/mail-inbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = defineRoute(
  { name: 'admin.inbox.sync', roles: ['ADMIN'], rateLimit: { max: 6, windowMs: 60_000, by: 'user' } },
  async () => {
    if (!isInboxConfigured()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'IMAP yapılandırması eksik (IMAP_USER/PASS veya SMTP_USER/PASS).');
    }
    const r = await syncInbox({ source: 'manual', maxMessages: 60, budgetMs: 45_000 });
    if (!r.ok) throw new ApiError('SERVICE_UNAVAILABLE', r.error, { status: 502, retryable: true });
    return ok(r);
  }
);

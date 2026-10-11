/**
 * POST /api/admin/intern-emails/preview — { template, sampleTo? } KAYDEDİLMEMİŞ taslağın gerçek
 * HTML'i (açılma pikseli YOK). Sayfa içi canlı önizleme çerçevesi (srcDoc) bunu kullanır.
 */
import { defineRoute } from '@/lib/http/define-route';
import { isInternEmailKind, renderInternTaskEmailHtml, type InternTaskEmail } from '@/lib/intern-task-emails';
import { previewSchema } from '@/lib/mail-center/templates-contract';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.intern-emails.preview', roles: ['ADMIN'], schema: previewSchema, rateLimit: { max: 120, windowMs: 60_000, by: 'user' } },
  async ({ body }) => {
    const t = body.template;
    const tpl: InternTaskEmail = {
      id: t.id || 'preview',
      kind: isInternEmailKind(t.kind) ? t.kind : 'task',
      department: t.department?.trim() || 'Genel',
      recipientName: t.recipientName ?? '',
      email: t.email ?? '',
      subject: t.subject?.trim() || '(konu yok)',
      body: t.body ?? '',
      deadline: t.deadline?.trim() || undefined,
    };
    const { html } = renderInternTaskEmailHtml(tpl, undefined, body.sampleTo?.trim() || undefined);
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
);

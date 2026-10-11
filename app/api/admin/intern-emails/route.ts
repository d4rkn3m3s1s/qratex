/**
 * /api/admin/intern-emails — mail şablonları.
 *  GET  — şablonlar (sürümlü) + gönderim/açılma/yanıt özeti + bugünkü hatırlatma durumu.
 *  PUT  — { baseVersion, templates } TEK zod şemasıyla doğrulanır (sessiz düşürme yok), iyimser
 *         kilitle kaydedilir (çakışmada 409), denetime alan bazlı fark yazılır.
 *  POST — { action: 'send', templateId, onlyNew } gerçek gönderim (daha önce alana tekrar gitmez,
 *         süre bütçesi aşılırsa `remaining` döner) | { action: 'test', testTo, template } taslak testi.
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { isMailConfigured } from '@/lib/mail-sender';
import { InternTemplatesConflictError } from '@/lib/intern-task-emails';
import { saveTemplatesSchema, sendSchema } from '@/lib/mail-center/templates-contract';
import {
  NothingToSendError,
  TemplateNotFoundError,
  loadTemplatesView,
  saveTemplates,
  sendSavedTemplate,
  sendTestDraft,
} from '@/lib/mail-center/templates.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = defineRoute({ name: 'admin.intern-emails.view', roles: ['ADMIN'], rateLimit: 'read' }, async () =>
  ok(await loadTemplatesView())
);

export const PUT = defineRoute(
  { name: 'admin.intern-emails.save', roles: ['ADMIN'], schema: saveTemplatesSchema, rateLimit: 'mutation', maxBodyBytes: 4_000_000 },
  async ({ body, session, request }) => {
    try {
      return ok(await saveTemplates({ templates: body.templates, baseVersion: body.baseVersion, session, meta: getAuditRequestMeta(request) }));
    } catch (e) {
      if (e instanceof InternTemplatesConflictError) {
        throw new ApiError('CONFLICT', 'Şablonlar siz düzenlerken başka bir yönetici tarafından değiştirildi. Değişikliklerinizi kopyalayıp sayfayı yenileyin.', {
          details: { currentVersion: e.currentVersion },
        });
      }
      throw e;
    }
  }
);

export const POST = defineRoute(
  { name: 'admin.intern-emails.send', roles: ['ADMIN'], schema: sendSchema, rateLimit: { max: 30, windowMs: 60_000, by: 'user' }, idempotent: true },
  async ({ body, session, request }) => {
    if (!isMailConfigured()) throw new ApiError('SERVICE_UNAVAILABLE', 'Mail yapılandırması eksik (SMTP veya Resend). Ortam değişkenlerini kontrol edin.');
    try {
      if (body.action === 'test') return ok(await sendTestDraft({ template: body.template, testTo: body.testTo, session }));
      return ok(await sendSavedTemplate({ templateId: body.templateId, onlyNew: body.onlyNew, only: body.only, session, meta: getAuditRequestMeta(request) }));
    } catch (e) {
      if (e instanceof TemplateNotFoundError) throw new ApiError('NOT_FOUND', e.message);
      if (e instanceof NothingToSendError) throw new ApiError('BAD_REQUEST', e.message);
      throw e;
    }
  }
);

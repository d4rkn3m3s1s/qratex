import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  getInternTaskEmails,
  renderInternTaskEmailHtml,
  type InternTaskEmail,
} from '@/lib/intern-task-emails';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/intern-emails/preview?id=<templateId>
 * KAYITLI şablonun ÇOK GÜZEL HTML halini gösterir (tracking pixel'siz). Yalnız ADMIN.
 * NOT: kaydedilmemiş taslağı görmek için POST kullan (aşağıda) — GET yalnız DB'dekini gösterir.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const id = new URL(request.url).searchParams.get('id') ?? '';
  const templates = await getInternTaskEmails();
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) {
    return new NextResponse('Şablon bulunamadı', { status: 404 });
  }
  const { html } = renderInternTaskEmailHtml(tpl); // token yok → pixel eklenmez
  return htmlResponse(html);
}

/**
 * POST /api/admin/intern-emails/preview
 * body: { template: {department, recipientName, email, subject, body, deadline?} }
 * KAYDEDİLMEMİŞ taslağı canlı önizler — kullanıcı alanları doldurunca kaydetmeden görebilir.
 * (Önceki bug: önizleme yalnız GET'ti, DB'de olmayan yeni/düzenlenen şablon boş/404 dönüyordu.)
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const raw = await request.json().catch(() => ({}));
  const t = (raw as { template?: Record<string, unknown> })?.template ?? {};
  // Önizleme için gevşek doğrulama: id/email/subject boş olsa bile göster (canlı düzenleme).
  const tpl: InternTaskEmail = {
    id: typeof t.id === 'string' && t.id ? t.id : 'preview',
    department: typeof t.department === 'string' ? t.department : 'Genel',
    recipientName: typeof t.recipientName === 'string' ? t.recipientName : '',
    email: typeof t.email === 'string' ? t.email : '',
    subject: typeof t.subject === 'string' ? t.subject : '(konu yok)',
    body: typeof t.body === 'string' ? t.body : '',
    deadline: typeof t.deadline === 'string' && t.deadline.trim() ? t.deadline.trim().slice(0, 60) : undefined,
  };
  const { html } = renderInternTaskEmailHtml(tpl);
  return htmlResponse(html);
}

function htmlResponse(html: string): NextResponse {
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

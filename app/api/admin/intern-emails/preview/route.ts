import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getInternTaskEmails, renderInternTaskEmailHtml } from '@/lib/intern-task-emails';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/intern-emails/preview?id=<templateId>
 * Şablonun ÇOK GÜZEL HTML halini tarayıcıda gösterir (admin önizleme). Tracking pixel'siz
 * (önizleme açılma sayılmasın). Yalnız ADMIN.
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
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

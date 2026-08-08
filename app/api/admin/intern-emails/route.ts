import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail, isMailConfigured } from '@/lib/mail-sender';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { nanoid } from 'nanoid';
import {
  getInternTaskEmails,
  saveInternTaskEmails,
  normalizeInternEmails,
  renderInternTaskEmailHtml,
} from '@/lib/intern-task-emails';

export const dynamic = 'force-dynamic';

/** GET — şablon listesi + her şablon için gönderim/açılma özeti + mail yapılandırma durumu. */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const templates = await getInternTaskEmails();

  // Gönderim/açılma özeti (yalnız gerçek 'send'ler; test hariç). Şablon başına grupla.
  const sends = await prisma.internEmailSend.findMany({
    where: { kind: 'send' },
    select: { templateId: true, email: true, firstOpenedAt: true, lastOpenedAt: true, openCount: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  }).catch(() => []);

  const statsByTemplate: Record<string, { sent: number; opened: number; lastSentAt: string | null; recipients: { email: string; openedAt: string | null; openCount: number }[] }> = {};
  for (const s of sends) {
    const st = statsByTemplate[s.templateId] ?? { sent: 0, opened: 0, lastSentAt: null, recipients: [] };
    st.sent += 1;
    if (s.firstOpenedAt) st.opened += 1;
    if (!st.lastSentAt) st.lastSentAt = s.createdAt.toISOString(); // en yeni (orderBy desc)
    st.recipients.push({ email: s.email, openedAt: s.firstOpenedAt?.toISOString() ?? null, openCount: s.openCount });
    statsByTemplate[s.templateId] = st;
  }

  return NextResponse.json(
    { success: true, templates, stats: statsByTemplate, mailConfigured: isMailConfigured() },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/** PUT — şablon listesini kaydeder (düzenle/sil/ekle). */
export async function PUT(request: NextRequest) {
  const auditMeta = getAuditRequestMeta(request);
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const raw = await request.json().catch(() => ({}));
  const list = normalizeInternEmails((raw as { templates?: unknown })?.templates);
  await saveInternTaskEmails(list);

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'UPDATE_INTERN_EMAILS',
      entity: 'Settings',
      entityId: 'intern_task_emails',
      newData: { count: list.length } as object,
      ...auditMeta,
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, templates: list }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/**
 * POST — Mail GÖNDER. { action: 'send'|'test', templateId, testTo? }.
 *  - 'test': şablonu testTo adresine gönderir (kendine deneme).
 *  - 'send': şablonu gerçek alıcı(lar)ına gönderir (email alanı virgülle çok alıcı olabilir).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  // Kötüye kullanım / kaza koruması: admin başına dk'da 20 gönderim isteği.
  const rl = await checkRateLimitDb(`intern-email:${userId}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ success: false, error: 'Çok fazla gönderim. Biraz bekle.' }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (!isMailConfigured()) {
    return NextResponse.json({ success: false, error: 'Mail yapılandırması eksik (SMTP/Resend). Env kontrol et.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action === 'test' ? 'test' : 'send';
  const templateId = typeof body?.templateId === 'string' ? body.templateId : '';
  const testTo = typeof body?.testTo === 'string' ? body.testTo.trim() : '';

  const templates = await getInternTaskEmails();
  const tpl = templates.find((t) => t.id === templateId);
  if (!tpl) {
    return NextResponse.json({ success: false, error: 'Şablon bulunamadı.' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }

  // Hedef adres(ler)i belirle. test → testTo; send → şablonun email alanı (virgülle çok alıcı).
  const recipients = action === 'test'
    ? (testTo ? [testTo] : [])
    : tpl.email.split(',').map((s) => s.trim()).filter(Boolean);

  if (recipients.length === 0) {
    return NextResponse.json({ success: false, error: action === 'test' ? 'Test adresi gir.' : 'Şablonda alıcı yok.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  // Her alıcıya ayrı gönder (BCC yerine tek tek — kişisel görünüm + açılma takibi + hata izolasyonu).
  const results: { to: string; ok: boolean; channel?: string; error?: string }[] = [];
  for (const to of recipients) {
    // Açılma takibi için benzersiz token + gönderim kaydı (test dahil).
    const token = nanoid(24);
    const { html, text } = renderInternTaskEmailHtml(tpl, token);
    const subject = action === 'test' ? `[TEST] ${tpl.subject}` : tpl.subject;
    const r = await sendTransactionalEmail({ to, subject, html, text });
    // Kayıt oluştur (gönderim başarılıysa; token pixel'iyle eşleşir).
    if (r.ok) {
      await prisma.internEmailSend.create({
        data: {
          token, templateId: tpl.id, department: tpl.department, recipientName: tpl.recipientName,
          email: to, subject, kind: action, sentByUserId: userId, channel: r.channel,
        },
      }).catch(() => {});
    }
    results.push({ to, ok: r.ok, channel: r.ok ? r.channel : undefined, error: r.ok ? undefined : r.error });
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json(
    { success: allOk, results, sent: results.filter((r) => r.ok).length, total: results.length },
    { status: allOk ? 200 : 207, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail, isMailConfigured } from '@/lib/mail-sender';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { randomBytes } from 'crypto';
import {
  getInternTaskEmails,
  saveInternTaskEmails,
  normalizeInternEmails,
  renderInternTaskEmailHtml,
} from '@/lib/intern-task-emails';
import { groupSends } from '@/lib/intern-email-stats';

export const dynamic = 'force-dynamic';

/**
 * URL-safe açılma-takip token'ı (base64url, ~24 karakter). Pixel endpoint regex'i
 * /^[A-Za-z0-9_-]{6,64}$/ ile uyumlu. crypto ile — harici bağımlılık (nanoid) gerekmez.
 */
function makeTrackToken(): string {
  return randomBytes(18).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** GET — şablon listesi + her şablon için gönderim/açılma özeti (gerçek + test) + mail durumu. */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const templates = await getInternTaskEmails();

  // Gönderim/açılma özeti — HEM gerçek ('send') HEM test ('test') kayıtları.
  // Her alıcı için son (en yeni) kayıt esas alınır — tekrar gönderimde durum güncellenir.
  // Gerçek gönderim → stats; test gönderim → testStats (panelde ayrı gösterilir).
  const rows = await prisma.internEmailSend.findMany({
    where: { kind: { in: ['send', 'test'] } },
    select: { templateId: true, kind: true, email: true, status: true, lastError: true, firstOpenedAt: true, lastOpenedAt: true, openCount: true, createdAt: true, id: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // eşit createdAt'te deterministik (id tie-breaker)
  }).catch(() => []);

  const statsByTemplate = groupSends(rows.filter((r) => r.kind !== 'test'));
  const testStatsByTemplate = groupSends(rows.filter((r) => r.kind === 'test'));

  return NextResponse.json(
    { success: true, templates, stats: statsByTemplate, testStats: testStatsByTemplate, mailConfigured: isMailConfigured() },
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
    const token = makeTrackToken();
    const { html, text } = renderInternTaskEmailHtml(tpl, token);
    const subject = action === 'test' ? `[TEST] ${tpl.subject}` : tpl.subject;
    const r = await sendTransactionalEmail({ to, subject, html, text });
    // Kayıt oluştur — HEM başarı HEM hata (durum panelinde gitti✓/hata✗ görünsün).
    // Başarılıysa token pixel'iyle eşleşir (açılma takibi); hatalıysa status=error + mesaj.
    await prisma.internEmailSend.create({
      data: {
        token, templateId: tpl.id, department: tpl.department, recipientName: tpl.recipientName,
        email: to, subject, kind: action, sentByUserId: userId,
        status: r.ok ? 'sent' : 'error',
        channel: r.ok ? r.channel : null,
        lastError: r.ok ? null : (r.error ?? 'Bilinmeyen gönderim hatası').slice(0, 300),
      },
    }).catch(() => {});
    results.push({ to, ok: r.ok, channel: r.ok ? r.channel : undefined, error: r.ok ? undefined : r.error });
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json(
    { success: allOk, results, sent: results.filter((r) => r.ok).length, total: results.length },
    { status: allOk ? 200 : 207, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

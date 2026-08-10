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
// Toplu gönderim throttle nedeniyle uzun sürebilir — Vercel timeout'u yükselt.
export const maxDuration = 60;

/** Toplu gönderimde mailler arası bekleme (ms) — Gmail "toplu spam" tetikleyicisini yumuşatır. */
const BULK_THROTTLE_MS = 800;

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/**
 * URL-safe açılma-takip token'ı (base64url, ~24 karakter). Pixel endpoint regex'i
 * /^[A-Za-z0-9_-]{6,64}$/ ile uyumlu. crypto ile — harici bağımlılık (nanoid) gerekmez.
 */
function makeTrackToken(): string {
  return randomBytes(18).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Teslim edilebilirlik başlıkları (spam skorunu düşürür): List-Unsubscribe (Gmail'in en
 * sevdiği meşru-gönderen sinyali) — mailto (endpoint gerektirmez) + Auto-Submitted.
 * replyTo mail-sender'da env'den (EMAIL_REPLY_TO) eklenir.
 */
function deliverabilityHeaders(): Record<string, string> {
  // NOT: Bu mailler TRANSACTIONAL (kişiye özel görev ataması), bülten değil. Bu yüzden
  // 'Precedence: bulk' / 'List-Unsubscribe' EKLENMEZ — bunlar maili "toplu bülten" gibi
  // işaretleyip Gmail'in Promosyonlar/Spam'e atma ihtimalini artırır. Meşru gönderen sinyali
  // Reply-To (mail-sender'da EMAIL_REPLY_TO env'inden) + throttle ile sağlanır.
  return {
    'X-Entity-Ref-ID': 'qratex-intern-task',
  };
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
type SendResult = { to: string; ok: boolean; department?: string; channel?: string; error?: string };

/** Tek bir şablonu verilen alıcı(lar)a gönderir; her alıcı için InternEmailSend kaydı oluşturur. */
async function sendTemplate(
  tpl: { id: string; department: string; recipientName: string; email: string; subject: string; body: string; deadline?: string },
  recipients: string[],
  kind: 'send' | 'test',
  userId: string,
  throttleMs = 0,
): Promise<SendResult[]> {
  const out: SendResult[] = [];
  const headers = deliverabilityHeaders();
  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    // Açılma takibi için benzersiz token + gönderim kaydı (test dahil).
    const token = makeTrackToken();
    const { html, text } = renderInternTaskEmailHtml(tpl, token);
    const subject = kind === 'test' ? `[TEST] ${tpl.subject}` : tpl.subject;
    const r = await sendTransactionalEmail({ to, subject, html, text, headers });
    // Kayıt oluştur — HEM başarı HEM hata (durum panelinde gitti✓/hata✗ görünsün).
    await prisma.internEmailSend.create({
      data: {
        token, templateId: tpl.id, department: tpl.department, recipientName: tpl.recipientName,
        email: to, subject, kind, sentByUserId: userId,
        status: r.ok ? 'sent' : 'error',
        channel: r.ok ? r.channel : null,
        lastError: r.ok ? null : (r.error ?? 'Bilinmeyen gönderim hatası').slice(0, 300),
      },
    }).catch(() => {});
    out.push({ to, ok: r.ok, department: tpl.department, channel: r.ok ? r.channel : undefined, error: r.ok ? undefined : r.error });
    // Kademeli gönderim: son mail hariç aralarda bekle (Gmail toplu-spam tetikleyicisini yumuşat).
    if (throttleMs > 0 && i < recipients.length - 1) await sleep(throttleMs);
  }
  return out;
}

/**
 * POST — Mail GÖNDER.
 *  - { action: 'test', templateId, testTo }      → şablonu test adresine gönder (deneme).
 *  - { action: 'send', templateId }              → şablonu gerçek alıcı(lar)ına gönder.
 *  - { action: 'send-bulk', templateIds: [...] } → birden çok şablonu TOPLU gerçek alıcılarına gönder.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  // Kötüye kullanım / kaza koruması: admin başına dk'da 20 gönderim İSTEĞİ (toplu = 1 istek).
  const rl = await checkRateLimitDb(`intern-email:${userId}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ success: false, error: 'Çok fazla gönderim. Biraz bekle.' }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (!isMailConfigured()) {
    return NextResponse.json({ success: false, error: 'Mail yapılandırması eksik (SMTP/Resend). Env kontrol et.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const action: 'test' | 'send' | 'send-bulk' =
    body?.action === 'test' ? 'test' : body?.action === 'send-bulk' ? 'send-bulk' : 'send';
  const templates = await getInternTaskEmails();

  // ── TOPLU GÖNDERİM ──
  if (action === 'send-bulk') {
    const ids: string[] = Array.isArray(body?.templateIds)
      ? body.templateIds.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    // ids boşsa → alıcısı olan TÜM şablonlar (galeri toplu gönderim).
    const chosen = (ids.length ? templates.filter((t) => ids.includes(t.id)) : templates)
      .filter((t) => t.email.split(',').some((e) => e.trim()));
    if (chosen.length === 0) {
      return NextResponse.json({ success: false, error: 'Gönderilecek (alıcısı olan) şablon yok.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Kademeli: şablonlar arasında ve şablon-içi alıcılar arasında bekle (spam riski ↓).
    const results: SendResult[] = [];
    for (let i = 0; i < chosen.length; i++) {
      const tpl = chosen[i];
      const recipients = tpl.email.split(',').map((s) => s.trim()).filter(Boolean);
      results.push(...await sendTemplate(tpl, recipients, 'send', userId, BULK_THROTTLE_MS));
      if (i < chosen.length - 1) await sleep(BULK_THROTTLE_MS);
    }
    const sent = results.filter((r) => r.ok).length;
    const allOk = results.every((r) => r.ok);
    return NextResponse.json(
      { success: allOk, results, sent, total: results.length, templates: chosen.length },
      { status: allOk ? 200 : 207, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // ── TEKLİ GÖNDERİM / TEST ──
  const templateId = typeof body?.templateId === 'string' ? body.templateId : '';
  const testTo = typeof body?.testTo === 'string' ? body.testTo.trim() : '';
  const tpl = templates.find((t) => t.id === templateId);
  if (!tpl) {
    return NextResponse.json({ success: false, error: 'Şablon bulunamadı.' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const recipients = action === 'test'
    ? (testTo ? [testTo] : [])
    : tpl.email.split(',').map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json({ success: false, error: action === 'test' ? 'Test adresi gir.' : 'Şablonda alıcı yok.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const results = await sendTemplate(tpl, recipients, action, userId);
  const allOk = results.every((r) => r.ok);
  return NextResponse.json(
    { success: allOk, results, sent: results.filter((r) => r.ok).length, total: results.length },
    { status: allOk ? 200 : 207, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/**
 * GELEN KUTUSU (IMAP) — qratex.co@gmail.com gelen kutusunu çeker, parse eder, DB'ye depolar.
 * Stajyer/görev alıcılarından gelen mailleri otomatik EŞLEŞTİRİR (isFromIntern + matched*).
 *
 * Serverless uyumlu: her sync'te bağlan → son N maili çek → kapat (kalıcı bağlantı yok).
 * Kimlik: IMAP_* env varsa onu, yoksa SMTP_USER/SMTP_PASS'ı kullanır (Gmail'de aynı app-password).
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '@/lib/prisma';
import { getInternTaskEmails } from '@/lib/intern-task-emails';

function envVal(...keys: string[]): string {
  for (const k of keys) {
    const raw = process.env[k];
    if (raw && raw.trim()) {
      let t = raw.trim();
      if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) t = t.slice(1, -1).trim();
      if (t) return t;
    }
  }
  return '';
}

/** IMAP yapılandırması var mı (Gmail app-password SMTP ile aynı). */
export function isInboxConfigured(): boolean {
  const user = envVal('IMAP_USER', 'SMTP_USER');
  const pass = envVal('IMAP_PASS', 'IMAP_PASSWORD', 'SMTP_PASS', 'SMTP_PASSWORD');
  return Boolean(user && pass);
}

function imapConfig() {
  const user = envVal('IMAP_USER', 'SMTP_USER');
  const pass = envVal('IMAP_PASS', 'IMAP_PASSWORD', 'SMTP_PASS', 'SMTP_PASSWORD').replace(/\s+/g, '');
  const host = envVal('IMAP_HOST') || 'imap.gmail.com';
  const port = parseInt(envVal('IMAP_PORT') || '993', 10);
  return { host, port, secure: true, auth: { user, pass }, logger: false as const };
}

export type InboxSyncResult = { ok: true; fetched: number; stored: number; matched: number } | { ok: false; error: string };

/**
 * Gelen kutusunu senkronize eder: son `limit` maili çeker, yenileri DB'ye ekler (idempotent:
 * mailbox+uid unique). Her mail için stajyer eşleştirmesi yapılır. Varsayılan son 40 mail.
 */
export async function syncInbox(limit = 40): Promise<InboxSyncResult> {
  if (!isInboxConfigured()) return { ok: false, error: 'IMAP yapılandırması eksik (IMAP_USER/PASS veya SMTP_USER/PASS).' };

  // Stajyer/görev alıcı adresleri → {name, dept, templateId} eşleştirme haritası.
  const templates = await getInternTaskEmails().catch(() => []);
  const internMap = new Map<string, { name: string; dept: string; templateId: string }>();
  for (const t of templates) {
    for (const e of t.email.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      if (!internMap.has(e)) internMap.set(e, { name: t.recipientName, dept: t.department, templateId: t.id });
    }
  }

  const client = new ImapFlow(imapConfig());
  let fetched = 0, stored = 0, matched = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { messages: true });
      const total = status.messages ?? 0;
      if (total === 0) return { ok: true, fetched: 0, stored: 0, matched: 0 };
      // Son `limit` mail aralığı (sequence).
      const start = Math.max(1, total - limit + 1);
      const range = `${start}:*`;

      for await (const msg of client.fetch(range, { uid: true, envelope: true, source: true })) {
        fetched++;
        const uid = msg.uid;
        // Zaten var mı? (idempotent)
        const exists = await prisma.inboxMessage.findUnique({ where: { mailbox_uid: { mailbox: 'INBOX', uid } }, select: { id: true } }).catch(() => null);
        if (exists) continue;

        // Parse (gövde + başlıklar).
        const parsed = msg.source ? await simpleParser(msg.source).catch(() => null) : null;
        const env = msg.envelope;
        const fromAddr = env?.from?.[0];
        const fromEmail = (fromAddr?.address ?? parsed?.from?.value?.[0]?.address ?? '').toLowerCase();
        const fromName = fromAddr?.name ?? parsed?.from?.value?.[0]?.name ?? '';
        const toEmail = (env?.to?.[0]?.address ?? '').toLowerCase();
        const subject = env?.subject ?? parsed?.subject ?? '';
        // Tarihi GÜVENE al: imapflow bozuk Date başlığında ham string döndürebilir →
        // new Date(...) Invalid Date → Prisma throw → mail sessizce düşerdi. Geçersizse now.
        const rawDate = env?.date ?? parsed?.date ?? new Date();
        const parsedDate = new Date(rawDate as string | Date);
        const sentAt = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        const bodyText = parsed?.text ?? '';
        const bodyHtml = typeof parsed?.html === 'string' ? parsed.html : null;
        const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 200);

        // ── EKLER: gerçek ekleri (inline resim değil) çıkar + R2'ye yükle. R2 yoksa
        //    metadata url'siz saklanır (en azından "şu dosya ekli" görünür). 15MB üstü atlanır.
        let attachmentsMeta: { filename: string; contentType: string; size: number; url: string | null }[] | null = null;
        const rawAtts = Array.isArray(parsed?.attachments) ? parsed!.attachments : [];
        const realAtts = rawAtts.filter((a) => a.contentDisposition !== 'inline' && a.filename);
        if (realAtts.length > 0) {
          const { isR2Configured, uploadToR2 } = await import('@/lib/r2-storage');
          const r2ok = isR2Configured();
          const metas: { filename: string; contentType: string; size: number; url: string | null }[] = [];
          for (const a of realAtts) {
            const filename = a.filename || 'ek';
            const contentType = a.contentType || 'application/octet-stream';
            const content = a.content as Buffer | undefined;
            const size = a.size ?? content?.length ?? 0;
            let url: string | null = null;
            if (r2ok && content && size <= 15 * 1024 * 1024) {
              const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
              const key = `inbox/${uid}-${Date.now()}-${safeName}`;
              url = await uploadToR2(key, content, contentType, `attachment; filename="${safeName}"`).catch(() => null);
            }
            metas.push({ filename, contentType, size, url });
          }
          if (metas.length > 0) attachmentsMeta = metas;
        }

        // Stajyer eşleştirme.
        const m = internMap.get(fromEmail);

        // Sayaçları GERÇEK başarıya bağla (koşulsuz stored++/matched++ yanlış rapor üretiyordu:
        // duplicate/hata yutulup yine de sayılıyordu → durum panelinde şişkin "X yeni" değeri).
        const created = await prisma.inboxMessage.create({
          data: {
            uid, mailbox: 'INBOX', messageId: env?.messageId ?? parsed?.messageId ?? null,
            fromEmail, fromName: fromName || null, toEmail: toEmail || null,
            subject, snippet, bodyText: bodyText || null, bodyHtml,
            sentAt,
            isFromIntern: Boolean(m),
            matchedTemplateId: m?.templateId ?? null,
            matchedRecipientName: m?.name ?? null,
            matchedDepartment: m?.dept ?? null,
            attachments: attachmentsMeta ?? undefined,
          },
        }).then(() => true).catch((e: unknown) => {
          // Duplicate (yarış/idempotency) beklenen — sessiz. Diğer hataları logla (görünür olsun).
          const code = (e as { code?: string })?.code;
          if (code !== 'P2002') console.warn('[inbox] kayıt hatası:', e instanceof Error ? e.message : e);
          return false;
        });
        if (created) { stored++; if (m) matched++; }
      }
    } finally {
      lock.release();
    }
    return { ok: true, fetched, stored, matched };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'IMAP hatası' };
  } finally {
    await client.logout().catch(() => {});
  }
}

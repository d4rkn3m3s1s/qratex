/**
 * GELEN KUTUSU (IMAP) — şirket Gmail gelen kutusunu çeker, parse eder, DB'ye depolar.
 * Stajyer/görev alıcılarından gelen mailleri otomatik EŞLEŞTİRİR (isFromIntern + matched*).
 *
 * UID ARTIMLI senkron (denetim Bulgu 5): her koşu `Settings[inbox_sync_state]` içindeki
 * `{ uidValidity, lastUid }` imlecinden devam eder → iki senkron arasında ne kadar mail gelirse
 * gelsin hiçbiri atlanmaz. Koşu başına parti sınırı + süre bütçesi vardır; kalan olursa
 * `hasMore: true` döner ve imleç yalnız İŞLENEN son UID'e ilerler (bir sonraki koşu devam eder).
 * Kaydedilemeyen mail imleci DURDURUR (sessizce atlanmaz, hata durumda görünür).
 *
 * Serverless uyumlu: her senkronda bağlan → çek → kapat (kalıcı bağlantı yok).
 * Kimlik: IMAP_* env varsa onu, yoksa SMTP_USER/SMTP_PASS'ı kullanır (Gmail'de aynı app-password).
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loadInternTemplatesState } from '@/lib/intern-task-emails';
import { INCOMING_MAILBOXES, MAILBOX_INBOX, type InboxSyncState } from '@/lib/mail-center/inbox-contract';
import { attachmentDisposition } from '@/lib/mail-center/mail-html';
import { applyBounceToSends, extractBounceInfo, extractTrackTokens } from '@/lib/mail-center/bounce';
import { isDeliveryStatusReport, verifyMailAuth } from '@/lib/mail-center/mail-auth';

export const INBOX_SYNC_STATE_KEY = 'inbox_sync_state';
/** İlk kurulumda (imleç ve DB kaydı yokken) geriye dönük çekilecek en fazla mail. */
const INITIAL_BACKFILL = 200;

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

/** Gelen kutusu hesabı (panel başlığında gösterilir; sabit kodlu adres yerine). */
export function inboxAccount(): string | null {
  const user = envVal('IMAP_USER', 'SMTP_USER');
  return user ? user.toLowerCase() : null;
}

function imapConfig() {
  const user = envVal('IMAP_USER', 'SMTP_USER');
  const pass = envVal('IMAP_PASS', 'IMAP_PASSWORD', 'SMTP_PASS', 'SMTP_PASSWORD').replace(/\s+/g, '');
  const host = envVal('IMAP_HOST') || 'imap.gmail.com';
  const port = parseInt(envVal('IMAP_PORT') || '993', 10);
  return { host, port, secure: true, auth: { user, pass }, logger: false as const };
}

export const EMPTY_SYNC_STATE: InboxSyncState = {
  lastRunAt: null,
  ok: null,
  source: null,
  error: null,
  fetched: 0,
  stored: 0,
  matched: 0,
  hasMore: false,
  lastUid: null,
  uidValidity: null,
};

export function parseSyncState(raw: unknown): InboxSyncState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_SYNC_STATE };
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    lastRunAt: typeof o.lastRunAt === 'string' ? o.lastRunAt : null,
    ok: typeof o.ok === 'boolean' ? o.ok : null,
    source: o.source === 'manual' || o.source === 'cron' ? o.source : null,
    error: typeof o.error === 'string' ? o.error : null,
    fetched: num(o.fetched),
    stored: num(o.stored),
    matched: num(o.matched),
    hasMore: o.hasMore === true,
    lastUid: typeof o.lastUid === 'number' && Number.isFinite(o.lastUid) ? o.lastUid : null,
    uidValidity: typeof o.uidValidity === 'string' ? o.uidValidity : null,
  };
}

/** DB okuma hatası YUTULMAZ (çağıran 503'e çevirir). */
export async function readSyncState(): Promise<InboxSyncState> {
  const row = await prisma.settings.findUnique({ where: { key: INBOX_SYNC_STATE_KEY }, select: { value: true } });
  return parseSyncState(row?.value);
}

async function writeSyncState(state: InboxSyncState): Promise<void> {
  const value = state as unknown as Prisma.InputJsonValue;
  await prisma.settings.upsert({
    where: { key: INBOX_SYNC_STATE_KEY },
    update: { value, category: 'email' },
    create: { key: INBOX_SYNC_STATE_KEY, value, category: 'email' },
  });
}

/** Bilinen IMAP hatalarını Türkçe, eyleme dönük açıklamaya çevirir (Bulgu 16). */
export function describeImapError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? '');
  const code = (e as { authenticationFailed?: boolean; code?: string; responseText?: string }) ?? {};
  if (code.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|auth/i.test(raw)) {
    return 'IMAP girişi reddedildi. Gmail uygulama şifresini (IMAP_PASS / SMTP_PASS) yenileyin.';
  }
  if (/ETIMEDOUT|timeout|timed out/i.test(raw)) return 'IMAP sunucusuna bağlanırken zaman aşımı oldu. Birazdan tekrar deneyin.';
  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(raw)) return 'IMAP sunucusuna ulaşılamadı (IMAP_HOST / ağ).';
  return `IMAP hatası: ${raw.slice(0, 200) || 'bilinmeyen hata'}`;
}

export type InboxSyncResult =
  | { ok: true; fetched: number; stored: number; matched: number; hasMore: boolean }
  | { ok: false; error: string };

export type SyncOptions = {
  source?: 'manual' | 'cron';
  /** Koşu başına en fazla işlenecek YENİ mail. */
  maxMessages?: number;
  /** Süre bütçesi (ms) — aşılırsa kalan mailler sonraki koşuya kalır. */
  budgetMs?: number;
};

type AttachmentRecord = { filename: string; contentType: string; size: number; url: string | null };

/**
 * Gelen kutusunu UID artımlı senkronize eder. Eski çağrılar için `syncInbox(40)` biçimi de
 * desteklenir (sayı = koşu başına parti sınırı).
 */
export async function syncInbox(arg: number | SyncOptions = {}): Promise<InboxSyncResult> {
  const opts: SyncOptions = typeof arg === 'number' ? { maxMessages: arg } : arg;
  const source = opts.source ?? 'cron';
  const maxMessages = Math.min(200, Math.max(5, opts.maxMessages ?? 60));
  const deadline = Date.now() + Math.max(5_000, opts.budgetMs ?? 45_000);

  if (!isInboxConfigured()) return { ok: false, error: 'IMAP yapılandırması eksik (IMAP_USER/PASS veya SMTP_USER/PASS).' };

  const prev = await readSyncState();

  // Stajyer/görev alıcı adresleri → eşleştirme haritası (arşivlenmiş şablonlar da eşleşir: geçmiş yanıtlar).
  const internMap = new Map<string, { name: string; dept: string; templateId: string }>();
  try {
    const { templates } = await loadInternTemplatesState();
    for (const t of templates) {
      for (const e of t.email.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        if (!internMap.has(e)) internMap.set(e, { name: t.recipientName, dept: t.department, templateId: t.id });
      }
    }
  } catch (e) {
    console.warn('[inbox] şablonlar okunamadı, stajyer eşleştirmesi bu koşuda atlanıyor:', e instanceof Error ? e.message : e);
  }

  const client = new ImapFlow(imapConfig());
  let fetched = 0;
  let stored = 0;
  let matched = 0;
  let hasMore = false;
  let bouncesLinked = 0;
  let unverified = 0;
  let storeError: string | null = null;
  let nextState: InboxSyncState = { ...prev };

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const mb = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null;
      const uidValidity = mb?.uidValidity != null ? String(mb.uidValidity) : null;
      const validityChanged = Boolean(prev.uidValidity && uidValidity && prev.uidValidity !== uidValidity);

      // İmleç: kayıtlı imleç > DB'deki en büyük UID > son INITIAL_BACKFILL mail.
      let cursor: number;
      if (prev.uidValidity && !validityChanged && prev.lastUid != null) {
        cursor = prev.lastUid;
      } else {
        const dbMax = validityChanged
          ? null
          : (await prisma.inboxMessage.aggregate({ where: { mailbox: { in: [...INCOMING_MAILBOXES] } }, _max: { uid: true } }))._max.uid;
        if (dbMax != null) {
          cursor = dbMax;
        } else {
          const all = (await client.search({ all: true }, { uid: true })) || [];
          const sorted = [...all].sort((a, b) => a - b);
          cursor = sorted.length > INITIAL_BACKFILL ? sorted[sorted.length - INITIAL_BACKFILL - 1] : 0;
        }
      }

      const found = ((await client.search({ uid: `${cursor + 1}:*` }, { uid: true })) || []).filter((u) => u > cursor).sort((a, b) => a - b);
      // Toplu dedupe (N+1 yerine tek sorgu).
      const existing = found.length
        ? new Set(
            (
              await prisma.inboxMessage.findMany({
                where: { mailbox: { in: [...INCOMING_MAILBOXES] }, uid: { in: found } },
                select: { uid: true },
              })
            ).map((r) => r.uid)
          )
        : new Set<number>();
      // UIDVALIDITY değiştiyse eski UID'ler anlamını yitirir → dedupe Message-ID üzerinden yapılır.
      const todo = validityChanged ? found : found.filter((u) => !existing.has(u));
      const batch = todo.slice(0, maxMessages);
      hasMore = todo.length > batch.length;

      const processed = new Set<number>();
      if (batch.length > 0) {
        for await (const msg of client.fetch(batch.join(','), { uid: true, envelope: true, source: true }, { uid: true })) {
          if (Date.now() > deadline) {
            hasMore = true;
            break;
          }
          fetched++;
          const uid = msg.uid;
          const parsed = msg.source ? await simpleParser(msg.source).catch(() => null) : null;
          const env = msg.envelope;
          const ownMessageId = env?.messageId ?? parsed?.messageId ?? null;

          if (validityChanged && ownMessageId) {
            const dup = await prisma.inboxMessage.findFirst({ where: { messageId: ownMessageId }, select: { id: true } });
            if (dup) {
              processed.add(uid);
              continue;
            }
          }

          const fromAddr = env?.from?.[0];
          const fromEmail = (fromAddr?.address ?? parsed?.from?.value?.[0]?.address ?? '').toLowerCase();
          const fromName = fromAddr?.name ?? parsed?.from?.value?.[0]?.name ?? '';
          const toEmail = (env?.to?.[0]?.address ?? '').toLowerCase();
          const subject = env?.subject ?? parsed?.subject ?? '';
          // Tarihi güvene al: bozuk Date başlığı Invalid Date → Prisma throw olmasın.
          const rawDate = env?.date ?? parsed?.date ?? new Date();
          const parsedDate = new Date(rawDate as string | Date);
          const sentAt = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
          const bodyText = parsed?.text ?? '';
          const bodyHtml = typeof parsed?.html === 'string' ? parsed.html : null;
          const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 200);

          const inReplyTo = parsed?.inReplyTo ?? null;
          const refsRaw = parsed?.references;
          const references = Array.isArray(refsRaw) ? refsRaw.join(' ') : (refsRaw ?? null);
          const firstRef = references ? references.trim().split(/\s+/)[0] : null;
          const threadRoot = firstRef || inReplyTo || ownMessageId || null;

          const isBounce =
            /mailer-daemon|postmaster|mail delivery/i.test(fromEmail) ||
            /undeliver|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice|delivery has failed/i.test(subject);

          // EKLER: gerçek ekler R2'ye; disposition izin listesine göre (HTML/SVG asla inline değil).
          let attachmentsMeta: AttachmentRecord[] = [];
          const rawAtts = Array.isArray(parsed?.attachments) ? parsed!.attachments : [];
          const realAtts = rawAtts.filter((a) => a.contentDisposition !== 'inline' && a.filename);
          if (realAtts.length > 0) {
            const { isR2Configured, uploadToR2 } = await import('@/lib/r2-storage');
            const r2ok = isR2Configured();
            attachmentsMeta = [];
            for (const a of realAtts) {
              const filename = a.filename || 'ek';
              const contentType = a.contentType || 'application/octet-stream';
              const content = a.content as Buffer | undefined;
              const size = a.size ?? content?.length ?? 0;
              let url: string | null = null;
              if (r2ok && content && size <= 15 * 1024 * 1024) {
                const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
                const key = `inbox/${uid}-${Date.now()}-${safeName}`;
                // Depoya yazılan tür de izin listesinden türetilir: göndericinin beyan ettiği
                // `text/html`/`image/svg+xml` herkese açık R2 URL'sinde çalıştırılabilir tür
                // olarak durmasın (guvenlik-admin-api B4) — izin dışı her şey octet-stream.
                const stored = attachmentDisposition(contentType, filename);
                url = await uploadToR2(key, content, stored.contentType, stored.disposition).catch(() => null);
              }
              attachmentsMeta.push({ filename, contentType, size, url });
            }
          }

          // Güvenlik: From başlığı uydurulabilir. Otomatik durum değişikliği (stajyer eşleştirme,
          // bounce işaretleme) yalnız KENDİ MX'imizin en üstteki Authentication-Results'ında hizalı
          // SPF/DKIM/DMARC pass varsa. Doğrulanmayan mail yine kaydedilir/gösterilir, eşleşmez.
          const auth = verifyMailAuth(msg.source ?? null, fromEmail);
          if (!auth.verified) unverified++;
          const m = auth.verified ? internMap.get(fromEmail) : undefined;
          const result = await prisma.inboxMessage
            .create({
              data: {
                uid,
                mailbox: MAILBOX_INBOX,
                messageId: ownMessageId,
                fromEmail,
                fromName: fromName || null,
                toEmail: toEmail || null,
                subject,
                snippet,
                bodyText: bodyText || null,
                bodyHtml,
                sentAt,
                isFromIntern: Boolean(m),
                matchedTemplateId: m?.templateId ?? null,
                matchedRecipientName: m?.name ?? null,
                matchedDepartment: m?.dept ?? null,
                attachments: attachmentsMeta as unknown as Prisma.InputJsonValue,
                inReplyTo,
                references,
                threadRoot,
                isBounce,
                // Kalıcı doğrulama izi: UI "doğrulanmamış" rozeti buradan okur. MAIL_AUTHSERV_ID
                // tanımlı değilse değerlendirilemedi → null (rozet "bilinmiyor"), sebep yine yazılır.
                authVerified: process.env.MAIL_AUTHSERV_ID?.trim() ? auth.verified : null,
                authReason: auth.reason.slice(0, 200),
              },
            })
            .then(() => 'created' as const)
            .catch((e: unknown) => {
              const code = (e as { code?: string })?.code;
              if (code === 'P2002') return 'duplicate' as const;
              storeError = `Mail kaydedilemedi (UID ${uid}): ${e instanceof Error ? e.message.slice(0, 160) : 'bilinmeyen hata'}`;
              console.warn('[inbox]', storeError);
              return 'failed' as const;
            });
          if (result === 'failed') break; // imleç bu mailde durur; sonraki koşu yeniden dener
          processed.add(uid);
          if (result === 'created') {
            stored++;
            if (m) matched++;
            // Kalıcı bounce → ilgili stajyer gönderim kaydı "Teslim edilemedi" (arka plan O2).
            // Yalnız: doğrulanmış + gerçek DSN (multipart/report; delivery-status) + gönderdiğimiz
            // mailin izleme token'ı + kalıcı 5.x.x. Eşik ve geri alma bounce.ts'te.
            if (isBounce && auth.verified && isDeliveryStatusReport(msg.source ?? null)) {
              const dsnPart = rawAtts.find((a) => /message\/(delivery-status|global-delivery-status)/i.test(a.contentType || ''));
              const failedHeader = parsed?.headers?.get('x-failed-recipients');
              const info = extractBounceInfo({
                failedRecipientsHeader: typeof failedHeader === 'string' ? failedHeader : null,
                deliveryStatus: dsnPart?.content ? Buffer.from(dsnPart.content as Buffer).toString('utf8') : null,
                bodyText,
                subject,
                ownAddresses: [envVal('IMAP_USER', 'SMTP_USER'), toEmail].filter(Boolean),
              });
              const marked = await applyBounceToSends(info, sentAt, extractTrackTokens(msg.source ?? null));
              if (marked) bouncesLinked += marked;
            }
          }
        }
      }

      // İmleç: işlenmemiş ilk UID'e kadar ilerler (atlama yok). Hepsi işlendiyse bulunan en büyük UID.
      const firstPending = todo.find((u) => !processed.has(u));
      const maxFound = found.length ? found[found.length - 1] : cursor;
      const newCursor = firstPending != null ? Math.max(cursor, firstPending - 1) : Math.max(cursor, maxFound);
      if (firstPending != null) hasMore = true;

      nextState = {
        lastRunAt: new Date().toISOString(),
        ok: storeError == null,
        source,
        error: storeError,
        fetched,
        stored,
        matched,
        hasMore,
        lastUid: newCursor,
        uidValidity,
      };
    } finally {
      lock.release();
    }
  } catch (e) {
    const error = describeImapError(e);
    await writeSyncState({ ...prev, lastRunAt: new Date().toISOString(), ok: false, source, error, fetched, stored, matched }).catch(() => {});
    return { ok: false, error };
  } finally {
    await client.logout().catch(() => {});
  }

  await writeSyncState(nextState);
  if (storeError) return { ok: false, error: storeError };
  if (unverified) console.info(`[inbox] ${unverified} mail kimlik doğrulamasından geçmedi (otomatik eşleştirme/bounce uygulanmadı)`);
  if (bouncesLinked) console.info(`[inbox] ${bouncesLinked} geri dönen gönderim kaydı işaretlendi`);
  return { ok: true, fetched, stored, matched, hasMore };
}

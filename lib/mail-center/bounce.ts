/**
 * Geri dönen (bounce) mail ↔ gönderim kaydı eşleştirmesi (arka plan O2).
 *
 * Senkron, kalıcı (5.x.x) bir teslim hatası bildirimi gördüğünde alıcıyı DSN'den çıkarır ve
 * gönderim kaydını işaretler. Güvenlik (sahte bounce ile gerçek alıcıyı "geçersiz" yapma):
 * - yalnız gerçek DSN (multipart/report; report-type=delivery-status) + kimliği doğrulanmış
 *   gönderen (çağıran `verifyMailAuth` ile denetler),
 * - geri dönen iletide GÖNDERDİĞİMİZ mailin izleme token'ı (X-Qratex-Ref / pixel yolu) olmalı,
 * - tek bounce yalnız not düşer; BOUNCE_THRESHOLD kalıcı bounce'ta durum "error" olur,
 * - admin `revertBounces` ile geri alır.
 *
 * Geçici (4.x.x / "Delay") bildirimler kayda dokunmaz — sağlayıcı yeniden deniyor demektir.
 *
 * ReDoS: girdiler BOUNCE_INPUT_MAX'e kesilir, DSN alanları satır bazlı okunur, regex'lerde iç
 * içe/sınırsız niceleyici yoktur.
 */
import { prisma } from '@/lib/prisma';

/** Sınırlı niceleyiciler: her başlangıç noktasında sabit üst sınırlı geri izleme. */
const EMAIL_RE = /[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/g;
/** Ayrıştırmadan önce her girdinin kesildiği boyut. */
export const BOUNCE_INPUT_MAX = 64 * 1024;
/** Bounce'un ait olabileceği gönderimler için geri bakış penceresi. */
export const BOUNCE_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Alıcı "teslim edilemiyor" sayılmadan önce gereken eşleşmiş kalıcı bounce sayısı. */
export const BOUNCE_THRESHOLD = 2;
/** Eşik sayımı için geri bakış. */
export const BOUNCE_COUNT_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
/** Bounce işaretli kayıtların lastError öneki (geri alma bununla bulur). */
export const BOUNCE_MARK = '[bounce]';
const LEGACY_BOUNCE_MARK = 'Teslim edilemedi (geri döndü)';

const cap = (s: string | null | undefined) => (s ?? '').slice(0, BOUNCE_INPUT_MAX);

export interface BounceInput {
  /** `X-Failed-Recipients` başlığı (Gmail/Exim). */
  failedRecipientsHeader?: string | null;
  /** `message/delivery-status` parçasının metni (RFC 3464). */
  deliveryStatus?: string | null;
  /** Gövde metni (DSN parçası yoksa yedek). */
  bodyText?: string | null;
  subject?: string | null;
  /** Kendi adreslerimiz (gönderen kutusu): alıcı sanılmasın. */
  ownAddresses?: string[];
}

export interface BounceInfo {
  recipients: string[];
  /** true → kalıcı hata (5.x.x / "failed"); false → geçici ("delayed" / 4.x.x). */
  permanent: boolean;
  /** İnsan okunur kısa neden (Status + Diagnostic-Code). */
  reason: string | null;
}

function uniqLower(list: string[], exclude: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of list) {
    let e = raw.trim().toLowerCase();
    if (e.startsWith('<')) e = e.slice(1);
    if (e.endsWith('>')) e = e.slice(0, -1);
    if (!e || e.length > 320 || exclude.has(e) || out.includes(e)) continue;
    if (/^(mailer-daemon|postmaster|no-?reply)@/.test(e)) continue;
    out.push(e);
    if (out.length >= 50) break;
  }
  return out;
}

/** Satır bazlı alan okuma: `Name: value` (büyük/küçük harf duyarsız). Regex yok. */
function fieldValues(text: string, names: string[]): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const raw of text.split('\n')) {
    const i = raw.indexOf(':');
    if (i <= 0 || i > 40) continue;
    const name = raw.slice(0, i).trim().toLowerCase();
    if (names.includes(name)) out.push({ name, value: raw.slice(i + 1).trim() });
  }
  return out;
}

const afterSemi = (v: string) => (v.includes(';') ? v.slice(v.indexOf(';') + 1) : v).trim();

/** Saf: bounce iletisinden başarısız alıcıları, kalıcılığı ve nedeni çıkarır. */
export function extractBounceInfo(input: BounceInput): BounceInfo {
  const exclude = new Set((input.ownAddresses ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean));
  const ds = cap(input.deliveryStatus);
  const fields = fieldValues(ds, ['final-recipient', 'original-recipient', 'status', 'action', 'diagnostic-code']);
  const get = (n: string) => fields.filter((f) => f.name === n).map((f) => f.value);

  // 1) RFC 3464: Final-Recipient / Original-Recipient (en güvenilir) — "rfc822; adres".
  const fromDsn = [...get('final-recipient'), ...get('original-recipient')].map(afterSemi);
  // 2) X-Failed-Recipients başlığı.
  const fromHeader = cap(input.failedRecipientsHeader).split(',');
  let recipients = uniqLower([...fromDsn, ...fromHeader], exclude);
  // 3) Yedek: gövdedeki adresler (yalnız DSN/başlık hiç alıcı vermediyse).
  if (recipients.length === 0) recipients = uniqLower(cap(input.bodyText).match(EMAIL_RE) ?? [], exclude).slice(0, 5);

  const statusRaw = get('status');
  const statusCodes = statusRaw.map((v) => /^([245])\.\d{1,3}\.\d{1,3}/.exec(v)?.[1]).filter((c): c is string => !!c);
  const actions = get('action').map((v) => (/^\w{1,20}/.exec(v)?.[0] ?? '').toLowerCase());
  const subject = cap(input.subject).slice(0, 1000).toLowerCase();
  let permanent: boolean;
  if (statusCodes.length || actions.length) {
    permanent = statusCodes.includes('5') || actions.includes('failed');
  } else {
    // DSN parçası yok: konu "gecikme" diyorsa geçici, aksi halde (undeliverable/failure) kalıcı.
    permanent = !/delay|gecik|will retry|tekrar denen/.test(subject);
  }

  const status = statusRaw.length ? (/^[0-9.]{1,15}/.exec(statusRaw[0])?.[0] ?? null) : null;
  const diagRaw = get('diagnostic-code')[0];
  const diag = diagRaw ? afterSemi(diagRaw) || null : null;
  const reason = [status, diag].filter(Boolean).join(' — ').slice(0, 200) || null;
  return { recipients, permanent, reason };
}

/**
 * Geri dönen iletinin içindeki (DSN'e ekli orijinal başlıklar/gövde) izleme token'larını çıkarır:
 * `X-Qratex-Ref` başlığı ve açılma pixel yolu. Token 18 baytlık rastgele değer (base64url,
 * 24 karakter) — dışarıdan tahmin edilemez.
 */
export function extractTrackTokens(source: Buffer | string | null | undefined): string[] {
  if (!source) return [];
  const max = 256 * 1024;
  const text = typeof source === 'string' ? source.slice(0, max) : source.subarray(0, max).toString('latin1');
  const out = new Set<string>();
  for (const m of text.matchAll(/X-Qratex-Ref:[ \t]{0,8}([A-Za-z0-9_-]{24})(?![A-Za-z0-9_-])/gi)) out.add(m[1]);
  for (const m of text.matchAll(/\/api\/track\/email-open\/([A-Za-z0-9_-]{24})(?![A-Za-z0-9_-])/g)) out.add(m[1]);
  return [...out].slice(0, 20);
}

/**
 * Kalıcı bounce'u, izleme token'ı ile EŞLEŞEN gönderim kaydına işler. Dönüş: "error" durumuna
 * geçen kayıt sayısı. İlk eşleşen bounce yalnız not düşer (`[bounce]` + neden, durum "sent"
 * kalır); alıcının pencere içinde BOUNCE_THRESHOLD eşleşmiş bounce'u olunca kayıtlar "error" olur.
 * Hata fırlatmaz (senkronu bozmaz); hata loglanır.
 */
export async function applyBounceToSends(info: BounceInfo, bouncedAt: Date, tokens: string[]): Promise<number> {
  if (!info.permanent || info.recipients.length === 0 || tokens.length === 0) return 0;
  try {
    const since = new Date(bouncedAt.getTime() - BOUNCE_MATCH_WINDOW_MS);
    const rows = await prisma.internEmailSend.findMany({
      where: {
        token: { in: tokens },
        email: { in: info.recipients, mode: 'insensitive' },
        kind: 'send',
        createdAt: { gte: since, lte: bouncedAt },
      },
      select: { id: true, email: true, lastError: true },
    });
    if (rows.length === 0) return 0;
    const fresh = rows.filter((r) => !(r.lastError ?? '').startsWith(BOUNCE_MARK));
    if (fresh.length) {
      await prisma.internEmailSend.updateMany({
        where: { id: { in: fresh.map((r) => r.id) } },
        data: { lastError: `${BOUNCE_MARK} Teslim edilemedi${info.reason ? `: ${info.reason}` : ''}`.slice(0, 300) },
      });
    }
    let changed = 0;
    const countSince = new Date(bouncedAt.getTime() - BOUNCE_COUNT_WINDOW_MS);
    for (const email of new Set(rows.map((r) => r.email.toLowerCase()))) {
      const marked = await prisma.internEmailSend.findMany({
        where: {
          email: { equals: email, mode: 'insensitive' },
          kind: 'send',
          createdAt: { gte: countSince },
          lastError: { startsWith: BOUNCE_MARK },
        },
        select: { id: true },
      });
      if (marked.length < BOUNCE_THRESHOLD) continue;
      const res = await prisma.internEmailSend.updateMany({
        where: { id: { in: marked.map((r) => r.id) }, status: 'sent' },
        data: { status: 'error' },
      });
      changed += res.count;
    }
    return changed;
  } catch (e) {
    console.warn('[inbox] bounce gönderim kaydına işlenemedi:', e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Admin geri alma: alıcının bounce işaretlerini kaldırır, kayıtları "sent"e döndürür. */
export async function revertBounces(email: string): Promise<number> {
  const res = await prisma.internEmailSend.updateMany({
    where: {
      email: { equals: email.trim(), mode: 'insensitive' },
      OR: [{ lastError: { startsWith: BOUNCE_MARK } }, { lastError: { startsWith: LEGACY_BOUNCE_MARK } }],
    },
    data: { status: 'sent', lastError: null },
  });
  return res.count;
}

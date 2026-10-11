/**
 * Geri dönen (bounce) mail ↔ gönderim kaydı eşleştirmesi (arka plan O2).
 *
 * Eskiden `isBounce` yalnız gelen kutusunda bir etiketti; stajyer gönderim kaydı (`InternEmailSend`)
 * "gönderildi" olarak kalıyor, panel geri dönen maili "Gitti" gösteriyordu. Artık senkron,
 * kalıcı (5.x.x) bir teslim hatası bildirimi gördüğünde alıcıyı DSN'den çıkarır ve o alıcıya
 * bounce'tan önceki son 7 gün içindeki son başarılı gönderimi `error` + "Teslim edilemedi"
 * olarak işaretler. "Yalnız yeni alıcılara gönder" akışı bu alıcıyı yeniden aday sayar.
 *
 * Geçici (4.x.x / "Delay") bildirimler kayda dokunmaz — sağlayıcı yeniden deniyor demektir.
 */
import { prisma } from '@/lib/prisma';

const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Bounce'un ait olabileceği gönderimler için geri bakış penceresi. */
export const BOUNCE_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
    const e = raw.trim().toLowerCase().replace(/^<|>$/g, '');
    if (!e || exclude.has(e) || out.includes(e)) continue;
    if (/^(mailer-daemon|postmaster|no-?reply)@/.test(e)) continue;
    out.push(e);
  }
  return out;
}

/** Saf: bounce iletisinden başarısız alıcıları, kalıcılığı ve nedeni çıkarır. */
export function extractBounceInfo(input: BounceInput): BounceInfo {
  const exclude = new Set((input.ownAddresses ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean));
  const ds = input.deliveryStatus ?? '';

  // 1) RFC 3464: Final-Recipient / Original-Recipient (en güvenilir).
  const fromDsn: string[] = [];
  for (const m of ds.matchAll(/^(?:Final|Original)-Recipient:\s*[^;]*;\s*(.+)$/gim)) fromDsn.push(m[1]);
  // 2) X-Failed-Recipients başlığı.
  const fromHeader = (input.failedRecipientsHeader ?? '').split(',');
  let recipients = uniqLower([...fromDsn, ...fromHeader], exclude);
  // 3) Yedek: gövdedeki adresler (yalnız DSN/başlık hiç alıcı vermediyse).
  if (recipients.length === 0) recipients = uniqLower((input.bodyText ?? '').match(EMAIL_RE) ?? [], exclude).slice(0, 5);

  const statusCodes = [...ds.matchAll(/^Status:\s*([245])\.\d{1,3}\.\d{1,3}/gim)].map((m) => m[1]);
  const actions = [...ds.matchAll(/^Action:\s*(\w+)/gim)].map((m) => m[1].toLowerCase());
  const subject = (input.subject ?? '').toLowerCase();
  let permanent: boolean;
  if (statusCodes.length || actions.length) {
    permanent = statusCodes.includes('5') || actions.includes('failed');
  } else {
    // DSN parçası yok: konu "gecikme" diyorsa geçici, aksi halde (undeliverable/failure) kalıcı.
    permanent = !/delay|gecik|will retry|tekrar denen/.test(subject);
  }

  const status = ds.match(/^Status:\s*([0-9.]+)/im)?.[1] ?? null;
  const diag = ds.match(/^Diagnostic-Code:\s*(?:[^;]*;\s*)?(.+)$/im)?.[1]?.trim() ?? null;
  const reason = [status, diag].filter(Boolean).join(' — ').slice(0, 200) || null;
  return { recipients, permanent, reason };
}

/**
 * Kalıcı bounce'u son başarılı stajyer gönderimine işler. Dönüş: işaretlenen kayıt sayısı.
 * Hata fırlatmaz (senkronu bozmaz); hata loglanır.
 */
export async function applyBounceToSends(info: BounceInfo, bouncedAt: Date): Promise<number> {
  if (!info.permanent || info.recipients.length === 0) return 0;
  try {
    const since = new Date(bouncedAt.getTime() - BOUNCE_MATCH_WINDOW_MS);
    const rows = await prisma.internEmailSend.findMany({
      where: {
        email: { in: info.recipients, mode: 'insensitive' },
        status: 'sent',
        kind: 'send',
        createdAt: { gte: since, lte: bouncedAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true },
    });
    // Alıcı başına yalnız EN SON gönderim (bounce ona aittir; eski başarılı kayıtlar korunur).
    const latest = new Map<string, string>();
    for (const r of rows) if (!latest.has(r.email.toLowerCase())) latest.set(r.email.toLowerCase(), r.id);
    if (latest.size === 0) return 0;
    const res = await prisma.internEmailSend.updateMany({
      where: { id: { in: [...latest.values()] }, status: 'sent' },
      data: {
        status: 'error',
        lastError: `Teslim edilemedi (geri döndü)${info.reason ? `: ${info.reason}` : ''}`.slice(0, 300),
      },
    });
    return res.count;
  } catch (e) {
    console.warn('[inbox] bounce gönderim kaydına işlenemedi:', e instanceof Error ? e.message : e);
    return 0;
  }
}

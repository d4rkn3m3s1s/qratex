/**
 * Olay-tabanlı transactional e-posta tetikleyicileri.
 *
 * Mevcut altyapı (lib/mail-sender + lib/transactional-email) hazırdı ama yalnızca
 * auth akışları (doğrulama, şifre sıfırlama) e-posta atıyordu; ürün olayları
 * (bayi yanıtı, rozet vb.) yalnızca in-app bildirim üretiyordu. Müşteri uygulamada
 * değilse bu olayları hiç görmüyordu → düşük geri-dönüş. Bu modül o döngüyü kapatır.
 *
 * Tasarım ilkeleri:
 * - Opt-out'a saygı: kullanıcının Settings.notifications.<prefKey> tercihi false ise
 *   gönderilmez (güvenlik/KVKK hariç — onlar lib/email içinde, buradan geçmez).
 * - Mail yapılandırılmamışsa sessiz no-op (isMailConfigured).
 * - Ateşle-unut: çağıran isteği bloklamaz; hatalar yutulup loglanır.
 * - GÜVENLİ VARSAYILAN (P0-35): gövde satırları HAM HTML DEĞİLDİR. Her metin parçası
 *   `escapeEmailText` ile kaçışlanır ve otomatik bağlantıya dönüşmesin diye kırılır; vurgu
 *   gerekiyorsa `{ strong: '...' }` parçası kullanılır. Bayi adı / müşteri yorumu / LLM çıktısı
 *   Qratex markalı e-postaya bağlantı ya da etiket sokamaz.
 */
import { prisma } from '@/lib/prisma';
import { isMailConfigured, sendTransactionalEmail } from '@/lib/mail-sender';
import {
  buildTransactionalEmailHtml,
  buildTransactionalPlainText,
  getTransactionalEmailLogoUrl,
} from '@/lib/transactional-email';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { escapeEmailText } from '@/lib/security/escape-html';

/** E-posta tercih anahtarı — Settings.notifications içindeki boolean alan. */
type EmailPrefKey = 'emailReply' | 'emailBadge';

/**
 * Kullanıcının e-posta tercihini Settings JSON'undan okur. Varsayılan: açık (true).
 * Mevcut customer/settings akışıyla aynı kaynağı kullanır (ikinci bir opt-out alanı
 * eklemeden tutarlılık).
 */
async function emailPrefEnabled(userId: string, prefKey: EmailPrefKey): Promise<boolean> {
  try {
    const row = await prisma.settings.findUnique({ where: { key: `user_settings_${userId}` } });
    const raw = (row?.value as Record<string, unknown> | null) ?? null;
    const notif = (raw?.notifications as Record<string, unknown> | undefined) ?? undefined;
    const val = notif?.[prefKey];
    // Tanımsız → varsayılan açık; yalnızca açıkça false ise kapalı.
    return val !== false;
  } catch {
    return true;
  }
}

/**
 * Satır içi parça: düz metin (kaçışlanır) ya da vurgulu düz metin. HAM HTML KABUL EDİLMEZ —
 * tip düzeyinde de bir "html" kaçış kapısı bilinçli olarak yok.
 */
export type EmailInline = string | { strong: string; maxLength?: number } | { text: string; maxLength?: number };
/** Bir gövde paragrafı: tek düz metin ya da parçaların dizisi. */
export type EmailLine = string | EmailInline[];

interface EventEmailInput {
  userId: string;
  prefKey: EmailPrefKey;
  /** Düz metin; satır sonu / kontrol karakterleri temizlenir (başlık enjeksiyonu yok). */
  subject: string;
  /** Düz metin; şablonda kaçışlanır. */
  heading: string;
  bodyLines: EmailLine[];
  ctaLabel?: string;
  ctaPath?: string; // origin'e göre göreli (ör. /customer/feedbacks)
}

const ZWSP_CHAR = '\u200B';

function inlineRaw(part: EmailInline): string {
  if (typeof part === 'string') return part;
  const raw = 'strong' in part ? part.strong : part.text;
  const max = part.maxLength;
  if (typeof max === 'number' && max >= 0 && raw.length > max) return `${raw.slice(0, max).trimEnd()}…`;
  return raw;
}

function inlineHtml(part: EmailInline): string {
  if (typeof part === 'string') return escapeEmailText(part);
  if ('strong' in part) return `<strong>${escapeEmailText(part.strong, { maxLength: part.maxLength })}</strong>`;
  return escapeEmailText(part.text, { maxLength: part.maxLength });
}

/** Gövde satırlarını güvenli HTML'e çevirir (her parça kaçışlı). Testler için dışa açık. */
export function renderEmailLinesHtml(lines: EmailLine[]): string {
  return lines
    .map((line) => {
      const inner = typeof line === 'string' ? escapeEmailText(line) : line.map(inlineHtml).join('');
      return `<p style="margin:0 0 12px;">${inner}</p>`;
    })
    .join('');
}

/**
 * Düz metin gövdesi. HTML yok ama düz metin istemcileri de `alan.com` / `a@b.com` desenlerini
 * bağlantıya çevirir → aynı otomatik bağlantı kırma burada görünmez boşlukla yapılır.
 */
export function renderEmailLinesText(lines: EmailLine[]): string[] {
  return lines.map((line) => {
    const raw = typeof line === 'string' ? line : line.map(inlineRaw).join('');
    return sanitizePlain(raw)
      .replace(/:\/\//g, `:${ZWSP_CHAR}//`)
      .replace(/([A-Za-z0-9\u00C0-\u024F])\.(?=[A-Za-z0-9\u00C0-\u024F])/g, `$1.${ZWSP_CHAR}`)
      .replace(/@/g, `@${ZWSP_CHAR}`);
  });
}

function sanitizePlain(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** E-posta konusu: tek satır, kontrol karakteri yok, makul uzunluk. */
export function sanitizeEmailSubject(subject: string, maxLength = 160): string {
  // eslint-disable-next-line no-control-regex
  const flat = subject.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1).trimEnd()}…` : flat;
}

/**
 * Bir kullanıcıya olay e-postası gönderir (opt-out + mail-config kontrollü).
 * Döner: gönderildi mi (true) yoksa atlandı/başarısız mı (false). Asla fırlatmaz.
 */
export async function sendEventEmail(input: EventEmailInput): Promise<boolean> {
  try {
    if (!isMailConfigured()) return false;

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!user?.email) return false;
    if (!(await emailPrefEnabled(input.userId, input.prefKey))) return false;

    const origin = getPublicAppOrigin();
    const logoUrl = getTransactionalEmailLogoUrl(origin);
    const cta =
      input.ctaLabel && input.ctaPath
        ? { label: input.ctaLabel, href: `${origin}${input.ctaPath}` }
        : undefined;

    const heading = sanitizeEmailSubject(input.heading, 200);
    const html = buildTransactionalEmailHtml({
      heading,
      bodyHtml: renderEmailLinesHtml(input.bodyLines),
      cta,
      logoUrl,
      brandLinkHref: origin,
    });
    const text = buildTransactionalPlainText({
      heading,
      bodyLines: renderEmailLinesText(input.bodyLines),
      cta,
    });

    const res = await sendTransactionalEmail({
      to: user.email,
      subject: sanitizeEmailSubject(input.subject),
      html,
      text,
    });
    return res.ok;
  } catch (err) {
    console.error('[NOTIFY_EMAIL] gönderim başarısız:', err);
    return false;
  }
}

/**
 * Bayi bir geri bildirime yanıt verdiğinde müşteriye e-posta.
 * Çağrı yeri: dealer-reply ve auto-reply yolları (ateşle-unut).
 */
export async function emailDealerReply(params: {
  customerId: string;
  dealerName: string;
  feedbackSnippet?: string | null;
}): Promise<void> {
  // dealerName bayinin serbest metin işletme adı, snippet müşteri metni: ikisi de kaçışlanır
  // ve otomatik bağlantıya dönüşmez (oltalama bağlantısı sokulamaz).
  const dealerName = (params.dealerName || '').trim() || 'İşletme';
  const bodyLines: EmailLine[] = [
    [{ strong: dealerName, maxLength: 120 }, ' geri bildiriminize yanıt verdi.'],
  ];
  const snippet = params.feedbackSnippet?.trim();
  if (snippet) {
    bodyLines.push(['Geri bildiriminiz: “', { text: snippet, maxLength: 160 }, '”']);
  }
  bodyLines.push('Yanıtı görmek için panelinize göz atın.');

  await sendEventEmail({
    userId: params.customerId,
    prefKey: 'emailReply',
    subject: 'Geri bildiriminize yanıt geldi',
    heading: 'İşletme size yanıt verdi',
    bodyLines,
    ctaLabel: 'Yanıtı gör',
    ctaPath: '/customer/feedbacks',
  });
}

/**
 * Müşteri yeni bir rozet kazandığında e-posta (kutlama + geri-dönüş).
 */
export async function emailBadgeEarned(params: {
  userId: string;
  badgeName: string;
}): Promise<void> {
  await sendEventEmail({
    userId: params.userId,
    prefKey: 'emailBadge',
    subject: `Yeni rozet kazandın: ${params.badgeName} 🏆`,
    heading: 'Tebrikler, yeni bir rozet!',
    bodyLines: [
      [{ strong: params.badgeName, maxLength: 120 }, ' rozetini kazandın.'],
      'Koleksiyonunu görmek ve daha fazlasını açmak için devam et.',
    ],
    ctaLabel: 'Rozetlerim',
    ctaPath: '/customer/badges',
  });
}

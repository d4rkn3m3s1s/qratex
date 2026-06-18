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
 */
import { prisma } from '@/lib/prisma';
import { isMailConfigured, sendTransactionalEmail } from '@/lib/mail-sender';
import {
  buildTransactionalEmailHtml,
  buildTransactionalPlainText,
  getTransactionalEmailLogoUrl,
} from '@/lib/transactional-email';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

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

interface EventEmailInput {
  userId: string;
  prefKey: EmailPrefKey;
  subject: string;
  heading: string;
  bodyLines: string[];
  ctaLabel?: string;
  ctaPath?: string; // origin'e göre göreli (ör. /customer/feedbacks)
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

    const html = buildTransactionalEmailHtml({
      heading: input.heading,
      bodyHtml: input.bodyLines.map((l) => `<p style="margin:0 0 12px;">${l}</p>`).join(''),
      cta,
      logoUrl,
      brandLinkHref: origin,
    });
    const text = buildTransactionalPlainText({
      heading: input.heading,
      bodyLines: input.bodyLines,
      cta,
    });

    const res = await sendTransactionalEmail({
      to: user.email,
      subject: input.subject,
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
  const bodyLines = [
    `<strong>${params.dealerName}</strong> geri bildiriminize yanıt verdi.`,
  ];
  if (params.feedbackSnippet) {
    bodyLines.push(`Geri bildiriminiz: "${params.feedbackSnippet.slice(0, 160)}"`);
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
      `<strong>${params.badgeName}</strong> rozetini kazandın.`,
      'Koleksiyonunu görmek ve daha fazlasını açmak için devam et.',
    ],
    ctaLabel: 'Rozetlerim',
    ctaPath: '/customer/badges',
  });
}

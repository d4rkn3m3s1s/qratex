/**
 * KVKK başvuru e-postaları (P0-34): makbuz ve sonuç bildirimleri. Alıcı HER ZAMAN talebin
 * kayıtlı hesap e-postasıdır (istemciden gelen adres kabul edilmez). Tür ve tarih Türkçe
 * etiketle yazılır; kullanıcı kaynaklı her metin kaçışlanır.
 */
import { sendTransactionalEmail } from '@/lib/mail-sender';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import {
  buildTransactionalEmailHtml,
  buildTransactionalPlainText,
  escapeEmailHtml,
  getTransactionalEmailLogoUrl,
} from '@/lib/transactional-email';
import { DSR_TYPE_LABELS, isDsrType } from '@/lib/dsr-workflow';

const fromEmail = process.env.EMAIL_FROM || 'QRATEX <onboarding@resend.dev>';

export type DsrOutcome = 'received' | 'access_ready' | 'erased' | 'rectified' | 'objection_resolved' | 'rejected';

function typeLabel(type: string): string {
  return isDsrType(type) ? DSR_TYPE_LABELS[type] : 'KVKK başvurusu';
}

function formatTrDate(d: Date): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(d);
}

const COPY: Record<DsrOutcome, { subject: string; heading: string; body: string }> = {
  received: {
    subject: 'Başvurunuz alındı',
    heading: 'Başvurunuz alındı',
    body: 'KVKK kapsamındaki başvurunuz kaydedildi. Yasal süre içinde sonuçlandırıp size bu adresten bilgi vereceğiz.',
  },
  access_ready: {
    subject: 'Veri paketiniz hazır',
    heading: 'Veri paketiniz hazır',
    body: 'Erişim talebiniz sonuçlandı. Kişisel verilerinizin kopyasını hesabınızdaki Ayarlar › Gizlilik bölümünden indirebilirsiniz. Güvenliğiniz için paket e-postaya eklenmez; yalnız giriş yaptığınızda indirilebilir.',
  },
  erased: {
    subject: 'Silme talebiniz yerine getirildi',
    heading: 'Verileriniz silindi',
    body: 'Hesabınıza bağlı kişisel verileriniz silindi ya da geri döndürülemez biçimde anonimleştirildi. Açık oturumlarınız kapatıldı. Yasal saklama yükümlülüğü olan kayıtlar (ör. başvurunuzun kendisi) yalnız bu süre boyunca saklanır.',
  },
  rectified: {
    subject: 'Düzeltme talebiniz sonuçlandı',
    heading: 'Düzeltme yapıldı',
    body: 'Verilerinizin düzeltilmesi talebiniz sonuçlandı. Yapılan işlemin özeti aşağıdadır.',
  },
  objection_resolved: {
    subject: 'İtirazınız sonuçlandı',
    heading: 'İtirazınız sonuçlandı',
    body: 'İtirazınız değerlendirildi. Sonucun gerekçesi aşağıdadır.',
  },
  rejected: {
    subject: 'Başvurunuz hakkında karar',
    heading: 'Başvurunuz reddedildi',
    body: 'Başvurunuz aşağıdaki gerekçeyle reddedildi. Bu karara karşı 30 gün içinde Kişisel Verileri Koruma Kurulu’na şikâyette bulunabilirsiniz (KVKK m.14).',
  },
};

export interface DsrEmailPayload {
  requestId: string;
  type: string;
  createdAt: Date;
  /** Gerekçe / özet (rectified, objection_resolved, rejected). */
  reason?: string | null;
}

export async function sendDsrEmail(
  to: string,
  outcome: DsrOutcome,
  payload: DsrEmailPayload
): Promise<{ ok: boolean; error?: string }> {
  const copy = COPY[outcome];
  const ref = payload.requestId.slice(0, 8).toUpperCase();
  const siteUrl = getPublicAppOrigin();
  const settingsUrl = `${siteUrl.replace(/\/$/, '')}/customer/settings?tab=privacy`;
  const rows: Array<[string, string]> = [
    ['Referans', payload.requestId],
    ['Tür', typeLabel(payload.type)],
    ['Başvuru tarihi', formatTrDate(payload.createdAt)],
  ];
  if (payload.reason && (outcome === 'rejected' || outcome === 'rectified' || outcome === 'objection_resolved')) {
    rows.push([outcome === 'rejected' ? 'Gerekçe' : 'Açıklama', payload.reason.trim().slice(0, 2000)]);
  }
  const extraHtml = `<table class="tx-email-card" role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;">
    ${rows
      .map(
        ([label, value], i) =>
          `<tr><td style="padding:14px 16px;${i < rows.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : ''}"><span class="tx-email-card-label" style="color:#64748b;font-size:13px;">${escapeEmailHtml(label)}</span><br><strong style="font-size:15px;word-break:break-word;white-space:pre-wrap;">${escapeEmailHtml(value)}</strong></td></tr>`
      )
      .join('')}
  </table>`;
  const cta =
    outcome === 'access_ready' || outcome === 'received'
      ? { href: settingsUrl, label: outcome === 'access_ready' ? 'Veri paketimi indir' : 'Başvurumu görüntüle' }
      : undefined;
  const footnote = 'Bu başvuruyu siz yapmadıysanız bu e-postayı yanıtlayarak bize bildirin.';
  const html = buildTransactionalEmailHtml({
    heading: copy.heading,
    bodyHtml: `<p>Merhaba,</p><p>${escapeEmailHtml(copy.body)}</p>`,
    extraHtml,
    ...(cta ? { cta } : {}),
    footnoteHtml: escapeEmailHtml(footnote),
    logoUrl: getTransactionalEmailLogoUrl(siteUrl),
    brandLinkHref: siteUrl,
  });
  const text = buildTransactionalPlainText({
    heading: copy.heading,
    bodyLines: ['Merhaba,', copy.body, ...rows.map(([l, v]) => `${l}: ${v}`)],
    ...(cta ? { cta } : {}),
    footnoteLines: [footnote],
  });
  const result = await sendTransactionalEmail({
    to,
    subject: `QRATEX — ${copy.subject} (${ref})`,
    html,
    text,
    from: fromEmail,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

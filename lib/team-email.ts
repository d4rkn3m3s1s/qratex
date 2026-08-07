import { sendTransactionalEmail } from '@/lib/mail-sender';
import { buildTransactionalEmailHtml, buildTransactionalPlainText, getTransactionalEmailLogoUrl } from '@/lib/transactional-email';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

const from = process.env.EMAIL_FROM || 'QRateX <onboarding@resend.dev>';

/**
 * Tüm ekip maillerinde ortak logo başlığı (koyu gradient şerit üstünde açık logo).
 * localhost origin'de görsel dış istemcilerce yüklenemez → logoyu atla, metin marka başlığı kullanılır.
 */
function brandHeader() {
  const origin = getPublicAppOrigin();
  const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin);
  if (isLocal) return {}; // logoUrl yok → şablon "QRateX" metin başlığını gösterir
  return { logoUrl: getTransactionalEmailLogoUrl(origin), brandLinkHref: origin };
}

/**
 * KARAKTER ROZETİ "hazır" maili. Kullanıcının gizli barı dolup yeni bir karakter
 * açılabilir hale geldiğinde gönderilir. SÜRPRİZ KORUNUR: hangi karakter veya kategori
 * olduğu ASLA söylenmez — sadece "gizemli kürende bir karakter belirdi, açıp keşfet".
 * CTA → /customer/badges. Mail yapılandırılmamışsa (SMTP/RESEND yok) sessizce atlar.
 */
export async function sendCharacterReadyEmail(opts: {
  to: string; name?: string | null;
}): Promise<void> {
  try {
    const origin = getPublicAppOrigin();
    const link = `${origin}/customer/badges`;

    // Gizemli, merak uyandıran gövde — hiçbir spoiler yok.
    const teaser = `<div style="margin:16px 0;padding:18px 20px;border-radius:14px;background:linear-gradient(135deg,#1a0a2e 0%,#3b0764 55%,#7e22ce 100%);text-align:center;">
      <div style="font-size:34px;line-height:1;margin-bottom:8px;">🔮</div>
      <strong style="display:block;font-size:16px;color:#f5e8ff;">Gizemli kürende bir karakter belirdi</strong>
      <span style="display:block;margin-top:6px;font-size:13.5px;color:#d8b4fe;">Kim olduğu senin yorumlarına saklı — açıp keşfetmen için seni bekliyor.</span>
    </div>`;

    const bodyHtml = [
      opts.name ? `Merhaba ${opts.name},` : 'Merhaba,',
      'Harika haber! Yazdığın yorumlar yeni bir <strong>karakter rozetini</strong> açığa çıkardı. ✨',
      teaser,
      'Küreyi aç, karakterinin kim olduğunu gör ve koleksiyonuna ekle.',
    ].join('<br>');

    const html = buildTransactionalEmailHtml({
      ...brandHeader(),
      heading: '✨ Yeni bir karakterin hazır!',
      bodyHtml,
      cta: { href: link, label: 'Küreyi Aç ve Keşfet' },
      footnoteHtml: 'Bu bildirim QRateX karakter rozeti sisteminden gönderildi.',
    });
    const text = buildTransactionalPlainText({
      heading: 'Yeni bir karakterin hazır!',
      bodyLines: [
        opts.name ? `Merhaba ${opts.name},` : 'Merhaba,',
        'Yorumların yeni bir karakter rozetini açığa çıkardı.',
        'Gizemli kürende bir karakter belirdi — kim olduğunu açıp keşfet!',
      ],
      cta: { href: link, label: 'Küreyi Aç ve Keşfet' },
    });
    await sendTransactionalEmail({ to: opts.to, subject: '✨ Yeni bir karakterin hazır!', html, text, from });
  } catch { /* mail hatası akışı bozmasın */ }
}

/** Görev atanınca atanan kişiye bildirim maili. RESEND yoksa sessizce atlar. */
export async function sendTaskAssignedEmail(opts: {
  to: string; assigneeName?: string | null; taskTitle: string; priority?: string;
  dueAt?: Date | null; description?: string | null;
}): Promise<void> {
  try {
    const origin = getPublicAppOrigin();
    const link = `${origin}/customer/ekip`;
    const prio = opts.priority === 'high' ? 'Yüksek' : opts.priority === 'low' ? 'Düşük' : 'Orta';
    const prioEmoji = opts.priority === 'high' ? '🔴' : opts.priority === 'low' ? '⚪' : '🟠';

    // Bitiş tarihi + kalan gün (vurgulu).
    let dueLine = '';
    let dueText = '';
    if (opts.dueAt) {
      const dueDate = new Date(opts.dueAt);
      const dueStr = dueDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      const days = Math.ceil((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      const remain = days < 0 ? `${Math.abs(days)} gün gecikti` : days === 0 ? 'BUGÜN son gün' : `${days} gün kaldı`;
      const color = days < 0 ? '#dc2626' : days <= 2 ? '#ea580c' : '#0ea5e9';
      dueLine = `<div style="margin:14px 0;padding:12px 16px;border-radius:10px;background:${color}14;border-left:4px solid ${color};">
        <span style="font-size:13px;color:#64748b;">⏰ Bitiş tarihi</span><br>
        <strong style="font-size:16px;color:${color};">${dueStr}</strong>
        <span style="font-size:13px;color:${color};font-weight:600;"> · ${remain}</span></div>`;
      dueText = `Bitiş: ${dueStr} (${remain})`;
    }

    // Görev açıklaması (varsa).
    const descBlock = opts.description?.trim()
      ? `<div style="margin:14px 0;padding:12px 16px;border-radius:10px;background:#f1f5f9;color:#334155;font-size:14px;line-height:1.5;"><strong style="color:#0f172a;">📝 Açıklama</strong><br>${opts.description.trim().replace(/\n/g, '<br>')}</div>`
      : '';

    // "Nasıl başlarım?" adım adım yönerge.
    const howto = `<div style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#0ea5e912;">
      <strong style="color:#0369a1;font-size:14px;">🚀 Nasıl başlarım?</strong>
      <ol style="margin:8px 0 0;padding-left:20px;color:#334155;font-size:13.5px;line-height:1.7;">
        <li>Aşağıdaki <strong>Görevi Aç</strong> butonuna tıkla.</li>
        <li>Görev kartındaki turuncu <strong>“Başla”</strong> butonuna bas — görev “Devam Ediyor”a geçer.</li>
        <li>İşi bitirince <strong>ne yaptığını not olarak yaz veya bir belge ekle</strong> (zorunlu).</li>
        <li><strong>“Onaya gönder”</strong>e bas — yönetici onaylayınca görev tamamlanır.</li>
      </ol></div>`;

    const bodyHtml = [
      opts.assigneeName ? `Merhaba ${opts.assigneeName},` : 'Merhaba,',
      `Sana yeni bir görev atandı:`,
      `<strong style="font-size:17px;color:#0f172a;">${opts.taskTitle}</strong>`,
      `<span style="font-size:13px;color:#64748b;">${prioEmoji} Öncelik: ${prio}</span>`,
      descBlock,
      dueLine,
      howto,
    ].filter(Boolean).join('<br>');

    const html = buildTransactionalEmailHtml({
      ...brandHeader(),
      heading: 'Yeni Görev Atandı 📋', bodyHtml,
      cta: { href: link, label: 'Görevi Aç ve Başla' },
      footnoteHtml: 'Bu bildirim QRateX ekip yönetiminden gönderildi.',
    });
    const text = buildTransactionalPlainText({
      heading: 'Yeni Görev Atandı',
      bodyLines: [
        opts.assigneeName ? `Merhaba ${opts.assigneeName},` : 'Merhaba,',
        `Yeni görev: ${opts.taskTitle}`,
        `${prioEmoji} Öncelik: ${prio}`,
        ...(opts.description?.trim() ? [`Açıklama: ${opts.description.trim()}`] : []),
        ...(dueText ? [dueText] : []),
        'Nasıl başlarım: Görevi Aç → "Başla" → çalış → not/belge ekle → "Onaya gönder".',
      ],
      cta: { href: link, label: 'Görevi Aç ve Başla' },
    });
    await sendTransactionalEmail({ to: opts.to, subject: `Yeni görev: ${opts.taskTitle}`, html, text, from });
  } catch { /* mail hatası akışı bozmasın */ }
}

/** Yorumda @bahsedilen kişiye bildirim maili. */
export async function sendMentionEmail(opts: {
  to: string; mentionName?: string | null; byName?: string | null; taskTitle: string; commentText: string;
}): Promise<void> {
  try {
    const origin = getPublicAppOrigin();
    const link = `${origin}/customer/ekip`;
    const snippet = opts.commentText.length > 240 ? `${opts.commentText.slice(0, 240)}…` : opts.commentText;
    const bodyLines = [
      opts.mentionName ? `Merhaba ${opts.mentionName},` : 'Merhaba,',
      `<strong>${opts.byName || 'Bir ekip üyesi'}</strong> seni bir görev yorumunda etiketledi.`,
      `Görev: <strong>${opts.taskTitle}</strong>`,
      `“${snippet}”`,
    ];
    const html = buildTransactionalEmailHtml({
      ...brandHeader(),
      heading: 'Bir Yorumda Etiketlendin 💬', bodyHtml: bodyLines.join('<br>'),
      cta: { href: link, label: 'Yoruma Git' },
      footnoteHtml: 'QRateX ekip yönetimi bildirimi.',
    });
    const text = buildTransactionalPlainText({
      heading: 'Bir Yorumda Etiketlendin',
      bodyLines: [`${opts.byName || 'Biri'} seni "${opts.taskTitle}" görevinde etiketledi.`, snippet],
      cta: { href: link, label: 'Yoruma Git' },
    });
    await sendTransactionalEmail({ to: opts.to, subject: `💬 ${opts.byName || 'Biri'} seni etiketledi: ${opts.taskTitle}`, html, text, from });
  } catch { /* sessiz */ }
}

/** Haftalık hatırlatma: kişinin açık (tamamlanmamış) görevlerini özetler. */
export async function sendWeeklyReminderEmail(opts: {
  to: string; name?: string | null;
  openTasks: { title: string; priority: string; dueAt?: Date | string | null }[];
  /** Yönetici ise: onayında bekleyen (status='review') görevler. Verilmezse blok çıkmaz. */
  pendingApprovals?: { title: string; submittedByName?: string | null }[];
}): Promise<void> {
  if (opts.openTasks.length === 0 && !(opts.pendingApprovals && opts.pendingApprovals.length > 0)) return;
  try {
    const origin = getPublicAppOrigin();
    const link = `${origin}/customer/ekip`;

    // Açık görev listesi + (varsa) bitiş tarihine göre kalan gün rozeti.
    const list = opts.openTasks.slice(0, 10).map((t) => {
      if (!t.dueAt) return `• ${t.title}`;
      const dueDate = new Date(t.dueAt);
      if (Number.isNaN(dueDate.getTime())) return `• ${t.title}`;
      const days = Math.ceil((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      const remain = days < 0 ? `${Math.abs(days)} gün gecikti` : days === 0 ? 'BUGÜN' : `${days} gün kaldı`;
      const color = days < 0 ? '#dc2626' : days <= 2 ? '#ea580c' : '#0ea5e9';
      const badge = `<span style="margin-left:6px;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:600;color:${color};background:${color}14;">${remain}</span>`;
      return `• ${t.title}${badge}`;
    }).join('<br>');

    // "Görevi nasıl ilerletirim?" kısa rehber (atama mailindeki howto ile aynı görsel dil).
    const howto = `<div style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#0ea5e912;">
      <strong style="color:#0369a1;font-size:14px;">🔄 Görevi nasıl ilerletirim?</strong>
      <p style="margin:8px 0 0;color:#334155;font-size:13.5px;line-height:1.7;">
        Görevi Aç → turuncu <strong>“Başla”</strong> → çalış → <strong>not veya belge ekle</strong> (zorunlu) → <strong>“Onaya gönder”</strong> → yönetici onaylayınca tamamlanır.
      </p></div>`;

    // Yönetici için: onayında bekleyen görevler bloğu (opsiyonel).
    let approvalsBlock = '';
    let approvalsTextLine = '';
    if (opts.pendingApprovals && opts.pendingApprovals.length > 0) {
      const pend = opts.pendingApprovals;
      const pendList = pend.slice(0, 10).map((p) => {
        const by = p.submittedByName ? ` <span style="font-size:12px;color:#64748b;">— ${p.submittedByName}</span>` : '';
        return `• ${p.title}${by}`;
      }).join('<br>');
      approvalsBlock = `<div style="margin:16px 0;padding:14px 16px;border-radius:10px;background:#f59e0b12;border-left:4px solid #f59e0b;">
        <strong style="color:#b45309;font-size:14px;">⏳ Onayını bekleyenler</strong><br>
        <span style="font-size:13px;color:#64748b;">Onayını bekleyen <strong>${pend.length}</strong> görev var:</span><br>
        <div style="margin-top:6px;color:#334155;font-size:13.5px;line-height:1.7;">${pendList}</div></div>`;
      approvalsTextLine = `Onayını bekleyen ${pend.length} görev var.`;
    }

    const bodyLines = [
      opts.name ? `Merhaba ${opts.name},` : 'Merhaba,',
      opts.openTasks.length > 0 ? `Bu hafta <strong>${opts.openTasks.length}</strong> açık görevin var:` : '',
      list,
      howto,
      approvalsBlock,
    ].filter(Boolean);
    const html = buildTransactionalEmailHtml({
      ...brandHeader(),
      heading: 'Haftalık Görev Hatırlatması ⏰', bodyHtml: bodyLines.join("<br>"),
      cta: { href: link, label: 'Panoyu Aç' },
      footnoteHtml: 'Haftalık ekip özeti — QRateX.',
    });
    const text = buildTransactionalPlainText({
      heading: 'Haftalık Hatırlatma',
      bodyLines: [
        ...(opts.openTasks.length > 0 ? [`${opts.openTasks.length} açık görev`] : []),
        'Görevi nasıl ilerletirim: Görevi Aç → "Başla" → çalış → not/belge ekle → "Onaya gönder" → yönetici onaylar.',
        ...(approvalsTextLine ? [approvalsTextLine] : []),
      ],
      cta: { href: link, label: 'Panoyu Aç' },
    });
    const subject = opts.openTasks.length > 0
      ? `⏰ ${opts.openTasks.length} açık görevin var`
      : `⏳ Onayını bekleyen ${opts.pendingApprovals?.length ?? 0} görev var`;
    await sendTransactionalEmail({ to: opts.to, subject, html, text, from });
  } catch { /* sessiz */ }
}

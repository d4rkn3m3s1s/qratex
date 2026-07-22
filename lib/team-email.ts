import { sendTransactionalEmail } from '@/lib/mail-sender';
import { buildTransactionalEmailHtml, buildTransactionalPlainText } from '@/lib/transactional-email';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

const from = process.env.EMAIL_FROM || 'QRateX <onboarding@resend.dev>';

/** Görev atanınca atanan kişiye bildirim maili. RESEND yoksa sessizce atlar. */
export async function sendTaskAssignedEmail(opts: {
  to: string; assigneeName?: string | null; taskTitle: string; priority?: string; dueAt?: Date | null;
}): Promise<void> {
  try {
    const origin = getPublicAppOrigin();
    const link = `${origin}/admin/ekip`;
    const prio = opts.priority === 'high' ? 'Yüksek' : opts.priority === 'low' ? 'Düşük' : 'Orta';
    const due = opts.dueAt ? new Date(opts.dueAt).toLocaleDateString('tr-TR') : null;
    const bodyLines = [
      opts.assigneeName ? `Merhaba ${opts.assigneeName},` : 'Merhaba,',
      `Sana yeni bir görev atandı: <strong>${opts.taskTitle}</strong>`,
      `Öncelik: ${prio}${due ? ` · Bitiş: ${due}` : ''}`,
    ];
    const html = buildTransactionalEmailHtml({
      heading: 'Yeni Görev Atandı 📋', bodyHtml: bodyLines.join("<br>"),
      cta: { href: link, label: 'Görevi Aç' },
      footnoteHtml: 'Bu bildirim QRateX ekip yönetiminden gönderildi.',
    });
    const text = buildTransactionalPlainText({ heading: 'Yeni Görev Atandı', bodyLines, cta: { href: link, label: 'Görevi Aç' } });
    await sendTransactionalEmail({ to: opts.to, subject: `Yeni görev: ${opts.taskTitle}`, html, text, from });
  } catch { /* mail hatası akışı bozmasın */ }
}

/** Haftalık hatırlatma: kişinin açık (tamamlanmamış) görevlerini özetler. */
export async function sendWeeklyReminderEmail(opts: {
  to: string; name?: string | null; openTasks: { title: string; priority: string }[];
}): Promise<void> {
  if (opts.openTasks.length === 0) return;
  try {
    const origin = getPublicAppOrigin();
    const link = `${origin}/admin/ekip`;
    const list = opts.openTasks.slice(0, 10).map((t) => `• ${t.title}`).join('<br>');
    const bodyLines = [
      opts.name ? `Merhaba ${opts.name},` : 'Merhaba,',
      `Bu hafta <strong>${opts.openTasks.length}</strong> açık görevin var:`,
      list,
    ];
    const html = buildTransactionalEmailHtml({
      heading: 'Haftalık Görev Hatırlatması ⏰', bodyHtml: bodyLines.join("<br>"),
      cta: { href: link, label: 'Panoyu Aç' },
      footnoteHtml: 'Haftalık ekip özeti — QRateX.',
    });
    const text = buildTransactionalPlainText({ heading: 'Haftalık Hatırlatma', bodyLines: [`${opts.openTasks.length} açık görev`], cta: { href: link, label: 'Panoyu Aç' } });
    await sendTransactionalEmail({ to: opts.to, subject: `⏰ ${opts.openTasks.length} açık görevin var`, html, text, from });
  } catch { /* sessiz */ }
}

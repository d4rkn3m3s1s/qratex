import { prisma } from '@/lib/prisma';

/**
 * Ekip modülü in-app bildirimleri. Mevcut Notification modeli + /api/notifications
 * altyapısını kullanır (zil ikonu). Hata akışı bozmasın diye hepsi try/catch.
 * E-posta bildirimleriyle (lib/team-email.ts) paralel çalışır.
 */

type NotifyType = 'info' | 'success' | 'warning' | 'error';

async function createNotification(opts: {
  userId: string; title: string; message: string; type?: NotifyType; data?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: opts.userId,
        title: opts.title,
        message: opts.message,
        type: opts.type ?? 'info',
        data: (opts.data ?? {}) as object,
      },
    });
  } catch { /* bildirim hatası akışı bozmasın */ }
}

/**
 * Görev tamamlandığında (üye done'a taşıyınca) YÖNETİCİLERE + görevi oluşturana bildirim.
 * Tamamlayan kişinin kendisine bildirim gitmez.
 */
export async function notifyTaskCompleted(opts: {
  taskId: string; taskTitle: string; completedById: string; completedByName?: string | null; createdById?: string | null;
}): Promise<void> {
  try {
    // Bildirim alacaklar: tüm ADMIN'ler + ekip yöneticileri + görevi oluşturan (tamamlayan hariç, tekilleştir).
    const managers = await prisma.user.findMany({
      where: { OR: [{ role: 'ADMIN' }, { adminTeamRole: 'yonetici' }] },
      select: { id: true },
    });
    const recipientIds = new Set<string>(managers.map((m) => m.id));
    if (opts.createdById) recipientIds.add(opts.createdById);
    recipientIds.delete(opts.completedById); // tamamlayana bildirim yok

    await Promise.all([...recipientIds].map((userId) => createNotification({
      userId,
      title: '✅ Görev tamamlandı',
      message: `${opts.completedByName || 'Bir üye'} "${opts.taskTitle}" görevini tamamladı`,
      type: 'success',
      data: { kind: 'team-task-completed', taskId: opts.taskId, href: `/admin/ekip?task=${opts.taskId}` },
    })));
  } catch { /* sessiz */ }
}

/**
 * Görev ONAYA gönderildiğinde (üye review'e taşıyınca) YÖNETİCİLERE + oluşturana bildirim.
 * Onay kuyruğuna düştüğünü haber verir. Gönderen kişiye bildirim gitmez.
 */
export async function notifyTaskSubmittedForReview(opts: {
  taskId: string; taskTitle: string; submittedById: string; submittedByName?: string | null; createdById?: string | null;
}): Promise<void> {
  try {
    const managers = await prisma.user.findMany({
      where: { OR: [{ role: 'ADMIN' }, { adminTeamRole: 'yonetici' }] },
      select: { id: true },
    });
    const recipientIds = new Set<string>(managers.map((m) => m.id));
    if (opts.createdById) recipientIds.add(opts.createdById);
    recipientIds.delete(opts.submittedById);

    await Promise.all([...recipientIds].map((userId) => createNotification({
      userId,
      title: '⏳ Onay bekliyor',
      message: `${opts.submittedByName || 'Bir üye'} "${opts.taskTitle}" görevini onaya gönderdi`,
      type: 'warning',
      data: { kind: 'team-task-review', taskId: opts.taskId, href: `/admin/ekip?task=${opts.taskId}` },
    })));
  } catch { /* sessiz */ }
}

/**
 * Yönetici görevi onayladı/reddetti — görevi ONAYA GÖNDEREN üyeye bildirim.
 * approved=true → onaylandı (done), false → reddedildi (devam'a döndü).
 */
export async function notifyTaskReviewed(opts: {
  userId: string; taskId: string; taskTitle: string; approved: boolean; byName?: string | null; note?: string | null;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: opts.approved ? '✅ Görevin onaylandı' : '↩️ Görevin revizyona döndü',
    message: opts.approved
      ? `"${opts.taskTitle}" onaylandı ve tamamlandı`
      : `"${opts.taskTitle}" reddedildi${opts.note ? `: ${opts.note.slice(0, 80)}` : ' — düzeltip tekrar gönder'}`,
    type: opts.approved ? 'success' : 'warning',
    data: { kind: 'team-task-reviewed', taskId: opts.taskId, href: `/customer/ekip?task=${opts.taskId}` },
  });
}

/** Görev atandığında atanan kişiye in-app bildirim. */
export async function notifyTaskAssigned(opts: {
  userId: string; taskId: string; taskTitle: string; priority?: string;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: '📋 Yeni görev atandı',
    message: opts.taskTitle,
    type: opts.priority === 'high' ? 'warning' : 'info',
    data: { kind: 'team-task-assigned', taskId: opts.taskId, href: `/customer/ekip?task=${opts.taskId}` },
  });
}

/** Yorumda @bahsedilen kişiye in-app bildirim. */
export async function notifyMention(opts: {
  userId: string; taskId: string; taskTitle: string; byName?: string | null;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: '💬 Bir yorumda etiketlendin',
    message: `${opts.byName || 'Bir ekip üyesi'} · ${opts.taskTitle}`,
    type: 'info',
    data: { kind: 'team-task-mention', taskId: opts.taskId, href: `/customer/ekip?task=${opts.taskId}` },
  });
}

/**
 * Görev BİTİŞ TARİHİNDE OTOMATİK ONAYLANDI (yönetici zamanında onaylamadı).
 * Sessizce olmasın: hem onaya gönderen üyeye hem yöneticilere bildirir.
 */
export async function notifyTaskAutoApproved(opts: {
  taskId: string; taskTitle: string; assignedToId?: string | null;
}): Promise<void> {
  try {
    const managers = await prisma.user.findMany({
      where: { OR: [{ role: 'ADMIN' }, { adminTeamRole: 'yonetici' }] },
      select: { id: true },
    });
    const recipientIds = new Set<string>(managers.map((m) => m.id));
    if (opts.assignedToId) recipientIds.add(opts.assignedToId);

    await Promise.all([...recipientIds].map((userId) => createNotification({
      userId,
      title: '⏱️ Görev otomatik onaylandı',
      message: `"${opts.taskTitle}" bitiş tarihi geçtiği için otomatik onaylandı (yönetici onayı gelmedi)`,
      type: 'warning',
      data: { kind: 'team-task-auto-approved', taskId: opts.taskId, href: `/admin/ekip?task=${opts.taskId}` },
    })));
  } catch { /* sessiz */ }
}

/** Yaklaşan/geçmiş bitiş tarihi hatırlatması (cron'dan). */
export async function notifyDeadline(opts: {
  userId: string; taskId: string; taskTitle: string; overdue: boolean;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: opts.overdue ? '⏰ Görev süresi doldu' : '⏳ Görev yaklaşıyor',
    message: opts.taskTitle,
    type: opts.overdue ? 'error' : 'warning',
    data: { kind: 'team-task-deadline', taskId: opts.taskId, overdue: opts.overdue, href: `/customer/ekip?task=${opts.taskId}` },
  });
}

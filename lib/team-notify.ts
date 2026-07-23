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

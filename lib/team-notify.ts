import { prisma } from '@/lib/prisma';
import { isChannelEnabled, kindToGroup } from '@/lib/notification-prefs';
import { teamTaskHref } from '@/lib/team/href';

/**
 * Ekip modülü in-app bildirimleri. Mevcut Notification modeli + /api/notifications
 * altyapısını kullanır (zil ikonu). Hata akışı bozmasın diye hepsi try/catch.
 * E-posta bildirimleriyle (lib/team-email.ts) paralel çalışır.
 *
 * Bağlantılar ALICININ rolüne göre çözülür (denetim Y3): ADMIN → /admin/ekip, diğerleri →
 * /customer/ekip. Eskiden sabit yazıldığı için ekip yöneticisi (CUSTOMER) onay bildirimine
 * tıklayınca ana sayfasına düşüyordu.
 */

type NotifyType = 'info' | 'success' | 'warning' | 'error';

/**
 * Tek in-app bildirim yaratıcısı — TÜM notify* fonksiyonları buradan geçer.
 * TERCİH KONTROLÜ: data.kind → grup (kindToGroup) → kullanıcının 'app' kanalı KAPALIYSA
 * bildirim YARATILMAZ. DB hatasında fail-open (bildirim atılır).
 */
async function createNotification(opts: {
  userId: string;
  title: string;
  message: string;
  type?: NotifyType;
  taskId?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const kind = typeof opts.data?.kind === 'string' ? (opts.data.kind as string) : null;
    const group = kindToGroup(kind);

    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { role: true, notificationPrefs: true },
    });
    const prefs = user?.notificationPrefs ?? null;
    const appEnabled = group ? isChannelEnabled(prefs, group, 'app') : true;
    const pushEnabled = group ? isChannelEnabled(prefs, group, 'push') : true;
    const href = opts.taskId ? teamTaskHref(user?.role ?? null, opts.taskId) : undefined;
    const data = { ...(opts.data ?? {}), ...(opts.taskId ? { taskId: opts.taskId } : {}), ...(href ? { href } : {}) };

    if (appEnabled) {
      await prisma.notification.create({
        data: {
          userId: opts.userId,
          title: opts.title,
          message: opts.message,
          type: opts.type ?? 'info',
          data: data as object,
        },
      });
    }

    if (pushEnabled) {
      const { sendPushNotification } = await import('@/lib/push');
      void sendPushNotification(opts.userId, opts.title, opts.message, href).catch(() => {});
    }
  } catch {
    /* bildirim hatası akışı bozmasın */
  }
}

/** Ekip yöneticileri (ADMIN + ekip rolü yönetici). */
async function managerIds(): Promise<Set<string>> {
  const managers = await prisma.user.findMany({
    where: { OR: [{ role: 'ADMIN' }, { adminTeamRole: 'yonetici' }] },
    select: { id: true },
  });
  return new Set(managers.map((m) => m.id));
}

/** Görev tamamlandığında (onaylandı) yöneticilere + oluşturana bildirim. Onaylayana gitmez. */
export async function notifyTaskCompleted(opts: {
  taskId: string;
  taskTitle: string;
  completedById: string;
  completedByName?: string | null;
  createdById?: string | null;
}): Promise<void> {
  try {
    const recipients = await managerIds();
    if (opts.createdById) recipients.add(opts.createdById);
    recipients.delete(opts.completedById);
    await Promise.all(
      [...recipients].map((userId) =>
        createNotification({
          userId,
          title: '✅ Görev tamamlandı',
          message: `${opts.completedByName || 'Bir yönetici'} "${opts.taskTitle}" görevini onayladı`,
          type: 'success',
          taskId: opts.taskId,
          data: { kind: 'team-task-completed' },
        })
      )
    );
  } catch {
    /* sessiz */
  }
}

/** Görev ONAYA gönderildiğinde yöneticilere + oluşturana bildirim (gönderene gitmez). */
export async function notifyTaskSubmittedForReview(opts: {
  taskId: string;
  taskTitle: string;
  submittedById: string;
  submittedByName?: string | null;
  createdById?: string | null;
}): Promise<void> {
  try {
    const recipients = await managerIds();
    if (opts.createdById) recipients.add(opts.createdById);
    recipients.delete(opts.submittedById);
    await Promise.all(
      [...recipients].map((userId) =>
        createNotification({
          userId,
          title: '⏳ Onay bekliyor',
          message: `${opts.submittedByName || 'Bir üye'} "${opts.taskTitle}" görevini onaya gönderdi`,
          type: 'warning',
          taskId: opts.taskId,
          data: { kind: 'team-task-review' },
        })
      )
    );
  } catch {
    /* sessiz */
  }
}

/** Yönetici onayladı/reddetti — atanan üyeye bildirim. */
export async function notifyTaskReviewed(opts: {
  userId: string;
  taskId: string;
  taskTitle: string;
  approved: boolean;
  byName?: string | null;
  note?: string | null;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: opts.approved ? '✅ Görevin onaylandı' : '↩️ Görevin revizyona döndü',
    message: opts.approved
      ? `"${opts.taskTitle}" onaylandı ve tamamlandı`
      : `"${opts.taskTitle}" için revizyon istendi${opts.note ? `: ${opts.note.slice(0, 80)}` : ' — düzeltip tekrar gönder'}`,
    type: opts.approved ? 'success' : 'warning',
    taskId: opts.taskId,
    data: { kind: 'team-task-reviewed' },
  });
}

/** Onaylanmış görev yönetici tarafından yeniden açıldı — atanana bildirim. */
export async function notifyTaskReopened(opts: {
  userId: string;
  taskId: string;
  taskTitle: string;
  byName?: string | null;
  note?: string | null;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: '🔁 Görev yeniden açıldı',
    message: `"${opts.taskTitle}"${opts.note ? `: ${opts.note.slice(0, 80)}` : ''}`,
    type: 'warning',
    taskId: opts.taskId,
    data: { kind: 'team-task-reviewed' },
  });
}

/** Görev atandığında atanan kişiye in-app bildirim. */
export async function notifyTaskAssigned(opts: {
  userId: string;
  taskId: string;
  taskTitle: string;
  priority?: string;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: '📋 Yeni görev atandı',
    message: opts.taskTitle,
    type: opts.priority === 'high' ? 'warning' : 'info',
    taskId: opts.taskId,
    data: { kind: 'team-task-assigned' },
  });
}

/** Yorumda @bahsedilen kişiye in-app bildirim. */
export async function notifyMention(opts: {
  userId: string;
  taskId: string;
  taskTitle: string;
  byName?: string | null;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: '💬 Bir yorumda etiketlendin',
    message: `${opts.byName || 'Bir ekip üyesi'} · ${opts.taskTitle}`,
    type: 'info',
    taskId: opts.taskId,
    data: { kind: 'team-task-mention' },
  });
}

/**
 * Görev bitiş tarihinden sonra OTOMATİK ONAYLANDI (kanıt + bağımlılık kontrolünden geçerek).
 * Sessiz olmasın: atanan üyeye ve yöneticilere bildirir.
 */
export async function notifyTaskAutoApproved(opts: {
  taskId: string;
  taskTitle: string;
  assignedToId?: string | null;
}): Promise<void> {
  try {
    const recipients = await managerIds();
    if (opts.assignedToId) recipients.add(opts.assignedToId);
    await Promise.all(
      [...recipients].map((userId) =>
        createNotification({
          userId,
          title: '⏱️ Görev otomatik onaylandı',
          message: `"${opts.taskTitle}" bitiş gününden bir gün sonra hâlâ onay bekliyordu; kanıtı olduğu için sistem onayladı`,
          type: 'warning',
          taskId: opts.taskId,
          data: { kind: 'team-task-auto-approved' },
        })
      )
    );
  } catch {
    /* sessiz */
  }
}

/** Onay bekleyen görev bitiş gününü geçti ama kanıtı/bağımlılığı eksik: yöneticilere tek uyarı. */
export async function notifyReviewLate(opts: { taskId: string; taskTitle: string; reason: string }): Promise<void> {
  try {
    const recipients = await managerIds();
    await Promise.all(
      [...recipients].map((userId) =>
        createNotification({
          userId,
          title: '⚠️ Onay gecikti',
          message: `"${opts.taskTitle}" bitiş gününü geçti ama otomatik onaylanmadı: ${opts.reason}`,
          type: 'warning',
          taskId: opts.taskId,
          data: { kind: 'team-task-review' },
        })
      )
    );
  } catch {
    /* sessiz */
  }
}

/** Yaklaşan/geçmiş bitiş tarihi hatırlatması (bakım cron'undan; görev başına bir kez). */
export async function notifyDeadline(opts: {
  userId: string;
  taskId: string;
  taskTitle: string;
  overdue: boolean;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: opts.overdue ? '⏰ Görevin bitiş günü geçti' : '⏳ Görevin yarın ya da bugün bitiyor',
    message: opts.taskTitle,
    type: opts.overdue ? 'error' : 'warning',
    taskId: opts.taskId,
    data: { kind: 'team-task-deadline', overdue: opts.overdue },
  });
}

/** Otomasyon kuralı "bildir" aksiyonu — yöneticilere. */
export async function notifyAutomation(opts: { ruleName: string; taskId: string; taskTitle: string }): Promise<void> {
  try {
    const recipients = await managerIds();
    await Promise.all(
      [...recipients].map((userId) =>
        createNotification({
          userId,
          title: `⚙️ Otomasyon: ${opts.ruleName}`,
          message: opts.taskTitle,
          type: 'info',
          taskId: opts.taskId,
          data: { kind: 'team-automation' },
        })
      )
    );
  } catch {
    /* sessiz */
  }
}

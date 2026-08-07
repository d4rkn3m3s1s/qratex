import { prisma } from '@/lib/prisma';
import { isChannelEnabled, kindToGroup, type NotificationChannel } from '@/lib/notification-prefs';

/**
 * SUNUCU TARAFI bildirim-tercihi yardımcıları (DB erişir → client-safe DEĞİL).
 * Saf grup tanımları ve eşlemeler lib/notification-prefs.ts içindedir (client-safe).
 *
 * Buradaki fonksiyonlar bir kullanıcının User.notificationPrefs alanını okuyup
 * bir grup+kanal için bildirim gönderilmeli mi diye karar verir. VARSAYILAN AÇIK
 * (prefs yoksa her şey gönderilir → mevcut davranış korunur).
 */

/** Bir kullanıcının notificationPrefs JSON'unu getirir (yoksa null). Hata → null (fail-open). */
export async function getUserNotificationPrefs(userId: string): Promise<unknown> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    return user?.notificationPrefs ?? null;
  } catch {
    return null; // DB hatasında tercih uygulanmaz → bildirim gönderilir (fail-open)
  }
}

/**
 * Bir kullanıcı için, bir `data.kind`'ın düştüğü grubun belirtilen kanalı açık mı?
 * Tek DB okuması yapar. Grup yoksa (bilinmeyen kind) → daima true (her zaman gönder).
 */
export async function isUserChannelEnabled(
  userId: string,
  kind: string | null | undefined,
  channel: NotificationChannel,
): Promise<boolean> {
  const group = kindToGroup(kind);
  if (!group) return true; // gruplanmamış kind → tercih uygulanmaz
  const prefs = await getUserNotificationPrefs(userId);
  return isChannelEnabled(prefs, group, channel);
}

/**
 * Tercihe SAYGILI in-app bildirim yaratıcı. data.kind → grup → app kanalı açıksa
 * Notification kaydı oluşturur; kapalıysa hiç yaratmaz. Hata akışı bozmaz (try/catch).
 *
 * NOT: Çoğu in-app bildirim team-notify.ts içindeki createNotification üzerinden geçer;
 * o fonksiyon zaten tercih kontrolü yapar. Bu helper, doğrudan prisma.notification.create
 * kullanan (team-notify dışı) noktalar için tek-satır alternatiftir.
 */
export async function notifyRespectingPrefs(opts: {
  userId: string;
  title: string;
  message: string;
  type?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const kind = typeof opts.data?.kind === 'string' ? (opts.data.kind as string) : null;
    const allowed = await isUserChannelEnabled(opts.userId, kind, 'app');
    if (!allowed) return; // kullanıcı bu tür için uygulama içi bildirimi kapatmış
    await prisma.notification.create({
      data: {
        userId: opts.userId,
        title: opts.title,
        message: opts.message,
        type: opts.type ?? 'info',
        data: (opts.data ?? {}) as object,
      },
    });
  } catch {
    /* bildirim hatası akışı bozmasın */
  }
}

import { prisma } from '@/lib/prisma';
import { NATIVE_ENDPOINT_PREFIX } from '@/lib/push-native';

/**
 * Oturum iptalinde (sessionVersion artışı: şifre değişimi/sıfırlama, "tüm oturumları kapat",
 * askı, rol değişimi…) kullanıcının NATIVE cihaz jetonlarını geçersiz sayar. Jeton cihazdır ve
 * oturuma bağlıdır: iptal edilmiş bir oturumun cihazına bildirim (kişisel veri) gitmemeli.
 * Cihaz yeniden giriş yapıp izin verdiğinde POST /api/push/native ile yeniden etkinleşir.
 * Best-effort: hata fırlatmaz (çağıran işlemi bozmaz).
 */
export async function revokeNativePushTokens(userId: string): Promise<void> {
  try {
    await prisma.pushSubscription.updateMany({
      where: { userId, isActive: true, endpoint: { startsWith: NATIVE_ENDPOINT_PREFIX } },
      data: { isActive: false },
    });
  } catch (e) {
    console.error('[push-native] oturum iptalinde jeton devre dışı bırakılamadı:', e);
  }
}

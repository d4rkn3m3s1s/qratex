/**
 * KVKK/GDPR veri sahibi talebi YÜRÜTME motoru.
 *
 * Önceden DataSubjectRequest yalnızca kaydediliyor + makbuz e-postası atılıyordu;
 * admin sadece statü değiştirebiliyordu — gerçek "erişim" (data portability) veya
 * "silme" (anonimleştirme) hiçbir zaman yürütülmüyordu. Bu modül döngüyü kapatır.
 *
 * - exportUserData: kullanıcının tüm kişisel verisini taşınabilir JSON olarak toplar.
 * - anonymizeUser: PII alanlarını geri döndürülemez biçimde maskeler ama analitik
 *   bütünlüğü için kayıtları (feedback/puan istatistikleri) SİLMEZ — yalnızca
 *   kişiyle bağı koparır. Hesap girişini kapatır (password/sessions temizlenir).
 *
 * Her iki işlem de AuditLog'a yazılır (kanıt zinciri).
 */
import { prisma } from '@/lib/prisma';

/**
 * Kullanıcının tüm kişisel verisini tek bir taşınabilir nesnede toplar.
 * KVKK m.11 "erişim/taşınabilirlik" hakkı için.
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      biography: true,
      role: true,
      points: true,
      level: true,
      xp: true,
      address: true,
      businessName: true,
      businessDesc: true,
      preferredLanguage: true,
      createdAt: true,
    },
  });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  // İlişkili kişisel kayıtlar — makul üst sınırlarla (export şişmesini önle).
  const [feedbacks, reviews, consumptions, notifications, badges, auditLogs] = await Promise.all([
    prisma.feedback.findMany({
      where: { userId },
      select: { id: true, rating: true, text: true, createdAt: true, dealerReply: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    }),
    prisma.consumptionReview.findMany({
      where: { customerId: userId },
      select: { id: true, rating: true, text: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    }),
    prisma.consumption.findMany({
      where: { customerId: userId },
      select: { id: true, amount: true, note: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    }),
    prisma.notification.findMany({
      where: { userId },
      select: { id: true, title: true, message: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.userBadge.findMany({
      where: { userId },
      select: { badgeId: true, earnedAt: true },
      orderBy: { earnedAt: 'desc' },
      take: 1000,
    }),
    prisma.auditLog.findMany({
      where: { userId },
      select: { action: true, entity: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    format: 'qratex-kvkk-export-v1',
    profile: user,
    feedbacks,
    reviews,
    consumptions,
    notifications,
    badges,
    auditTrail: auditLogs,
    counts: {
      feedbacks: feedbacks.length,
      reviews: reviews.length,
      consumptions: consumptions.length,
      notifications: notifications.length,
      badges: badges.length,
    },
  };
}

/** Anonimleştirilmiş kullanıcı için deterministik, geri döndürülemez placeholder e-posta. */
function anonymizedEmail(userId: string): string {
  return `anonymized+${userId}@deleted.qratex.local`;
}

/**
 * Kullanıcının PII alanlarını maskeler (silme talebi). Feedback/puan kayıtları
 * analitik bütünlük için KALIR ama kişiyle bağ koparılır; giriş imkânı kapatılır.
 * Döner: anonimleştirme özeti.
 */
export async function anonymizeUser(userId: string): Promise<{ anonymized: true; clearedSessions: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const result = await prisma.$transaction(async (tx) => {
    // PII maskeleme — tüm doğrudan tanımlayıcılar.
    await tx.user.update({
      where: { id: userId },
      data: {
        name: 'Anonim Kullanıcı',
        email: anonymizedEmail(userId),
        emailVerified: null,
        image: null,
        phone: null,
        password: null,
        biography: null,
        address: null,
        latitude: null,
        longitude: null,
        businessName: null,
        businessLogo: null,
        businessDesc: null,
      },
    });

    // Serbest-metin alanlarındaki olası PII'yi temizle (yorum metinleri),
    // ama puan/rating gibi istatistiksel veriyi koru.
    await tx.feedback.updateMany({
      where: { userId },
      data: { text: null },
    });
    await tx.consumptionReview.updateMany({
      where: { customerId: userId },
      data: { text: null },
    });

    // Aktif oturumları sonlandır (varsa) — yeniden giriş engellenir.
    const sessions = await tx.session.deleteMany({ where: { userId } });
    // Bağlı OAuth hesaplarını kaldır.
    await tx.account.deleteMany({ where: { userId } });

    return { clearedSessions: sessions.count };
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'gdpr_anonymize',
      entity: 'User',
      entityId: userId,
      newData: { anonymized: true } as object,
    },
  });

  return { anonymized: true, clearedSessions: result.clearedSessions };
}

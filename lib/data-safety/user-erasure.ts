/**
 * Kullanıcı silme (= anonimleştirme) ön kontrolü ve etki önizlemesi — P0-25.
 *
 * Admin tekil silme, admin toplu silme ve "hesabımı sil" aynı kuralları buradan okur:
 *  - Hiçbir yol `user.delete` çağırmaz; yürütme `anonymizeUser` (lib/gdpr-core.ts).
 *  - Engelleyiciler (onayla da aşılamaz):
 *      · kendi hesabını admin panelinden silme,
 *      · YÖNETİCİ hesabı (önce rol düşürülmeli; ADMIN'in ADMIN'i silip izini yok etmesi kapalı),
 *      · faturalanabilir Stripe aboneliği (önce iptal; aksi hâlde anonim hesaptan ücret alınır).
 *  - Etki satırları (onay ister): yorum, tüketim, QR, puan.
 */
import { prisma } from '@/lib/prisma';
import { BLOCKING_SUBSCRIPTION_STATUSES } from '@/lib/billing-core';
import type { DeletionImpact } from '@/lib/data-safety/archive';

export interface ErasureTarget {
  id: string;
  name: string | null;
  email: string;
  role: string;
  points: number;
  anonymizedAt: Date | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
}

export interface ErasurePreview {
  target: ErasureTarget;
  impact: DeletionImpact;
  alreadyAnonymized: boolean;
}

export const ERASURE_BLOCKERS = {
  self: 'Kendi hesabınızı yönetim panelinden silemezsiniz.',
  admin: 'Yönetici hesapları silinemez. Önce kullanıcının rolünü değiştirin; denetim izi korunur.',
  subscription:
    'Bu işletmenin faturalanabilir bir aboneliği var. Önce aboneliği iptal edin; aksi hâlde anonimleştirilen hesaptan ücret alınmaya devam eder.',
} as const;

const TARGET_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  points: true,
  anonymizedAt: true,
  stripeSubscriptionId: true,
  subscriptionStatus: true,
} as const;

/**
 * Etki önizlemesini üretir. Kullanıcı yoksa null.
 * `context`:
 *  - `admin`: yönetici başka bir kullanıcıyı siliyor (self ve ADMIN hedef engellenir).
 *  - `self`:  kişi kendi hesabını siliyor (ADMIN kendi hesabını silemez).
 */
export async function previewUserErasure(
  userId: string,
  opts: { actorId: string; context: 'admin' | 'self' }
): Promise<ErasurePreview | null> {
  const target = (await prisma.user.findUnique({ where: { id: userId }, select: TARGET_SELECT })) as ErasureTarget | null;
  if (!target) return null;

  const [feedbacks, reviews, consumptions, qrCodes] = await Promise.all([
    prisma.feedback.count({ /* soft-delete: silinmiş dahil — silme etkisi önizlemesi kişinin bütün kayıtlarını sayar */ where: { userId } }),
    prisma.consumptionReview.count({ /* soft-delete: silinmiş dahil — silme etkisi önizlemesi kişinin bütün kayıtlarını sayar */ where: { customerId: userId } }),
    prisma.consumption.count({ where: { OR: [{ customerId: userId }, { dealerId: userId }] } }),
    target.role === 'DEALER' ? prisma.qRCode.count({ where: { dealerId: userId, archivedAt: null } }) : Promise.resolve(0),
  ]);

  const blockers: string[] = [];
  if (opts.context === 'admin' && userId === opts.actorId) blockers.push(ERASURE_BLOCKERS.self);
  if (target.role === 'ADMIN') blockers.push(ERASURE_BLOCKERS.admin);
  if (target.stripeSubscriptionId && BLOCKING_SUBSCRIPTION_STATUSES.has(target.subscriptionStatus ?? '')) {
    blockers.push(ERASURE_BLOCKERS.subscription);
  }

  const impact: DeletionImpact = {
    entity: 'User',
    entityId: userId,
    // Tipli onay için e-posta (ConfirmAction confirmPhrase) — yalnız yöneticiye döner.
    entityLabel: target.email,
    items: [
      { key: 'account', label: 'Anonimleştirilecek hesap', value: target.anonymizedAt ? 0 : 1, emphasis: true },
      { key: 'feedbacks', label: 'Metni silinecek geri bildirim (puanı korunur)', value: feedbacks },
      { key: 'reviews', label: 'Metni silinecek tüketim yorumu', value: reviews },
      { key: 'consumptions', label: 'Korunacak tüketim kaydı (kimliksizleşir)', value: consumptions },
      ...(target.role === 'DEALER'
        ? [{ key: 'qrCodes', label: 'Arşivlenecek QR kod (yorumlar korunur)', value: qrCodes, emphasis: qrCodes > 0 }]
        : []),
      { key: 'points', label: 'Geçersiz kalacak puan bakiyesi', value: Math.max(0, target.points) },
    ],
    warning:
      'Hesap silinmez, KVKK kapsamında geri döndürülemez biçimde anonimleştirilir: ad, e-posta, telefon, adres, şifre ve oturumlar kalkar; denetim izi ve istatistikler korunur.',
    ...(blockers.length ? { blockers } : {}),
  };

  return { target, impact, alreadyAnonymized: !!target.anonymizedAt };
}

'use client';

/**
 * a-kullanicilar arayüz metinleri (TR/EN). Bileşenler `useAdminKullanicilarCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminKullanicilarText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  addUser: 'Kullanıcı ekle',
  noAdminHere: 'Yönetici hesabı buradan açılmaz: kullanıcıyı oluşturup Erişim sekmesinden yükseltme talebi verin.',
  customer: 'Müşteri',
  signInMethod: 'Giriş yöntemi',
  lastAdmin: 'Bu, platformdaki son etkin yönetici; rolü düşürülemez.',
  pendingUpgrade: 'Bekleyen bir yönetici yükseltme talebi var; önce o karara bağlanmalı.',
  approveAdmin: 'Onayla ve yönetici yap',
  fullAuditLog: 'Tüm denetim günlüğü',
  archived: 'Arşivli',
  noPlan: 'Plansız (ücretsiz kademe)',
  noOtherAdmin: 'Sistemde sizden başka etkin bir yönetici yok; onay belirteci yalnız başka bir yöneticinin talebi için üretilebilir.',
  tokenReady: 'Belirteç hazır — talep eden yöneticiye iletin',
  ratingOnly: 'Yalnız puan bırakıldı.',
  trustCenter: 'Güven merkezi',
  inAppNotice: 'Uygulama içi bildirim',
  noticeHint: 'Kullanıcının bildirim merkezine düşer ve denetim kaydına yazılır. Pazarlama içeriği için kampanya araçlarını kullanın.',
  preview: 'Önizleme',
  demoAccount: 'Demo hesabı',
  freeTier: 'Ücretsiz kademe',
};

export type AdminKullanicilarCopy = Record<keyof typeof tr, string>;

const en: AdminKullanicilarCopy = {
  addUser: 'Add user',
  noAdminHere: 'Admin accounts can\'t be created here: create the user, then request an upgrade from the Access tab.',
  customer: 'Customer',
  signInMethod: 'Sign-in method',
  lastAdmin: 'This is the last active admin on the platform; their role can\'t be lowered.',
  pendingUpgrade: 'There\'s a pending admin upgrade request; resolve it first.',
  approveAdmin: 'Approve and make admin',
  fullAuditLog: 'Full audit log',
  archived: 'Archived',
  noPlan: 'No plan (free tier)',
  noOtherAdmin: 'There\'s no other active admin besides you; an approval token can only be issued for another admin\'s request.',
  tokenReady: 'Token ready — send it to the requesting admin',
  ratingOnly: 'Rating only.',
  trustCenter: 'Trust center',
  inAppNotice: 'In-app notification',
  noticeHint: 'Lands in the user\'s notification center and is written to the audit log. Use the campaign tools for marketing content.',
  preview: 'Preview',
  demoAccount: 'Demo account',
  freeTier: 'Free tier',
};

export function useAdminKullanicilarCopy(): AdminKullanicilarCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminKullanicilarText({ k }: { k: keyof AdminKullanicilarCopy }): string {
  return useAdminKullanicilarCopy()[k];
}

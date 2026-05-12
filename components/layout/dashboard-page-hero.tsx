'use client';

/**
 * Tek tasarım dili: admin / bayi / müşteri panellerinde aynı “premium” üst bölüm kabı.
 * Uygulama renk token’larını kullanır — paleti burada yeniden tanımlamaz.
 *
 * @see components/layout/DESIGN-LANGUAGE.md
 */
export {
  AdminPremiumHeroChrome as DashboardPageHeroChrome,
  AdminPremiumHero as DashboardPageHero,
  type AdminPremiumHeroChromeTone as DashboardPageHeroTone,
} from '@/components/admin/admin-premium-hero';

export type {
  AdminPremiumHeroProps as DashboardPageHeroProps,
} from '@/components/admin/admin-premium-hero';

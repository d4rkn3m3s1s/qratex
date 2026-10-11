'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { m as Motion } from 'framer-motion';
import { Twitter, Linkedin, Instagram, Github, Mail, MapPin, Rss } from 'lucide-react';
import { getRandomSlogan } from '@/lib/slogans';
import { cn } from '@/lib/utils';
import { useAppLocale } from '@/lib/app-locale';
import { ConsentPreferencesButton } from '@/components/analytics/consent-preferences-button';

type FooterLink = { href: string; label: { tr: string; en: string } };

/**
 * Footer bağlantıları (TR/EN). Landing yeniden tasarımı (landing.md envanter #43, Bulgu 13):
 * eski `/#features`, `/#pricing` çapaları ve gerçek sayfası olmayan "Hakkımızda" (→ /#features)
 * kaldırıldı; özellikler + fiyatlar işletme sayfasında, SSS ana sayfada `#sss`.
 */
const footerLinks: Record<'product' | 'company' | 'support' | 'legal', FooterLink[]> = {
  product: [
    { label: { tr: 'Nasıl çalışır', en: 'How it works' }, href: '/#nasil-calisir' },
    { label: { tr: 'Özellikler', en: 'Features' }, href: '/neden-qratex#ozellikler' },
    { label: { tr: 'Fiyatlandırma', en: 'Pricing' }, href: '/neden-qratex#fiyatlar' },
  ],
  company: [
    { label: { tr: 'Neden QRateX?', en: 'Why QRateX?' }, href: '/neden-qratex' },
    { label: { tr: 'Blog', en: 'Blog' }, href: '/blog' },
  ],
  support: [
    { label: { tr: 'SSS', en: 'FAQ' }, href: '/#sss' },
    { label: { tr: 'RSS', en: 'RSS' }, href: '/feed.xml' },
  ],
  legal: [
    { label: { tr: 'Güven Merkezi', en: 'Trust Center' }, href: '/guven' },
    { label: { tr: 'Kullanım Şartları', en: 'Terms of Use' }, href: '/kullanim-sartlari' },
    { label: { tr: 'Gizlilik Politikası', en: 'Privacy Policy' }, href: '/gizlilik-politikasi' },
    { label: { tr: 'Çerez Politikası', en: 'Cookie Policy' }, href: '/cerez-politikasi' },
    { label: { tr: 'KVKK Aydınlatma Metni', en: 'KVKK Privacy Notice' }, href: '/kvkk-aydinlatma-metni' },
  ],
};

const FOOTER_TEXT = {
  tr: {
    tagline: 'QR tabanlı geri bildirim ve oyunlaştırma platformu: müşteriler kazanır, işletmeler duyar.',
    product: 'Ürün',
    company: 'Şirket',
    support: 'Destek',
    legal: 'Yasal',
    rights: 'Tüm hakları saklıdır.',
    city: 'İstanbul, Türkiye',
  },
  en: {
    tagline: 'QR-based feedback and gamification platform: customers earn, businesses listen.',
    product: 'Product',
    company: 'Company',
    support: 'Support',
    legal: 'Legal',
    rights: 'All rights reserved.',
    city: 'Istanbul, Türkiye',
  },
} as const;

const socialLinks = [
  { icon: Twitter, href: 'https://twitter.com/qratex', label: 'Twitter' },
  { icon: Linkedin, href: 'https://linkedin.com/company/qratex', label: 'LinkedIn' },
  { icon: Instagram, href: 'https://instagram.com/qratex', label: 'Instagram' },
  { icon: Github, href: 'https://github.com/qratex', label: 'GitHub' },
];

export function Footer() {
  const [mounted, setMounted] = useState(false);
  const [slogan, setSlogan] = useState('');
  const { resolvedTheme } = useTheme();
  const { locale } = useAppLocale();
  const lang = locale === 'en' ? 'en' : 'tr';
  const text = FOOTER_TEXT[lang];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSlogan(getRandomSlogan());
  }, []);

  // Get the correct logo based on theme
  const logoSrc = mounted && resolvedTheme === 'dark' 
    ? '/logo/logo.png' 
    : '/logo/logo-light.png';

  const fontLogoSrc = mounted && resolvedTheme === 'dark'
    ? '/logo/font.png'
    : '/logo/font-light.png';

  const linkFocus =
    'rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  return (
    <footer className="border-t border-border/40 bg-background/20 backdrop-blur-md">
      <div className="container mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href="/" className={cn('mb-6 inline-flex items-center gap-3 rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2')}>
              {/* Erişilebilir ad sr-only metinden gelir; logolar dekoratif (alt="" — axe image-redundant-alt). */}
              <span className="sr-only">QRateX</span>
              {mounted && (
                <>
                  <Image
                    src={logoSrc}
                    alt=""
                    width={56}
                    height={56}
                    className="object-contain w-12 h-12 sm:w-14 sm:h-14"
                  />
                  <Image
                    src={fontLogoSrc}
                    alt=""
                    width={140}
                    height={36}
                    className="object-contain h-8 sm:h-9"
                    style={{ width: 'auto' }}
                  />
                </>
              )}
            </Link>
            <p className="text-muted-foreground text-base mb-2 max-w-sm">{text.tagline}</p>
            {slogan && lang === 'tr' && (
              <p className="text-muted-foreground/90 text-sm italic mb-6 max-w-sm border-l-2 border-primary/30 pl-3">
                {slogan}
              </p>
            )}
            {!(slogan && lang === 'tr') && <div className="mb-6" />}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <Motion.a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary touch-manipulation"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <social.icon className="h-5 w-5 shrink-0" aria-hidden />
                </Motion.a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold text-base mb-4">{text.product}</h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn('text-sm text-muted-foreground', linkFocus)}
                  >
                    {link.label[lang]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-4">{text.company}</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn('text-sm text-muted-foreground', linkFocus)}
                  >
                    {link.label[lang]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-4">{text.support}</h3>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.href} className="flex items-center gap-1.5">
                  {link.href === '/feed.xml' && <Rss className="h-4 w-4 shrink-0" aria-hidden />}
                  <Link
                    href={link.href}
                    className={cn('text-sm text-muted-foreground', linkFocus)}
                    {...(link.href === '/feed.xml' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {link.label[lang]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-4">{text.legal}</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn('text-sm text-muted-foreground', linkFocus)}
                  >
                    {link.label[lang]}
                  </Link>
                </li>
              ))}
              <li>
                {/* Rızayı geri çekmek vermek kadar kolay olmalı (P0-31). */}
                <ConsentPreferencesButton surface="footer" className={cn('text-sm text-muted-foreground', linkFocus)} />
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} QRateX. {text.rights}
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <a href="mailto:info@qratex.com" className={cn('text-muted-foreground', linkFocus)}>
                info@qratex.com
              </a>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <MapPin className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span>{text.city}</span>
            </div>
          </div>
        </div>

      </div>
    </footer>
  );
}

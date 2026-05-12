'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { Twitter, Linkedin, Instagram, Github, Mail, MapPin, Rss } from 'lucide-react';
import { getRandomSlogan } from '@/lib/slogans';
import { cn } from '@/lib/utils';

const footerLinks = {
  product: [
    { label: 'Özellikler', href: '/#features' },
    { label: 'Fiyatlandırma', href: '/#pricing' },
  ],
  company: [
    { label: 'Hakkımızda', href: '/#features' },
    { label: 'Blog', href: '/blog' },
    { label: 'Neden QRATEX?', href: '/neden-qratex' },
  ],
  support: [
    { label: 'SSS', href: '/#faq' },
    { label: 'RSS', href: '/feed.xml' },
  ],
  legal: [
    { label: 'Güven', href: '/guven' },
    { label: 'Kullanım Şartları', href: '/kullanim-sartlari' },
    { label: 'Gizlilik Politikası', href: '/gizlilik-politikasi' },
    { label: 'Çerez Politikası', href: '/cerez-politikasi' },
    { label: 'KVKK Aydınlatma Metni', href: '/kvkk-aydinlatma-metni' },
  ],
};

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
    <footer className="border-t border-border/60 bg-card/50 backdrop-blur-xl">
      <div className="container mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href="/" className={cn('mb-6 inline-flex items-center gap-3 rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2')}>
              {mounted && (
                <>
                  <Image
                    src={logoSrc}
                    alt="QRATEX Logo"
                    width={56}
                    height={56}
                    className="object-contain w-12 h-12 sm:w-14 sm:h-14"
                  />
                  <Image
                    src={fontLogoSrc}
                    alt="QRATEX"
                    width={140}
                    height={36}
                    className="object-contain h-8 sm:h-9"
                    style={{ width: 'auto' }}
                  />
                </>
              )}
            </Link>
            <p className="text-muted-foreground text-base mb-2 max-w-sm">
              QR tabanlı geri bildirim ve gamification platformu ile müşteri deneyimini dönüştürün.
            </p>
            {slogan && (
              <p className="text-muted-foreground/90 text-sm italic mb-6 max-w-sm border-l-2 border-primary/30 pl-3">
                {slogan}
              </p>
            )}
            {!slogan && <div className="mb-6" />}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <motion.a
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
                </motion.a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold text-base mb-4">Ürün</h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn('text-sm text-muted-foreground', linkFocus)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-4">Şirket</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn('text-sm text-muted-foreground', linkFocus)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-4">Destek</h3>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.href} className="flex items-center gap-1.5">
                  {link.href === '/feed.xml' && <Rss className="h-4 w-4 shrink-0" aria-hidden />}
                  <Link
                    href={link.href}
                    className={cn('text-sm text-muted-foreground', linkFocus)}
                    {...(link.href === '/feed.xml' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-4">Yasal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn('text-sm text-muted-foreground', linkFocus)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} QRATEX. Tüm hakları saklıdır.
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
              <span>İstanbul, Türkiye</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

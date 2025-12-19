'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { Twitter, Linkedin, Instagram, Github, Mail, MapPin } from 'lucide-react';

const footerLinks = {
  product: [
    { label: 'Özellikler', href: '/#features' },
    { label: 'Fiyatlandırma', href: '/#pricing' },
  ],
  company: [
    { label: 'Hakkımızda', href: '/#features' },
  ],
  support: [
    { label: 'SSS', href: '/#faq' },
  ],
  legal: [
    { label: 'Gizlilik', href: '/#' },
    { label: 'Şartlar', href: '/#' },
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
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get the correct logo based on theme
  const logoSrc = mounted && resolvedTheme === 'dark' 
    ? '/logo/logo.png' 
    : '/logo/logo-light.png';

  const fontLogoSrc = mounted && resolvedTheme === 'dark'
    ? '/logo/font.png'
    : '/logo/font-light.png';

  return (
    <footer className="border-t bg-card/50 backdrop-blur-xl">
      <div className="container mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6">
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
            <p className="text-muted-foreground text-base mb-6 max-w-sm">
              QR tabanlı geri bildirim ve gamification platformu ile müşteri deneyimini dönüştürün.
            </p>
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <social.icon className="w-5 h-5" />
                  <span className="sr-only">{social.label}</span>
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
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
              <Mail className="w-4 h-4" />
              <span>info@qratex.com</span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span>İstanbul, Türkiye</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

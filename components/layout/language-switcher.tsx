'use client';

import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import type { Locale } from '@/i18n/core';
import { cn } from '@/lib/utils';

const LANGS: Array<{ key: Locale }> = [{ key: 'tr' }, { key: 'en' }];

interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export function LanguageSwitcher({ className, compact = true }: LanguageSwitcherProps) {
  const { locale, setLocale } = useAppLocale();
  const t = useAppT();
  // Dilin tek yazarı sağlayıcı: cihaz (çerez + localStorage) ve oturum açıksa hesap tercihi
  // (PATCH /api/user/profile + oturum güncellemesi) orada yazılır (lib/app-locale.tsx, B2).
  const handleChange = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? 'icon' : 'sm'}
          className={cn('touch-manipulation', className)}
          aria-label={t('appShell.languageSelect')}
        >
          <Globe className="h-4 w-4" aria-hidden />
          {!compact ? <span className="ml-2">{locale.toUpperCase()}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGS.map((lang) => (
          <DropdownMenuItem
            key={lang.key}
            onSelect={() => handleChange(lang.key)}
            onClick={() => handleChange(lang.key)}
            className={lang.key === locale ? 'font-semibold' : undefined}
            lang={lang.key}
            aria-current={lang.key === locale ? 'true' : undefined}
          >
            {/* Dil adları kendi dilinde (endonim) + lang: ekran okuyucu doğru telaffuz eder. */}
            {lang.key === 'tr' ? 'TR · Türkçe' : 'EN · English'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


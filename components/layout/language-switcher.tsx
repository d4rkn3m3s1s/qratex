'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { type Locale } from '@/i18n/request';

const LANGS: Array<{ key: Locale }> = [{ key: 'tr' }, { key: 'en' }];

interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export function LanguageSwitcher({ className, compact = true }: LanguageSwitcherProps) {
  const { data: session, update } = useSession();
  const { locale, setLocale } = useAppLocale();
  const t = useAppT();
  const [saving, setSaving] = useState(false);

  const handleChange = async (nextLocale: Locale) => {
    if (saving || nextLocale === locale) return;
    setLocale(nextLocale);

    if (!session?.user) return;

    try {
      setSaving(true);
      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: nextLocale }),
      });
      await update({ preferredLanguage: nextLocale });
    } catch {
      // UI already switched with local preference; fail silently.
    } finally {
      setSaving(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? 'icon' : 'sm'}
          className={className}
          aria-label={t('appShell.languageSelect')}
          disabled={saving}
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
          >
            {lang.key === 'tr' ? t('appShell.languageTr') : t('appShell.languageEn')}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


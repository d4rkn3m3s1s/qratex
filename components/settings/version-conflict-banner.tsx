'use client';

import { useState } from 'react';
import { AlertTriangle, RotateCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TONE_CALLOUT, TONE_TEXT } from '@/components/states';
import { useAppLocale } from '@/lib/app-locale';

const COPY = {
  tr: {
    title: 'Kaydedilmedi: sürüm çakışması',
    body: 'Bu ayarlar siz düzenlerken başka biri tarafından değiştirildi.',
    notSaved: 'Değişiklikleriniz henüz kaydedilmedi.',
    reload: 'Güncel hâli yükle',
    overwrite: 'Yine de benimkini kaydet',
  },
  en: {
    title: 'Not saved: version conflict',
    body: 'These settings were changed by someone else while you were editing.',
    notSaved: 'Your changes have not been saved yet.',
    reload: 'Load latest version',
    overwrite: 'Save mine anyway',
  },
} as const;

export type VersionConflictBannerProps = {
  /** Sunucunun döndürdüğü mesaj (varsayılan metin aşağıda). */
  message?: string;
  /** Güncel hâli yükle (yerel değişiklikler atılır). */
  onReload: () => unknown;
  /**
   * Bilerek üzerine yaz: yerel değişiklikleri sunucunun bildirdiği GÜNCEL sürüm üzerine yazar.
   * Verilmezse yalnız "Güncel hâli yükle" sunulur.
   */
  onOverwrite?: () => unknown;
  className?: string;
};

/**
 * 409 `VERSION_CONFLICT` bandı: ayar siz düzenlerken başka biri tarafından değiştirildi.
 * Sessiz ezme yok — kullanıcı ya güncel hâli yükler ya da bilerek üzerine yazar.
 */
export function VersionConflictBanner({ message, onReload, onOverwrite, className }: VersionConflictBannerProps) {
  const { locale } = useAppLocale();
  const copy = COPY[locale === 'en' ? 'en' : 'tr'];
  const [busy, setBusy] = useState<'reload' | 'overwrite' | null>(null);
  const run = async (kind: 'reload' | 'overwrite', fn: () => unknown) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div role="alert" className={cn('flex flex-col gap-3 rounded-control border px-4 py-3 sm:flex-row sm:items-center', TONE_CALLOUT.warning, className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_TEXT.warning)} aria-hidden />
        <div className="qx-small min-w-0">
          <p className="font-medium">{copy.title}</p>
          <p className="text-fg-muted">
            {locale === 'en' ? copy.body : message ?? copy.body} {copy.notSaved}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => run('reload', onReload)} className="gap-1.5">
          <RotateCw className={cn('h-3.5 w-3.5', busy === 'reload' && 'animate-spin')} aria-hidden />
          {copy.reload}
        </Button>
        {onOverwrite && (
          <Button type="button" size="sm" variant="destructive" disabled={busy !== null} onClick={() => run('overwrite', onOverwrite)} className="gap-1.5">
            <Save className="h-3.5 w-3.5" aria-hidden />
            {copy.overwrite}
          </Button>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import type { TemplateInput } from '@/lib/mail-center/templates-contract';
import { splitRecipients } from '@/lib/mail-center/templates-contract';
import { errorText, fetchPreviewHtml } from '../api';

type Width = 'desktop' | 'mobile';

/**
 * Sayfa içi canlı önizleme (yeni sekme/pop-up yok, Bulgu 10 + eksik özellik 44). Sunucudaki GERÇEK
 * render (açılma pikseli olmadan) 400 ms debounce ile çekilir; çerçeve tamamen kum havuzunda
 * (`sandbox=""`, betik yok). `{{email}}` ilk alıcıyla doldurulur.
 */
export function PreviewPane({ draft, className }: { draft: TemplateInput; className?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState<Width>('desktop');
  const key = JSON.stringify([draft.kind, draft.department, draft.recipientName, draft.subject, draft.body, draft.deadline, draft.email]);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetchPreviewHtml(draft, splitRecipients(draft.email)[0], ctrl.signal)
        .then((h) => {
          setHtml(h);
          setError(null);
        })
        .catch((e) => {
          if ((e as { name?: string })?.name !== 'AbortError') setError(errorText(e));
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-fg" id="preview-label">
          Canlı önizleme
          <span className="ml-2 text-xs font-normal text-fg-muted" aria-live="polite">
            {loading ? 'güncelleniyor…' : 'alıcının göreceği hâl'}
          </span>
        </p>
        <ChoiceChips<Width>
          aria-label="Önizleme genişliği"
          size="sm"
          options={[
            { value: 'desktop', label: 'Masaüstü', icon: <Monitor className="h-3.5 w-3.5" aria-hidden /> },
            { value: 'mobile', label: 'Mobil', icon: <Smartphone className="h-3.5 w-3.5" aria-hidden /> },
          ]}
          value={width}
          onChange={(v) => v && setWidth(v)}
        />
      </div>
      {error && <InlineError variant="banner">{error}</InlineError>}
      <div className="overflow-hidden rounded-card border border-border bg-[#eef2f7]">
        <div className={cn('mx-auto transition-[max-width] duration-base motion-reduce:transition-none', width === 'mobile' ? 'max-w-[390px]' : 'max-w-full')}>
          {html ? (
            <iframe
              title={`Mail önizlemesi: ${draft.subject || 'konu yok'}`}
              aria-labelledby="preview-label"
              sandbox=""
              srcDoc={html}
              className={cn('block h-[70vh] min-h-[480px] w-full border-0 transition-opacity duration-fast motion-reduce:transition-none', loading && 'opacity-70')}
            />
          ) : (
            <div className="h-[480px] animate-pulse bg-surface-2 motion-reduce:animate-none" aria-hidden />
          )}
        </div>
      </div>
      <p className="text-xs text-fg-muted">
        Önizlemede açılma pikseli yoktur. Logo HTTPS adresten yüklenir (Gmail gömülü görselleri siler).
      </p>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocaleSafe } from '@/lib/app-locale';
import { uiCopy } from '@/lib/i18n/ui-copy';

/**
 * Ödül talep düğmesi (görev XP'si / turnuva ödülü). Sunucu otoriter: istek başarılıysa
 * sayfa sunucuda yeniden çizilir (`router.refresh()`), istemci durumu uydurmaz. Hata
 * mesajı sunucudan gelir (zarf v2 `error`), görünür biçimde gösterilir.
 */
export function ClaimButton({
  endpoint,
  body,
  label,
  pendingLabel,
  successMessage,
  ariaLabel,
  className,
}: {
  endpoint: string;
  body?: Record<string, unknown>;
  label: string;
  pendingLabel: string;
  successMessage: string;
  ariaLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const copy = uiCopy(useLocaleSafe());
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const disabled = busy || refreshing;

  async function claim() {
    if (disabled) return;
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || json?.success === false) {
        // Sunucu metni dil çerezine göre (zarf v2, lib/http/error-locale).
        toast.error(json?.error ?? copy.genericError);
        // Durum sunucuda değişmiş olabilir (ör. zaten alındı) → güncel hâli çiz.
        startRefresh(() => router.refresh());
        return;
      }
      toast.success(successMessage);
      startRefresh(() => router.refresh());
    } catch {
      toast.error(copy.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={claim}
      disabled={disabled}
      aria-busy={disabled || undefined}
      aria-label={ariaLabel}
      className={cn('min-h-11 min-w-[5.5rem] shrink-0 px-4', className)}
    >
      {disabled ? (
        <>
          <Loader2 className="mr-1.5 size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}

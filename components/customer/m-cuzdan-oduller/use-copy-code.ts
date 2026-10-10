'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { announce } from '@/components/ds/a11y';

/**
 * Panoya kopyalama — `await` + hata yakalama. Başarısızlıkta başarı tostu ÇIKMAZ;
 * kullanıcıya elle kopyalama yolu söylenir (eski kod sonucu beklemeden "kopyalandı" diyordu).
 */
export function useCopyCode(messages: { copied: string; failed: string }) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const copy = useCallback(
    async (value: string) => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
        await navigator.clipboard.writeText(value);
        setCopiedValue(value);
        toast.success(messages.copied);
        announce(messages.copied);
        window.setTimeout(() => setCopiedValue((v) => (v === value ? null : v)), 2000);
        return true;
      } catch {
        toast.error(messages.failed);
        return false;
      }
    },
    [messages.copied, messages.failed]
  );
  return { copy, copiedValue };
}

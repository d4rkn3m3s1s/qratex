'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { announce } from '@/components/ds/a11y';
import { Switch } from '@/components/ui/switch';
import { useLigCopy } from './use-lig-copy';

/**
 * Gizlilik: "Sıralamada görün". Tercih Ayarlar'daki aynı alana yazılır
 * (`PATCH /api/customer/settings` → `preferences.showLeaderboard`) — tek kaynak. Kendi görünümüne
 * hemen yansır (sunucu kendi tercihini önbelleksiz okur); başkalarına ≤ 1 dk içinde.
 */
export function LeaguePrivacy({ visible }: { visible: boolean }) {
  const { copy } = useLigCopy();
  const qc = useQueryClient();
  const switchId = useId();
  const descId = useId();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await fetch('/api/customer/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferences: { showLeaderboard: next } }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || body.success !== true) throw new Error(body.error || copy.privacyError);
      return next;
    },
    onMutate: () => setError(null),
    onSuccess: async (next) => {
      announce(copy.privacySaved(next));
      await qc.invalidateQueries({ queryKey: ['customer-league'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : copy.privacyError),
  });

  const checked = mutation.isPending && typeof mutation.variables === 'boolean' ? mutation.variables : visible;
  const Icon = checked ? Eye : EyeOff;

  return (
    <section aria-labelledby={`${switchId}-title`} className="rounded-2xl border border-subtle bg-surface-1 p-4">
      <h2 id={`${switchId}-title`} className="qx-small font-semibold uppercase tracking-wide text-fg-muted">
        {copy.privacyTitle}
      </h2>
      <div className="mt-3 flex items-start gap-3">
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={switchId} className="qx-body cursor-pointer font-medium text-fg">
            {copy.privacySwitch}
          </label>
          <p id={descId} className="qx-small text-fg-muted">
            {checked ? copy.privacyOn : copy.privacyOff} {copy.privacyNote}
          </p>
          {error ? (
            <p role="alert" className="qx-small text-danger">
              {error}
            </p>
          ) : null}
        </div>
        {/* 44px dokunma hedefi: anahtar küçük, etiket + sarmalayıcı alanı büyütür. */}
        <div className="flex min-h-11 min-w-11 items-center justify-center">
          <Switch
            id={switchId}
            checked={checked}
            disabled={mutation.isPending}
            aria-describedby={descId}
            onCheckedChange={(v) => mutation.mutate(v)}
          />
        </div>
      </div>
    </section>
  );
}

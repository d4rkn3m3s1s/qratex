'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { StaffLedgerScope } from '@/lib/dealer/kasa/core';

const OPTIONS: ReadonlyArray<{ value: StaffLedgerScope; label: string; hint: string }> = [
  { value: 'today', label: 'Yalnız bugün', hint: 'Personel yalnız bugünün kayıtlarını görür.' },
  { value: 'today_own', label: 'Bugün + kendi geçmişi', hint: 'Bugünün tümü ve personelin kendi girdiği eski kayıtlar (önerilen).' },
  { value: 'all', label: 'Tümü', hint: 'Personel işletmenin tüm işlem defterini görür.' },
];

/** Bayi → Ekip: personelin İşlem defteri kapsamı. Zorlama sunucuda; bu kart yalnız ayarı yazar. */
export function StaffLedgerScopeCard({ initial }: { initial: StaffLedgerScope }) {
  const [scope, setScope] = useState<StaffLedgerScope>(initial);
  const [saving, setSaving] = useState(false);

  async function choose(next: StaffLedgerScope) {
    if (next === scope || saving) return;
    const prev = scope;
    setScope(next);
    setSaving(true);
    try {
      const res = await fetch('/api/dealer/settings/staff-ledger-scope', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success('Personel defter kapsamı güncellendi');
    } catch {
      setScope(prev);
      toast.error('Kaydedilemedi, tekrar dene');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto mb-4 w-full rounded-xl border border-border bg-card p-4" aria-labelledby="staff-ledger-scope-title">
      <h2 id="staff-ledger-scope-title" className="text-sm font-semibold">
        Personel işlem defteri görünürlüğü
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Personel, kendi panelindeki İşlem defteri sekmesinde bu kapsamı görür.</p>
      <fieldset className="mt-3 grid gap-2 sm:grid-cols-3" disabled={saving}>
        <legend className="sr-only">Personel hangi tüketim kayıtlarını görebilir</legend>
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name="staff-ledger-scope"
              value={o.value}
              checked={scope === o.value}
              onChange={() => choose(o.value)}
              className="mt-1 shrink-0 accent-[var(--primary)]"
            />
            <span>
              <span className="block font-medium">{o.label}</span>
              <span className="block text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}

'use client';

/**
 * Telafi günlük puan bütçesi kartı — iki yüzey:
 *  - `mode="dealer"`  → Bayi › Ayarlar › İşletme: kendi limitini (tavanın altında) koyar.
 *  - `mode="admin"`   → Admin › Kullanıcı 360 › İşletme: bayi tavanını override eder.
 * Kurallar sunucuda (lib/remedy-budget.ts); burada yalnız gösterim + form.
 */
import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ds/page';

type BudgetView = {
  adminCap: number | null;
  dealerCap: number | null;
  defaultCap: number;
  ceiling: number;
  effective: number;
  usedToday: number;
  remainingToday: number;
};

const nf = new Intl.NumberFormat('tr-TR');

async function call(url: string, init?: RequestInit): Promise<BudgetView> {
  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const json = (await res.json().catch(() => null)) as { data?: { budget?: BudgetView }; message?: string } | null;
  if (!res.ok || !json?.data?.budget) throw new Error(json?.message || 'Telafi bütçesi yüklenemedi.');
  return json.data.budget;
}

export function RemedyBudgetCard({ mode, dealerId }: { mode: 'dealer' | 'admin'; dealerId?: string }) {
  const id = useId();
  const qc = useQueryClient();
  const url = mode === 'admin' ? `/api/admin/users/${encodeURIComponent(dealerId ?? '')}/remedy-budget` : '/api/dealer/settings/remedy-budget';
  const key = ['remedy-budget', mode, dealerId ?? 'self'];
  const q = useQuery({ queryKey: key, queryFn: () => call(url) });
  const b = q.data;
  const current = b ? (mode === 'admin' ? b.adminCap : b.dealerCap) : null;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValue(current == null ? '' : String(current));
  }, [current]);

  const save = async (raw: string) => {
    const t = raw.trim();
    const n = t === '' ? null : Number(t.replace(/\./g, ''));
    if (n != null && (!Number.isInteger(n) || n < 0)) {
      toast.error('0 ya da pozitif bir tam sayı girin (boş = varsayılan).');
      return;
    }
    if (mode === 'dealer' && b && n != null && n > b.ceiling) {
      toast.error(`Limitiniz en fazla ${nf.format(b.ceiling)} puan olabilir.`);
      return;
    }
    setBusy(true);
    try {
      const next = await call(url, {
        method: 'PATCH',
        body: JSON.stringify(mode === 'admin' ? { adminCap: n } : { dealerCap: n }),
      });
      qc.setQueryData(key, next);
      toast.success('Telafi bütçesi güncellendi.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Telafi günlük puan bütçesi" icon={<Coins />}>
      {q.isError ? (
        <p className="text-sm text-danger">{(q.error as Error).message}</p>
      ) : !b ? (
        <p className="text-sm text-fg-muted">Yükleniyor…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Müşterilerin bir günde puan türü telafilerle alabileceği toplam puan. Bütçe dolunca müşteri başka bir telafi
            türü seçebilir ya da ertesi gün kabul edebilir; yalnız puan seçenekli yeni teklif açılmaz.
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-fg-muted">Uygulanan</dt>
              <dd className="font-semibold tabular-nums">{nf.format(b.effective)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Bugün kullanılan</dt>
              <dd className="tabular-nums">{nf.format(b.usedToday)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Kalan</dt>
              <dd className="tabular-nums">{nf.format(b.remainingToday)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{mode === 'admin' ? 'Bayinin kendi limiti' : 'Üst sınır'}</dt>
              <dd className="tabular-nums">
                {mode === 'admin' ? (b.dealerCap == null ? 'Yok' : nf.format(b.dealerCap)) : nf.format(b.ceiling)}
              </dd>
            </div>
          </dl>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save(value);
            }}
          >
            <div className="min-w-[12rem] flex-1">
              <label htmlFor={id} className="mb-1 block text-sm font-medium">
                {mode === 'admin'
                  ? `Bayi tavanı (boş = varsayılan ${nf.format(b.defaultCap)})`
                  : `Kendi günlük limitiniz (boş = ${nf.format(b.ceiling)})`}
              </label>
              <Input
                id={id}
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={String(mode === 'admin' ? b.defaultCap : b.ceiling)}
                disabled={busy}
              />
            </div>
            <Button type="submit" className="min-h-11" disabled={busy}>
              Kaydet
            </Button>
            {current != null ? (
              <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => void save('')}>
                Varsayılana dön
              </Button>
            ) : null}
          </form>
        </div>
      )}
    </SectionCard>
  );
}

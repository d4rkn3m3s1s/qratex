'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/states';
import { buildFeatureMatrix, featureKey, toggleFeature, type PlanSummary } from '@/lib/admin-pricing/contract';
import { cn } from '@/lib/utils';
import { errorText, updatePlan } from './api';
import { fmtNum } from './format';
import { AdminFiyatlandirmaText } from './copy';

/**
 * Özellik matrisi: satırlar tüm planların özellik birleşimi, sütunlar vitrin sırasındaki planlar.
 * Hücreye basmak özelliği o plana ekler/çıkarır (iyimser kilitli PATCH; çakışmada liste yenilenir).
 * İlk iki satır sunucuda UYGULANAN limitlerdir (salt okunur; düzenleyiciden değişir).
 */
export function FeatureMatrix({ plans, onChanged }: { plans: PlanSummary[]; onChanged: () => void }) {
  const rows = useMemo(() => buildFeatureMatrix(plans), [plans]);
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const allRows = useMemo(() => {
    const known = new Set(rows.map((r) => r.key));
    return [...rows, ...extra.filter((e) => !known.has(featureKey(e))).map((label) => ({ key: featureKey(label), label, planIds: [] as string[] }))];
  }, [rows, extra]);

  if (plans.length === 0) {
    return <EmptyState title="Karşılaştırılacak plan yok" description="Matris, arşivlenmemiş planların özelliklerini yan yana gösterir." />;
  }

  const toggle = async (plan: PlanSummary, label: string, on: boolean) => {
    const cell = `${plan.id}:${featureKey(label)}`;
    const next = toggleFeature(plan.features, label, on);
    if (next.length === 0) {
      toast.error('Bir planda en az 1 özellik kalmalı.');
      return;
    }
    if (next.length > 80) {
      toast.error('Bir plan en fazla 80 özellik içerebilir.');
      return;
    }
    setBusy(cell);
    try {
      await updatePlan(plan.id, { features: next, expectedUpdatedAt: plan.updatedAt });
      toast.success(on ? `“${label}” ${plan.name} planına eklendi.` : `“${label}” ${plan.name} planından çıkarıldı.`);
      onChanged();
    } catch (e) {
      toast.error(errorText(e));
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const addRow = (e: React.FormEvent) => {
    e.preventDefault();
    const label = draft.trim().replace(/\s+/g, ' ');
    if (!label) return;
    if (label.length > 200) {
      toast.error('Özellik en fazla 200 karakter olabilir.');
      return;
    }
    if (allRows.some((r) => r.key === featureKey(label))) {
      toast.error('Bu özellik matriste zaten var.');
      return;
    }
    setExtra((x) => [...x, label]);
    setDraft('');
  };

  return (
    <div className="space-y-4">
      <p className="qx-small text-fg-muted">
        Hücreye basarak özelliği plana ekleyin ya da çıkarın; değişiklik anında kaydedilir ve vitrine yansır. Aynı metin (büyük/küçük harf farkı gözetmeden) tek satırda birleşir.
      </p>
      <div className="overflow-x-auto rounded-card border border-subtle bg-surface-1">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only"><AdminFiyatlandirmaText k="matrixCaption" /></caption>
          <thead>
            <tr className="border-b border-subtle bg-surface-muted">
              <th scope="col" className="sticky left-0 z-10 bg-surface-muted px-3 py-2 text-left font-medium text-fg">
                Özellik
              </th>
              {plans.map((p) => (
                <th key={p.id} scope="col" className="px-3 py-2 text-center font-medium text-fg">
                  <span className="block max-w-[10rem] truncate" title={p.name}>{p.name}</span>
                  {!p.isActive ? <span className="qx-small block font-normal text-fg-muted"><AdminFiyatlandirmaText k="offSale" /></span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <LimitRow label="Maks QR kodu (uygulanır)" plans={plans} pick={(p) => p.maxQRCodes} />
            <LimitRow label="Maks şube (uygulanır)" plans={plans} pick={(p) => p.maxBranches} />
            {allRows.map((r) => (
              <tr key={r.key} className="border-b border-subtle last:border-0">
                <th scope="row" className="sticky left-0 z-10 max-w-[16rem] bg-surface-1 px-3 py-1.5 text-left font-normal text-fg">
                  <span className="line-clamp-2">{r.label}</span>
                </th>
                {plans.map((p) => {
                  const on = r.planIds.includes(p.id);
                  const cell = `${p.id}:${r.key}`;
                  const loading = busy === cell;
                  return (
                    <td key={p.id} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${p.name}: ${r.label} — ${on ? 'var (çıkarmak için bas)' : 'yok (eklemek için bas)'}`}
                        disabled={busy !== null}
                        onClick={() => void toggle(p, r.label, !on)}
                        className={cn(
                          'inline-flex h-11 w-11 items-center justify-center rounded-control transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-wait',
                          on ? 'bg-success-subtle text-success hover:bg-success-subtle/70' : 'text-fg-subtle hover:bg-surface-muted'
                        )}
                      >
                        {loading ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : on ? <Check className="h-4 w-4" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={addRow} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor="matrix-new-feature" className="qx-small font-medium text-fg">
            Yeni özellik satırı
          </label>
          <Input id="matrix-new-feature" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder="ör. Öncelikli destek" />
        </div>
        <Button type="submit" variant="outline" className="min-h-11" disabled={!draft.trim()}>
          <Plus className="h-4 w-4" aria-hidden /> Satır ekle
        </Button>
      </form>
      {extra.length ? <p className="qx-small text-fg-muted"><AdminFiyatlandirmaText k="newRowHint" /></p> : null}
    </div>
  );
}

function LimitRow({ label, plans, pick }: { label: string; plans: PlanSummary[]; pick: (p: PlanSummary) => number | null }) {
  return (
    <tr className="border-b border-subtle bg-surface-muted/50">
      <th scope="row" className="sticky left-0 z-10 bg-surface-muted px-3 py-2 text-left font-medium text-fg">
        {label}
      </th>
      {plans.map((p) => {
        const v = pick(p);
        return (
          <td key={p.id} className="px-3 py-2 text-center tabular-nums text-fg">
            {v == null ? 'Sınırsız' : fmtNum(v)}
          </td>
        );
      })}
    </tr>
  );
}

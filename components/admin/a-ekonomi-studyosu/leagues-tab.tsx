'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Trophy, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/states';
import { Field } from '@/components/ds/form';
import { LEAGUE_EMBLEM_COLORS, isLeagueKey } from '@/components/ds/play/league-colors';
import { cn } from '@/lib/utils';
import { DEFAULT_LEAGUE_RULES, type LeagueRule } from '@/lib/league-rules-core';
import { LEAGUE_MIN_LIMIT, deriveLeagueRanges, leagueRuleErrors, type LeaguePreview } from '@/lib/admin-economy/contract';
import { previewLeagues, type LeaguesMeta } from './api';
import { Callout, HistoryPanel, NumField, fmtInt, fmtPct } from './parts';
import type { EditableResource } from './use-editable-resource';

export function leaguesPathLabel(path: string): string {
  const m = path.match(/^\[(\w+)\](?:\.(\w+))?$/);
  if (!m) return path;
  const field: Record<string, string> = { name: 'ad', minPoints: 'başlangıç eşiği', maxPoints: 'üst sınır', gradient: 'renk' };
  const name = DEFAULT_LEAGUE_RULES.find((r) => r.key === m[1])?.name ?? m[1];
  return `${name}${m[2] ? ` · ${field[m[2]] ?? m[2]}` : ''}`;
}

function swatch(key: string): string {
  if (!isLeagueKey(key)) return 'hsl(var(--brand))';
  const c = LEAGUE_EMBLEM_COLORS[key];
  return `linear-gradient(90deg, ${c.from}, ${c.via ? `${c.via}, ` : ''}${c.to})`;
}

export function LeaguesTab({ resource }: { resource: EditableResource<LeagueRule[], LeaguesMeta> }) {
  const rules = resource.draft!;
  const base = resource.baseline!;
  const meta = resource.meta!;
  const errors = React.useMemo(() => leagueRuleErrors(rules), [rules]);
  const valid = Object.keys(errors).length === 0;

  const setRule = (i: number, patch: Partial<LeagueRule>) =>
    resource.setDraft((prev) => deriveLeagueRanges(prev.map((r, j) => (j === i ? { ...r, ...patch } : r))));

  // Taslak geçerli ve kirliyse 500 ms sonra sunucudan etki önizlemesi.
  const [preview, setPreview] = React.useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data?: LeaguePreview }>({ status: 'idle' });
  const draftKey = JSON.stringify(rules.map((r) => r.minPoints));
  React.useEffect(() => {
    if (!resource.dirty || !valid) {
      setPreview({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setPreview((p) => ({ ...p, status: 'loading' }));
      previewLeagues(rules, ctrl.signal)
        .then((data) => setPreview({ status: 'ready', data }))
        .catch((e) => {
          if ((e as { name?: string })?.name !== 'AbortError') setPreview({ status: 'error' });
        });
    }, 500);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, resource.dirty, valid]);

  const dist = meta.distribution;
  const total = meta.totalUsers ?? 0;

  return (
    <div className="space-y-6">
      <SectionCard
        icon={<Users className="h-4 w-4" />}
        title="Lig dağılımı"
        description="Müşteriler (demo ve anonimleştirilmiş hesaplar hariç) harcanabilir puan bakiyesine göre. Her lig yalnız başlangıç eşiğiyle tanımlanır; üst sınır bir sonraki ligin eşiğinden türer, son lig sınırsızdır."
      >
        {dist && total > 0 ? (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={base.map((r) => `${r.name} ${fmtInt(dist[r.key] ?? 0)}`).join(', ')}>
              {base.map((r) => {
                const n = dist[r.key] ?? 0;
                if (n === 0) return null;
                return <span key={r.key} style={{ width: `${(n / total) * 100}%`, background: swatch(r.key) }} className="h-full" />;
              })}
            </div>
            <p className="qx-caption mt-2 text-fg-muted">Toplam {fmtInt(total)} müşteri.</p>
          </>
        ) : dist ? (
          <p className="qx-small text-fg-muted">Henüz sınıflandırılacak müşteri yok.</p>
        ) : (
          <Callout tone="warning">Dağılım okunamadı; kurallar yine düzenlenebilir.</Callout>
        )}
        <Callout tone="neutral" className="mt-3">
          Lig, harcanabilir bakiyeden hesaplanır: ödül kullanan müşterinin ligi düşebilir. Kümülatif kazanca geçiş ürün kararı bekliyor.
        </Callout>
      </SectionCard>

      <SectionCard icon={<Trophy className="h-4 w-4" />} title="Lig eşikleri" density="flush">
        <ol className="divide-y divide-subtle">
          {rules.map((r, i) => {
            const b = base.find((x) => x.key === r.key);
            const users = dist?.[r.key];
            const after = preview.data?.draft[r.key];
            return (
              <li key={r.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
                <span aria-hidden className="mt-1 hidden h-8 w-8 rounded-full sm:block" style={{ background: swatch(r.key) }} />
                <Field label="Ad" error={r.name.trim() ? undefined : 'Ad gerekli'}>
                  {(a11y) => <Input {...a11y} value={r.name} maxLength={32} onChange={(e) => setRule(i, { name: e.target.value })} />}
                </Field>
                {i === 0 ? (
                  <div>
                    <p className="qx-small font-medium">Başlangıç eşiği</p>
                    <p className="qx-small qx-num mt-2">0 puan</p>
                    <p className="qx-caption text-fg-muted">ilk lig her zaman 0&apos;dan başlar</p>
                  </div>
                ) : (
                  <NumField
                    label="Başlangıç eşiği"
                    unit="puan"
                    min={1}
                    max={LEAGUE_MIN_LIMIT}
                    value={r.minPoints}
                    baseline={b?.minPoints}
                    onChange={(v) => setRule(i, { minPoints: v })}
                    description={errors[i]}
                  />
                )}
                <div>
                  <p className="qx-small font-medium">Aralık</p>
                  <p className="qx-small qx-num mt-2">
                    {fmtInt(r.minPoints)} – {i === rules.length - 1 ? 'sınırsız' : fmtInt(r.maxPoints)}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="qx-small font-medium">Müşteri</p>
                  <p className="qx-small qx-num mt-2">
                    {users == null ? '—' : fmtInt(users)}
                    {preview.status === 'ready' && after != null && after !== users && (
                      <span className={cn('ml-1', (after ?? 0) > (users ?? 0) ? 'text-success' : 'text-danger')}>→ {fmtInt(after)}</span>
                    )}
                  </p>
                  {users != null && total > 0 && <p className="qx-caption text-fg-muted">{fmtPct((users / total) * 100)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle px-4 py-3">
          <div className="qx-small" aria-live="polite">
            {!resource.dirty && <span className="text-fg-muted">Eşikleri değiştirince etki burada görünür.</span>}
            {resource.dirty && !valid && <span className="text-danger">Önizleme için hataları düzeltin.</span>}
            {preview.status === 'loading' && <span className="text-fg-muted">Etki hesaplanıyor…</span>}
            {preview.status === 'error' && <span className="text-danger">Etki önizlemesi alınamadı.</span>}
            {preview.status === 'ready' && preview.data && (
              <span className="inline-flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1 text-success">
                  <ArrowUp className="h-4 w-4" aria-hidden /> {fmtInt(preview.data.promoted)} yükselir
                </span>
                <span className="inline-flex items-center gap-1 text-danger">
                  <ArrowDown className="h-4 w-4" aria-hidden /> {fmtInt(preview.data.demoted)} düşer
                </span>
                <span className="text-fg-muted">{fmtInt(preview.data.unchanged)} değişmez</span>
              </span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            onClick={() =>
              resource.setDraft((prev) =>
                deriveLeagueRanges(prev.map((r) => {
                  const d = DEFAULT_LEAGUE_RULES.find((x) => x.key === r.key)!;
                  return { ...r, name: d.name, minPoints: d.minPoints };
                }))
              )
            }
          >
            Varsayılan eşiklere al
          </Button>
        </div>
      </SectionCard>

      <Callout tone="info">
        Leaderboard bu kuralları okur. Son ligin üstündeki ya da eski kayıtlardaki boşluğa düşen müşteriler artık &quot;Başlangıç&quot;a düşmez, eşiğini geçtikleri en yüksek lige yerleşir.
        Lig renkleri lig anahtarına bağlı tema dosyalarından gelir (serbest Tailwind sınıfı alanı kaldırıldı).
      </Callout>

      <HistoryPanel
        kind="leagues"
        labelOf={leaguesPathLabel}
        refreshKey={resource.version}
        onLoadSnapshot={(e) => {
          if (!Array.isArray(e.snapshot)) return;
          const snap = e.snapshot as Array<Partial<LeagueRule>>;
          resource.loadIntoDraft(
            deriveLeagueRanges(
              base.map((r) => {
                const s = snap.find((x) => x?.key === r.key);
                return {
                  ...r,
                  name: typeof s?.name === 'string' && s.name.trim() ? s.name : r.name,
                  minPoints: typeof s?.minPoints === 'number' ? s.minPoints : r.minPoints,
                };
              }).sort((a, b) => a.minPoints - b.minPoints)
            )
          );
        }}
      />
    </div>
  );
}

'use client';

import { useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Pencil, Plus, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { QueryState, TONE_CALLOUT } from '@/components/states';
import { SCOPE_LABEL, type RolloutRow, type RolloutsState } from '@/lib/admin-flags/contract';
import { cn } from '@/lib/utils';
import { archiveFlag, fcKeys, fetchRollouts, putRollout } from './api';
import { fmtAbs, fmtNum, fmtRel } from './format';
import { ReasonDialog } from './reason-dialog';
import { useFeatureLabCopy } from './copy';

/** Europe/Istanbul sabit UTC+3 (2016'dan beri yaz saati yok). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 3 * 3_600_000);
  return d.toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(`${v}:00+03:00`).toISOString() : null);

type Draft = {
  key: string;
  label: string;
  baseUpdatedAt: string | null;
  active: boolean;
  percent: string;
  allow: string;
  expires: string;
  note: string;
};

function draftFrom(r: RolloutRow): Draft {
  return {
    key: r.key,
    label: r.label,
    baseUpdatedAt: r.updatedAt,
    active: r.active,
    percent: String(r.percent),
    allow: r.allowUserIds.join('\n'),
    expires: toLocalInput(r.expiresAt),
    note: r.note ?? '',
  };
}

function RolloutState({ r }: { r: RolloutRow }) {
  const fz = useFeatureLabCopy().fx;
  const ux = useFeatureLabCopy().ui;
  if (!r.active) return <StatusBadge size="sm" tone="neutral" label={ux.durduruldu} />;
  if (r.expired) return <StatusBadge size="sm" tone="info" label={ux.suresiDolduHerkeseAcik2} />;
  if (r.moduleEnabled === false) return <StatusBadge size="sm" tone="danger" label={ux.modulKapali} />;
  return <StatusBadge size="sm" tone="success" label={r.percent >= 100 ? ux.herkeseAcik : fz.pctOn(r.percent)} />;
}

export function RolloutsTab({ initial }: { initial: RolloutsState | null }) {
  const fz = useFeatureLabCopy().fx;
  const ux = useFeatureLabCopy().ui;
  const fx = useFeatureLabCopy();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: fcKeys.rollouts(), queryFn: ({ signal }) => fetchRollouts(signal), initialData: initial ?? undefined, staleTime: 30_000 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [archiving, setArchiving] = useState<{ id: string; key: string } | null>(null);
  const [newKey, setNewKey] = useState('');
  const pickId = useId();
  const data = query.data;
  const visibleOrphans = useMemo(() => data?.orphans.filter((o) => !o.archivedAt) ?? [], [data]);

  return (
    <div className="space-y-6">
      <SectionCard
        title={ux.kademeliAcilis}
        icon={<TrendingUp />}
        description={ux.acikBirModuluKullanicilarin}
      >
        <QueryState query={query} skeleton="list" onRetry={() => query.refetch()}>
          {(d) => (
            <div className="space-y-4">
              {!d.killSwitchOn ? (
                <p role="status" className={cn('rounded-card border px-3 py-2 text-sm', TONE_CALLOUT.warning)}>
                  Acil durdurma etkin: <code className="font-mono">feature_flags</code> {ux.moduluKapaliOlduguIcin}
                  {ux.anahtarlarinaGoreDavraniyorModul}
                </p>
              ) : null}

              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  const c = d.candidates.find((x) => x.key === newKey);
                  if (!c) return;
                  setDraft({ key: c.key, label: c.label, baseUpdatedAt: null, active: false, percent: '10', allow: '', expires: '', note: '' });
                }}
              >
                <div className="flex-1 space-y-1">
                  <Label htmlFor={pickId}>{fx.rolloutModule}</Label>
                  <select
                    id={pickId}
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="flex h-11 w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:h-10"
                  >
                    <option value="">{fx.pickModule}</option>
                    {d.candidates.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label} ({SCOPE_LABEL[c.scope]})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-fg-muted">{fx.gatedOnly}</p>
                </div>
                <Button type="submit" className="min-h-11 sm:min-h-10" disabled={!newKey}>
                  <Plus className="h-4 w-4" aria-hidden />
                  {ux.kuralOlustur}
                </Button>
              </form>

              {d.rollouts.length ? (
                <ul className="divide-y divide-border rounded-card border border-border" aria-label={ux.kademeliAcilisKurallari}>
                  {d.rollouts.map((r) => (
                    <li key={r.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-fg">{r.label}</p>
                          <RolloutState r={r} />
                        </div>
                        <p className="text-xs text-fg-muted">
                          <code className="font-mono">{r.key}</code>
                          {r.allowUserIds.length ? fz.allowlisted(fmtNum(r.allowUserIds.length)) : ''}
                          {r.expiresAt ? fz.endsLower(fmtAbs(r.expiresAt)) : ''}
                          {` · ${fmtRel(r.updatedAt)}`}
                          {r.owner ? ` · ${r.owner}` : ''}
                        </p>
                        {r.note ? <p className="text-sm text-fg-muted">{r.note}</p> : null}
                        {r.active && !r.expired && r.percent < 100 ? (
                          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={fz.pctAria(r.percent)}>
                            <div className="h-full rounded-full bg-brand" style={{ width: `${r.percent}%` }} />
                          </div>
                        ) : null}
                      </div>
                      <Button variant="outline" className="min-h-11 shrink-0 sm:min-h-9" onClick={() => setDraft(draftFrom(r))}>
                        <Pencil className="h-4 w-4" aria-hidden />
                        {ux.duzenle}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">
                  {ux.henuzKademeliAcilisKurali}
                </p>
              )}
            </div>
          )}
        </QueryState>
      </SectionCard>

      <SectionCard
        title={ux.yetimBayraklar}
        icon={<Archive />}
        description={ux.eskiOzellikBayragiEkraninda}
      >
        {visibleOrphans.length ? (
          <ul className="divide-y divide-border rounded-card border border-border">
            {visibleOrphans.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-fg">{o.name}</p>
                  <p className="truncate text-xs text-fg-muted">
                    <code className="font-mono">{o.key}</code>{fz.orphanLine(o.isEnabled ? ux.acik2 : ux.kapali2, fmtRel(o.updatedAt))}
                  </p>
                </div>
                <Button variant="outline" className="min-h-11 shrink-0 sm:min-h-9" onClick={() => setArchiving({ id: o.id, key: o.key })}>
                  <Archive className="h-4 w-4" aria-hidden />
                  {ux.arsivle}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{data ? 'Yetim bayrak yok.' : '—'}</p>
        )}
      </SectionCard>

      {draft ? (
        <RolloutEditor
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={async () => {
            setNewKey('');
            await qc.invalidateQueries({ queryKey: fcKeys.all });
          }}
        />
      ) : null}

      <ReasonDialog
        open={archiving !== null}
        onOpenChange={(v) => !v && setArchiving(null)}
        title={ux.yetimBayrakArsivlensinMi}
        description={ux.kayitSilinmezListedenKalkar}
        confirmPhrase={archiving?.key}
        confirmLabel={ux.arsivle}
        tone="warning"
        onConfirm={async (reason) => {
          if (!archiving) return;
          await archiveFlag(archiving.id, reason);
          toast.success(ux.bayrakArsivlendi);
          await qc.invalidateQueries({ queryKey: fcKeys.rollouts() });
        }}
      />
    </div>
  );
}

function RolloutEditor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => Promise<void> }) {
  const fz = useFeatureLabCopy().fx;
  const uy = useFeatureLabCopy().ui2;
  const ux = useFeatureLabCopy().ui;
  const fx = useFeatureLabCopy();
  const [d, setD] = useState(draft);
  const ids = { pct: useId(), allow: useId(), exp: useId(), note: useId(), active: useId() };
  const pct = Number.parseInt(d.percent, 10);
  const pctValid = Number.isInteger(pct) && pct >= 0 && pct <= 100;
  const allowList = d.allow
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const isNew = d.baseUpdatedAt === null;

  return (
    <ReasonDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={fz.rolloutTitle(d.label)}
      description={isNew ? ux.yeniKuralKapaliTaslak : ux.kaydedinceModulKapisiEn}
      impact={[
        { label: ux.kapsam, value: d.active ? (pctValid ? fz.scopeValue(String(pct), allowList.length) : '—') : ux.kuralEtkinDegilModul, emphasis: true },
        { label: ux.bitis, value: d.expires ? fz.expiresValue(d.expires.replace('T', ' ')) : fz.none },
      ]}
      warning={d.active && pctValid && pct === 0 && !allowList.length ? ux.yuzde0VeBos : undefined}
      confirmLabel={isNew ? ux.kuraliOlustur : 'Kaydet'}
      onConfirm={async (reason) => {
        if (!pctValid) throw new Error(fz.pctInvalid);
        await putRollout(d.key, {
          active: d.active,
          percent: pct,
          allowUserIds: allowList,
          expiresAt: fromLocalInput(d.expires),
          note: d.note.trim() || null,
          reason,
          baseUpdatedAt: d.baseUpdatedAt,
        });
        toast.success(isNew ? ux.kademeliAcilisKuraliOlusturuldu : ux.kuralGuncellendi);
        await onSaved();
      }}
    >
      <div className="flex items-center justify-between gap-3 rounded-card border border-border px-3 py-2">
        <Label htmlFor={ids.active} className="text-sm">
          {uy.kuralEtkin}
        </Label>
        <Switch id={ids.active} checked={d.active} onCheckedChange={(v) => setD({ ...d, active: v })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={ids.pct}>{fx.userPercent}</Label>
          <Input
            id={ids.pct}
            inputMode="numeric"
            value={d.percent}
            onChange={(e) => setD({ ...d, percent: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
            aria-invalid={!pctValid}
            aria-describedby={`${ids.pct}-hint`}
          />
          <p id={`${ids.pct}-hint`} className="text-xs text-fg-muted">
            {ux.t0100YuzdeyiArtirmak}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.exp}>{fx.endsOptional}</Label>
          <Input id={ids.exp} type="datetime-local" value={d.expires} onChange={(e) => setD({ ...d, expires: e.target.value })} />
          <p className="text-xs text-fg-muted">{fx.istanbulTime}</p>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={ids.allow}>{fx.allowlist}</Label>
        <Textarea id={ids.allow} rows={3} value={d.allow} onChange={(e) => setD({ ...d, allow: e.target.value })} className="font-mono text-xs" placeholder={ux.herSatiraBirKullanici} />
        <p className="text-xs text-fg-muted">{fz.idsCount(fmtNum(allowList.length))}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor={ids.note}>{fx.noteOptional}</Label>
        <Input id={ids.note} value={d.note} maxLength={300} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder={ux.orYeniKlanAkisi} />
      </div>
    </ReasonDialog>
  );
}

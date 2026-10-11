'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ChoiceChips } from '@/components/ds/a11y';
import { SectionCard } from '@/components/ds/page';
import type { NameDisplay, WallOverviewDto, WallRules } from '@/lib/dealer/voc-wall/config';
import { VOC_ROOT, WallApiError, saveRules } from './api';
import { useVocCopy } from './copy';

const STARS = ['1', '2', '3', '4', '5'] as const;
const NAMES: NameDisplay[] = ['masked', 'none'];
const ROTATE = [6, 8, 10, 15, 20, 30];

const selectCls =
  'min-h-11 w-full rounded-control border border-input bg-background px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

/** Yayın kuralları — yalnız bayi sahibi düzenler; diğerleri salt-okunur özet görür. */
export function RulesPanel({ overview, canEdit }: { overview: WallOverviewDto; canEdit: boolean }) {
  const [draft, setDraft] = useState<WallRules>(overview.rules);
  const copy = useVocCopy();
  const c = copy.rules;
  const qc = useQueryClient();
  const ids = { text: useId(), rotate: useId(), qr: useId(), stars: useId(), name: useId() };
  const saved = JSON.stringify(overview.rules);
  useEffect(() => setDraft(JSON.parse(saved) as WallRules), [saved]);
  const dirty = JSON.stringify(draft) !== saved;

  const mutation = useMutation({
    mutationFn: () => saveRules(draft),
    onSuccess: () => {
      toast.success(c.saved);
      void qc.invalidateQueries({ queryKey: VOC_ROOT });
    },
    onError: (e) => toast.error(e instanceof WallApiError ? e.message : c.saveFailed),
  });

  const set = <K extends keyof WallRules>(k: K, v: WallRules[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <SectionCard
      title={c.title}
      description={c.hint}
      density="compact"
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canEdit && dirty) mutation.mutate();
        }}
      >
        <fieldset disabled={!canEdit || mutation.isPending} className="space-y-5 disabled:opacity-80">
          <div className="space-y-2">
            <p id={ids.stars} className="qx-small font-medium text-fg">
              {c.minRating}
            </p>
            <ChoiceChips
              aria-labelledby={ids.stars}
              size="sm"
              options={STARS.map((v) => ({ value: v, label: `${v}★+`, textLabel: c.starLabel(v) }))}
              value={String(draft.minRating) as '1'}
              onChange={(v) => v && set('minRating', Number(v))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={ids.text} className="qx-small font-medium text-fg">
              {c.textOnly}
              <span className="block font-normal text-fg-muted">{c.textOnlyHint}</span>
            </label>
            <Switch id={ids.text} checked={draft.requireText} onCheckedChange={(v) => set('requireText', v)} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <p id={ids.name} className="qx-small font-medium text-fg">
              {c.customerName}
            </p>
            <ChoiceChips aria-labelledby={ids.name} size="sm" options={NAMES.map((v) => ({ value: v, label: c.name[v] }))} value={draft.nameDisplay} onChange={(v) => v && set('nameDisplay', v)} />
            <p className="qx-caption text-fg-muted">{c.fullNameNever}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={ids.rotate} className="qx-small font-medium text-fg">
                {c.rotate}
              </label>
              <select id={ids.rotate} className={selectCls} value={draft.rotateSeconds} onChange={(e) => set('rotateSeconds', Number(e.target.value))}>
                {ROTATE.map((s) => (
                  <option key={s} value={s}>
                    {c.seconds(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.qr} className="qx-small font-medium text-fg">
                {c.defaultQr}
              </label>
              <select id={ids.qr} className={selectCls} value={draft.qrCodeId ?? ''} onChange={(e) => set('qrCodeId', e.target.value || null)}>
                <option value="">{copy.common.allQr}</option>
                {overview.qrCodes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.location ? `${q.location} · ${q.name}` : q.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>
        {canEdit ? (
          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => setDraft(overview.rules)}>
                {copy.common.cancel}
              </Button>
            )}
            <Button type="submit" className="min-h-11" disabled={!dirty || mutation.isPending}>
              <Save aria-hidden className="mr-2 h-4 w-4" />
              {mutation.isPending ? copy.common.saving : copy.common.save}
            </Button>
          </div>
        ) : (
          <p className="qx-caption text-fg-muted">{c.ownerOnly}</p>
        )}
      </form>
    </SectionCard>
  );
}

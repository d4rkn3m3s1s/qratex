'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import type { InterventionConfigDto } from '@/lib/dealer-customers/types';
import { CustomersApiError, customerKeys, fetchIntervention, saveIntervention } from './api';
import { useCustomersCopy } from './copy';

const THRESHOLDS = [40, 50, 60, 70, 80] as const;
const DAYS = [7, 14, 30, 60] as const;
const MAX_RUN = [10, 20, 50, 100] as const;

function withCurrent<T extends number>(base: readonly T[], current: number): number[] {
  return base.includes(current as T) ? [...base] : [...base, current].sort((a, b) => a - b);
}

/**
 * Otomatik kayıp müdahalesi ayarı — içgörünün önüne değil, "Ayarla" ile açılan çekmeceye taşındı.
 * Eşik yüzde ile seçilir; seçim değişince sunucu "bu ayarlarla şu an kaç müşteri işaretlenir"
 * önizlemesini döner. Kaydedilmemiş değişiklik görünür; alan hataları sunucudan gelir.
 */
export function InterventionSheet({
  open,
  onOpenChange,
  initial,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: InterventionConfigDto;
  canEdit: boolean;
}) {
  const copy = useCustomersCopy();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<InterventionConfigDto>(initial);
  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const preview = useQuery({
    queryKey: customerKeys.intervention(draft.thresholdPercent, draft.inactiveDays),
    queryFn: () => fetchIntervention(draft.thresholdPercent, draft.inactiveDays),
    enabled: open,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: () => saveIntervention(draft),
    onSuccess: () => {
      toast.success(copy.saved);
      announce(copy.saved);
      void qc.invalidateQueries({ queryKey: customerKeys.risk() });
      onOpenChange(false);
    },
  });

  const fieldErrors = useMemo(() => {
    const err = save.error;
    const out: Record<string, string> = {};
    if (err instanceof CustomersApiError && Array.isArray(err.details)) {
      for (const d of err.details as Array<{ path?: string; message?: string }>) if (d.path && d.message) out[d.path] = d.message;
    }
    return out;
  }, [save.error]);

  const set = <K extends keyof InterventionConfigDto>(k: K, v: InterventionConfigDto[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const disabled = !canEdit || save.isPending;

  return (
    <Sheet open={open} onOpenChange={(o) => (!save.isPending ? onOpenChange(o) : undefined)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-10 text-left">
          <SheetTitle>{copy.automationTitle}</SheetTitle>
          <SheetDescription>{copy.automationDesc}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="iv-enabled" className="qx-small font-medium text-fg">
                {copy.enabled}
              </Label>
              <p className="qx-caption text-fg-muted">{copy.enabledHint}</p>
            </div>
            <Switch id="iv-enabled" checked={draft.enabled} onCheckedChange={(v) => set('enabled', v)} disabled={disabled} />
          </div>

          <fieldset className="space-y-2" disabled={disabled}>
            <legend id="iv-threshold" className="qx-small font-medium text-fg">
              {copy.threshold}
            </legend>
            <ChoiceChips
              aria-labelledby="iv-threshold"
              size="sm"
              value={String(draft.thresholdPercent)}
              onChange={(v) => v && set('thresholdPercent', Number(v))}
              options={withCurrent(THRESHOLDS, draft.thresholdPercent).map((t) => ({ value: String(t), label: `%${t}` }))}
            />
            {fieldErrors.thresholdPercent && <InlineError>{fieldErrors.thresholdPercent}</InlineError>}
          </fieldset>

          <fieldset className="space-y-2" disabled={disabled}>
            <legend id="iv-days" className="qx-small font-medium text-fg">
              {copy.inactiveDays}
            </legend>
            <ChoiceChips
              aria-labelledby="iv-days"
              size="sm"
              value={String(draft.inactiveDays)}
              onChange={(v) => v && set('inactiveDays', Number(v))}
              options={withCurrent(DAYS, draft.inactiveDays).map((d) => ({ value: String(d), label: copy.daysUnit(d) }))}
            />
            {fieldErrors.inactiveDays && <InlineError>{fieldErrors.inactiveDays}</InlineError>}
          </fieldset>

          <fieldset className="space-y-2" disabled={disabled}>
            <legend id="iv-max" className="qx-small font-medium text-fg">
              {copy.maxPerRun}
            </legend>
            <ChoiceChips
              aria-labelledby="iv-max"
              size="sm"
              value={String(draft.maxPerRun)}
              onChange={(v) => v && set('maxPerRun', Number(v))}
              options={withCurrent(MAX_RUN, draft.maxPerRun).map((n) => ({ value: String(n), label: String(n) }))}
            />
            <p className="qx-caption text-fg-muted">{copy.maxPerRunHint}</p>
            {fieldErrors.maxPerRun && <InlineError>{fieldErrors.maxPerRun}</InlineError>}
          </fieldset>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="iv-offer" className="qx-small font-medium text-fg">
                {copy.autoOffer}
              </Label>
              <p className="qx-caption text-fg-muted">{copy.autoOfferHint}</p>
            </div>
            <Switch id="iv-offer" checked={draft.autoOffer} onCheckedChange={(v) => set('autoOffer', v)} disabled={disabled} />
          </div>

          <p aria-live="polite" className="qx-small rounded-control border border-subtle bg-surface-muted px-3 py-2 text-fg">
            {preview.data ? copy.previewMatching(preview.data.preview.matching) : preview.isError ? copy.previewError : copy.previewLoading}
          </p>

          {save.isError && Object.keys(fieldErrors).length === 0 && <InlineError variant="banner">{(save.error as Error).message}</InlineError>}
          {!canEdit && <p className="qx-caption text-fg-muted">{copy.ownerOnly}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-subtle pt-4">
            {dirty && <span className="qx-caption mr-auto text-warning">{copy.unsaved}</span>}
            <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              {copy.cancel}
            </Button>
            <Button className="min-h-11" onClick={() => save.mutate()} disabled={!dirty || !canEdit} loading={save.isPending}>
              {copy.save}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

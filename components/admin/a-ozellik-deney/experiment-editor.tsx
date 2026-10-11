'use client';

import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { CreateExperimentBody, DIMENSIONS, DIMENSION_LABEL, type Dimension } from '@/lib/admin-flags/contract';
import { errorText } from './api';
import { useFeatureLabCopy } from './copy';

export type ExperimentDraft = {
  id: string;
  name: string;
  dimension: Dimension;
  hypothesis: string;
  primaryMetric: string;
  variantA: string;
  variantB: string;
  splitPercentB: string;
};

export type ExperimentValues = {
  id: string;
  name: string;
  dimension: Dimension;
  hypothesis: string | null;
  primaryMetric: string | null;
  variantA: string;
  variantB: string;
  splitPercentB: number;
};

export const emptyExperimentDraft = (split: number): ExperimentDraft => ({
  id: '',
  name: '',
  dimension: 'copy',
  hypothesis: '',
  primaryMetric: 'Varyantı gören kullanıcının dönüşüm olayı (buton tıklaması)',
  variantA: '',
  variantB: '',
  splitPercentB: String(split),
});

const PLACEHOLDER: Record<Dimension, [string, string]> = {
  copy: ['Mevcut metin (kontrol)', 'Yeni metin'],
  push_title: ['Mevcut bildirim başlığı', 'Yeni bildirim başlığı'],
  push_hour: ['18:00', '19:30'],
  banner_image: ['https://…/mevcut.jpg', 'https://…/yeni.jpg'],
};

const slug = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/**
 * Deney oluştur / düzenle. İstemci ve sunucu aynı zod şemasını kullanır (Türkçe mesajlar).
 * Başlamış deneyde varyant, boyut ve pay kilitlidir (atama bozulmasın).
 */
export function ExperimentEditor({
  mode,
  initial,
  lockVariants = false,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial: ExperimentDraft;
  lockVariants?: boolean;
  onClose: () => void;
  onSubmit: (v: ExperimentValues) => Promise<void>;
}) {
  const fx = useFeatureLabCopy();
  const [d, setD] = useState(initial);
  const [idTouched, setIdTouched] = useState(mode === 'edit');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = { id: useId(), name: useId(), hyp: useId(), metric: useId(), a: useId(), b: useId(), split: useId(), dim: useId() };
  const set = (patch: Partial<ExperimentDraft>) => setD((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (busy) return;
    const values = {
      id: d.id,
      name: d.name,
      dimension: d.dimension,
      hypothesis: d.hypothesis.trim() || null,
      primaryMetric: d.primaryMetric.trim() || null,
      variantA: d.variantA,
      variantB: d.variantB,
      splitPercentB: Number.parseInt(d.splitPercentB, 10),
      baseVersion: null,
    };
    const parsed = CreateExperimentBody.safeParse(values);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const i of parsed.error.issues) map[String(i.path[0] ?? 'form')] ??= i.message;
      setErrors(map);
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      const { baseVersion: _ignored, ...rest } = parsed.data;
      void _ignored;
      await onSubmit(rest);
      onClose();
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) =>
    errors[k] ? (
      <p id={`${k}-err`} className="text-xs text-danger">
        {errors[k]}
      </p>
    ) : null;
  const [phA, phB] = PLACEHOLDER[d.dimension];

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Yeni A/B deneyi' : 'Deneyi düzenle'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Deney taslak olarak doğar; “Başlat” denene kadar hiçbir kullanıcı etkilenmez.' : lockVariants ? 'Deney başladığı için varyantlar, boyut ve trafik payı kilitli.' : 'Taslak deney.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={f.name}>Ad</Label>
            <Input
              id={f.name}
              value={d.name}
              maxLength={120}
              onChange={(e) => set({ name: e.target.value, ...(idTouched ? {} : { id: slug(e.target.value) }) })}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-err' : undefined}
            />
            {err('name')}
          </div>
          <div className="space-y-1">
            <Label htmlFor={f.id}>{fx.experimentKey}</Label>
            <Input
              id={f.id}
              value={d.id}
              disabled={mode === 'edit'}
              className="font-mono"
              onChange={(e) => {
                setIdTouched(true);
                set({ id: e.target.value.toLowerCase() });
              }}
              aria-invalid={!!errors.id}
              aria-describedby={`${f.id}-hint${errors.id ? ' id-err' : ''}`}
            />
            <p id={`${f.id}-hint`} className="text-xs text-fg-muted">
              İstemci bu anahtarla varyant ister: <code className="font-mono">/api/customer/innovation/ab/variant?experimentId={d.id || '…'}</code>. Sonradan değiştirilemez.
            </p>
            {err('id')}
          </div>
          <div className="space-y-1">
            <Label htmlFor={f.hyp}>Hipotez</Label>
            <Textarea id={f.hyp} rows={2} maxLength={500} value={d.hypothesis} onChange={(e) => set({ hypothesis: e.target.value })} placeholder="B metni, kampanya butonuna tıklamayı artırır çünkü…" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={f.metric}>Birincil metrik</Label>
            <Input id={f.metric} maxLength={160} value={d.primaryMetric} onChange={(e) => set({ primaryMetric: e.target.value })} />
            <p className="text-xs text-fg-muted">{fx.measured}</p>
          </div>
          <div className="space-y-2">
            <p id={f.dim} className="text-sm font-medium text-fg">
              Boyut
            </p>
            <ChoiceChips<Dimension>
              aria-labelledby={f.dim}
              options={DIMENSIONS.map((v) => ({ value: v, label: DIMENSION_LABEL[v] }))}
              value={d.dimension}
              onChange={(v) => v && set({ dimension: v })}
              disabled={lockVariants}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={f.a}>{fx.variantA}</Label>
              <Input
                id={f.a}
                value={d.variantA}
                placeholder={phA}
                disabled={lockVariants}
                onChange={(e) => set({ variantA: e.target.value })}
                aria-invalid={!!errors.variantA}
                aria-describedby={errors.variantA ? 'variantA-err' : undefined}
              />
              {err('variantA')}
            </div>
            <div className="space-y-1">
              <Label htmlFor={f.b}>{fx.variantB}</Label>
              <Input
                id={f.b}
                value={d.variantB}
                placeholder={phB}
                disabled={lockVariants}
                onChange={(e) => set({ variantB: e.target.value })}
                aria-invalid={!!errors.variantB}
                aria-describedby={errors.variantB ? 'variantB-err' : undefined}
              />
              {err('variantB')}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={f.split}>B'ye giden trafik (%)</Label>
            <Input
              id={f.split}
              inputMode="numeric"
              value={d.splitPercentB}
              disabled={lockVariants}
              onChange={(e) => set({ splitPercentB: e.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
              aria-invalid={!!errors.splitPercentB}
              aria-describedby={errors.splitPercentB ? 'splitPercentB-err' : undefined}
              className="max-w-[8rem]"
            />
            {err('splitPercentB')}
          </div>
          {formError ? <InlineError>{formError}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11 sm:min-h-10" disabled={busy} aria-busy={busy}>
              {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
              {mode === 'create' ? 'Taslağı oluştur' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useEffect, useId, useState } from 'react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChoiceChips } from '@/components/ds/a11y';
import { EntityEditorSheet, NumberField, SelectField, SwitchField, TextField, TextareaField, useZodForm } from '@/components/ds/form';
import { isoToIstanbulInput, istanbulInputToIso } from '@/lib/admin-discovery/contract';
import {
  CATEGORY_LABEL,
  impactFor,
  KNOWN_CATEGORIES,
  projectUpsertSchema,
  type ProjectDetail,
  type ProjectUpsertValues,
} from '@/lib/admin-donations/contract';
import { cn } from '@/lib/utils';
import { createProject, updateProject } from '../api';
import { fmtDecimal, fmtNumber } from '../format';
import { CATEGORY_EMOJI, ICON_CHOICES, ProgressBar } from './parts';

/**
 * Form değeri: sayılar `number | null`, tarihler `datetime-local` (İstanbul). Oran TEK yerden
 * girilir: "X puan = Y birim" (rapor B7: üç ayrı giriş + yanıltıcı "uygulandı" toast'ları vardı);
 * 1 puanın değeri türetilip salt okunur gösterilir.
 */
type ProjectForm = {
  name: string;
  description: string;
  icon: string;
  category: (typeof KNOWN_CATEGORIES)[number] | '';
  goal: number | null;
  unit: string;
  label: string;
  ratioPoints: number | null;
  ratioUnits: number | null;
  tagsText: string;
  isFeatured: boolean;
  isActive: boolean;
  startLocal: string;
  endLocal: string;
};

function parseTagsText(t: string): string[] {
  return t
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toValues(f: ProjectForm): unknown {
  const perPoint = f.ratioPoints && f.ratioUnits != null && f.ratioPoints > 0 ? f.ratioUnits / f.ratioPoints : Number.NaN;
  return {
    name: f.name,
    description: f.description,
    icon: f.icon,
    category: f.category || undefined,
    goal: f.goal ?? Number.NaN,
    impact: { unit: f.unit, label: f.label, perPoint },
    tags: parseTagsText(f.tagsText),
    isFeatured: f.isFeatured,
    isActive: f.isActive,
    startDate: istanbulInputToIso(f.startLocal) ?? 'geçersiz',
    endDate: f.endLocal ? istanbulInputToIso(f.endLocal) ?? 'geçersiz' : null,
  };
}

const MAP: Record<string, keyof ProjectForm> = {
  'impact.perPoint': 'ratioUnits',
  'impact.unit': 'unit',
  'impact.label': 'label',
  startDate: 'startLocal',
  endDate: 'endLocal',
  tags: 'tagsText',
};

const formSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    icon: z.string(),
    category: z.string(),
    goal: z.number().nullable(),
    unit: z.string(),
    label: z.string(),
    ratioPoints: z.number().nullable(),
    ratioUnits: z.number().nullable(),
    tagsText: z.string(),
    isFeatured: z.boolean(),
    isActive: z.boolean(),
    startLocal: z.string(),
    endLocal: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.ratioPoints || v.ratioPoints < 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ratioPoints'], message: 'En az 1 puan.' });
    const r = projectUpsertSchema.safeParse(toValues(v as ProjectForm));
    if (!r.success) {
      for (const i of r.error.issues) {
        const joined = i.path.join('.');
        const key = MAP[joined] ?? MAP[String(i.path[0])] ?? String(i.path[0] ?? 'name');
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: i.message });
      }
    }
  });

function ratioFrom(perPoint: number | undefined): { ratioPoints: number; ratioUnits: number } {
  if (!perPoint || perPoint <= 0) return { ratioPoints: 100, ratioUnits: 1 };
  if (perPoint >= 1) return { ratioPoints: 1, ratioUnits: Math.round(perPoint * 10000) / 10000 };
  // En küçük "yuvarlak" taban: 10, 100, 1000 …
  for (const base of [10, 100, 1000, 10000, 100000]) {
    const units = perPoint * base;
    if (Math.abs(units - Math.round(units * 100) / 100) < 1e-9) return { ratioPoints: base, ratioUnits: Math.round(units * 100) / 100 };
  }
  return { ratioPoints: 1000, ratioUnits: Math.round(perPoint * 1000 * 10000) / 10000 };
}

function toForm(p: ProjectDetail | null): ProjectForm {
  const ratio = ratioFrom(p?.impact?.perPoint);
  return {
    name: p?.name ?? '',
    description: p?.description ?? '',
    icon: p?.icon ?? '',
    category: p && p.category !== 'other' ? p.category : '',
    goal: p?.goal ?? null,
    unit: p?.impact?.unit ?? '',
    label: p?.impact?.label ?? '',
    ...ratio,
    tagsText: (p?.tags ?? []).join(', '),
    isFeatured: p?.featured ?? false,
    isActive: p ? p.isActive : false,
    startLocal: isoToIstanbulInput(p?.startDate ?? new Date().toISOString()),
    endLocal: isoToIstanbulInput(p?.endDate),
  };
}

export function ProjectEditor({
  open,
  project,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  project: ProjectDetail | null;
  onOpenChange: (o: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const form = useZodForm<ProjectForm>(formSchema as unknown as z.ZodType<ProjectForm>, { defaultValues: toForm(project) });
  const { reset } = form;
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (open) {
      reset(toForm(project));
      setConflict(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id, project?.updatedAt]);

  return (
    <EntityEditorSheet<ProjectForm>
      open={open}
      onOpenChange={onOpenChange}
      mode={project ? 'edit' : 'create'}
      entityLabel="kampanya"
      title={project ? `“${project.name}” düzenle` : 'Yeni bağış kampanyası'}
      description="Her kayıt denetim kaydına yazılır. Kurallar müşteri ekranıyla aynıdır: hedef ≥ 1 puan, 1 puanın etkisi > 0, kategori listeden."
      form={form}
      width="xl"
      successToast={project ? 'Kampanya güncellendi' : 'Kampanya oluşturuldu'}
      onSubmit={async (f) => {
        const values = projectUpsertSchema.parse(toValues(f)) as ProjectUpsertValues;
        if (project) return (await updateProject(project.id, values, project.updatedAt)).id;
        return (await createProject(values)).id;
      }}
      onServerError={(info) => setConflict(info.conflict)}
      onSaved={(id) => onSaved(String(id))}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          {conflict ? (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Kampanya siz düzenlerken değişti (başka bir yönetici ya da yeni bir bağış). Çekmeceyi kapatıp yeniden açarak güncel hali yükleyin.
            </p>
          ) : null}
          <TextField control={form.control} name="name" label="Kampanya adı" required maxLength={80} />
          <TextareaField control={form.control} name="description" label="Açıklama" required maxLength={2000} rows={4} description="Müşteri kartında görünür. Oranı metne yazmayın; kart oranı kendisi gösterir." />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="category"
              label="Kategori"
              placeholder="Seçin"
              options={KNOWN_CATEGORIES.map((c) => ({ value: c, label: `${CATEGORY_EMOJI[c]} ${CATEGORY_LABEL[c]}` }))}
            />
            <NumberField control={form.control} name="goal" label="Hedef" unit="puan" min={1} max={100_000_000} />
          </div>
          <IconPicker control={form.control} />
          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium text-fg">Etki</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="label" label="Etki etiketi" placeholder="Temiz su" maxLength={80} />
              <TextField control={form.control} name="unit" label="Birim" placeholder="litre" maxLength={40} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <NumberField control={form.control} name="ratioPoints" label="Puan" unit="puan" min={1} max={1_000_000} />
              <span className="pb-3 text-fg-muted" aria-hidden>
                =
              </span>
              <NumberField control={form.control} name="ratioUnits" label="Etki miktarı" mode="decimal" precision={4} min={0} max={1_000_000} />
            </div>
            <RatioNote control={form.control} />
          </fieldset>
          <TextField control={form.control} name="tagsText" label="Etiketler" optional description="Virgülle ayırın (en fazla 8). Müşteri kartında gösterilir." />
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField control={form.control} name="startLocal" label="Başlangıç (İstanbul)" />
            <DateField control={form.control} name="endLocal" label="Bitiş (İstanbul)" optional />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SwitchField control={form.control} name="isActive" label="Bağışa açık" description="Kapalıyken müşteride görünmez." variant="card" />
            <SwitchField control={form.control} name="isFeatured" label="Öne çıkar" description="Müşteri listesinde üstte gösterilir." variant="card" />
          </div>
        </div>
        <LivePreview control={form.control} current={project?.current ?? 0} />
      </div>
    </EntityEditorSheet>
  );
}

function IconPicker({ control }: { control: Control<ProjectForm> }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name="icon"
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <Label id={`${id}-l`}>Simge</Label>
          <div role="radiogroup" aria-labelledby={`${id}-l`} className="flex flex-wrap gap-1.5">
            {ICON_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={field.value === e}
                aria-label={`Simge ${e}`}
                onClick={() => field.onChange(e)}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-md border text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  field.value === e ? 'border-brand bg-brand-subtle' : 'border-border hover:bg-surface-2'
                )}
              >
                {e}
              </button>
            ))}
            <Input aria-label="Başka bir emoji" className="h-11 w-20 text-center text-xl" maxLength={8} value={ICON_CHOICES.includes(field.value) ? '' : field.value} placeholder="✍️" onChange={(ev) => field.onChange(ev.target.value.trim())} />
          </div>
          {fieldState.error ? (
            <p role="alert" className="text-sm text-danger">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

function DateField({ control, name, label, optional }: { control: Control<ProjectForm>; name: 'startLocal' | 'endLocal'; label: string; optional?: boolean }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <Label htmlFor={id}>
            {label} {optional ? <span className="font-normal text-fg-muted">(isteğe bağlı)</span> : null}
          </Label>
          <Input
            id={id}
            type="datetime-local"
            className="min-h-11"
            value={field.value ?? ''}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
            aria-invalid={fieldState.error ? true : undefined}
            aria-describedby={fieldState.error ? `${id}-e` : undefined}
          />
          {fieldState.error ? (
            <p id={`${id}-e`} role="alert" className="text-sm text-danger">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

function RatioNote({ control }: { control: Control<ProjectForm> }) {
  const [p, u, unit] = useWatch({ control, name: ['ratioPoints', 'ratioUnits', 'unit'] });
  if (!p || u == null || p <= 0) return null;
  const per = u / p;
  return (
    <p className="text-xs text-fg-muted" aria-live="polite">
      1 puan = {fmtDecimal(per)} {unit || 'birim'}
      {per > 0 && per < 0.01 ? ' · küçük bağışlarda etki 0,01’in altında kalır; müşteri en az 0,01 gösterir.' : ''}
    </p>
  );
}

/** Müşteri kartının birebir hesabıyla canlı önizleme + 100/500/1000 puanlık bağış etkisi. */
function LivePreview({ control, current }: { control: Control<ProjectForm>; current: number }) {
  const v = useWatch({ control });
  const per = v.ratioPoints && v.ratioUnits != null && v.ratioPoints > 0 ? v.ratioUnits / v.ratioPoints : null;
  const goal = v.goal ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 1000) / 10) : null;
  const overGoal = goal > 0 && current >= goal;
  return (
    <aside className="space-y-3 lg:sticky lg:top-0" aria-label="Müşteri önizlemesi">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Müşteri böyle görür</p>
      <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl" aria-hidden>
            {v.icon || '❔'}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-fg">{v.name || 'Kampanya adı'}</p>
            <p className="text-xs text-fg-muted">{v.category ? CATEGORY_LABEL[v.category as keyof typeof CATEGORY_LABEL] : 'Kategori seçilmedi'}</p>
          </div>
        </div>
        <ProgressBar percent={pct} label="Önizleme ilerlemesi" done={overGoal} />
        <p className="text-xs tabular-nums text-fg-muted">
          {fmtNumber(current)} / {goal > 0 ? fmtNumber(goal) : '—'} puan {pct != null ? `· %${fmtDecimal(pct)}` : ''}
        </p>
        {per ? (
          <table className="w-full text-sm">
            <caption className="sr-only">Bağış tutarına göre etki</caption>
            <tbody>
              {[100, 500, 1000].map((pts) => (
                <tr key={pts} className="border-t border-border">
                  <th scope="row" className="py-1 text-left font-normal text-fg-muted">
                    {fmtNumber(pts)} puan
                  </th>
                  <td className="py-1 text-right tabular-nums">
                    {fmtDecimal(impactFor(pts, per))} {v.unit || 'birim'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-fg-muted">Oran girilince etki tablosu görünür.</p>
        )}
      </div>
      {overGoal ? (
        <p role="status" className="flex items-start gap-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Hedef toplanan puanın altında: kampanya hemen “tamamlandı” sayılır ve yeni bağış almaz.
        </p>
      ) : null}
    </aside>
  );
}

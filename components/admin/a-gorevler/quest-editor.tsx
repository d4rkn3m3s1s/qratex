'use client';

import { useEffect, useMemo } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Coins, Lock, RotateCcw } from 'lucide-react';
import {
  EntityEditorSheet,
  Field,
  NumberField,
  SelectField,
  SwitchField,
  TextField,
  TextareaField,
  errorMessageOf,
  useZodForm,
} from '@/components/ds/form';
import { ChoiceChips } from '@/components/ds/a11y';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CADENCE_HINT,
  CADENCE_LABEL,
  CREATABLE_MECHANICS,
  DETAILED_MIN_LENGTH_DEFAULT,
  ICON_CHOICES,
  MECHANIC_META,
  QUEST_CADENCES,
  QUEST_MAX_POINTS,
  QUEST_MAX_XP,
  REWARD_WARN_MULTIPLIER,
  formToCreateInput,
  isoToIstanbulWall,
  istanbulWallToIso,
  questFormSchema,
  type QuestCadence,
  type QuestDetail,
  type QuestFormValues,
  type QuestListItem,
  type QuestTemplate,
  type QuestUpdateInput,
} from '@/lib/admin-quests/contract';
import { createQuest, fetchOptions, fetchQuest, questsKeys, updateQuest } from './api';
import { QuestPreview } from './quest-preview';
import { fmtNumber } from './format';

const ANY_CATEGORY = '__any__';

function emptyValues(def: { points: number; xp: number } | undefined): QuestFormValues {
  return {
    name: '',
    description: '',
    icon: '🎯',
    cadence: 'daily',
    mechanic: 'give_feedback',
    target: 1,
    category: '',
    minLength: null,
    points: def?.points ?? 50,
    xp: def?.xp ?? 25,
    hasExpiry: false,
    expiresWall: '',
    publish: false,
  };
}

export function templateValues(t: QuestTemplate, def: { points: number; xp: number } | undefined): QuestFormValues {
  const base = emptyValues(def);
  const { rewardMultiplier, ...rest } = t.values;
  return {
    ...base,
    ...rest,
    points: Math.max(0, Math.round((def?.points ?? 50) * rewardMultiplier)),
    xp: Math.max(0, Math.round((def?.xp ?? 25) * rewardMultiplier)),
  };
}

export function questToFormValues(q: QuestListItem): QuestFormValues {
  return {
    name: q.name,
    description: q.description,
    icon: q.icon || '🎯',
    cadence: q.cadence,
    mechanic: q.isAchievement ? 'achievement' : q.mechanic === 'achievement' ? 'custom' : q.mechanic,
    target: q.target,
    category: q.category ?? '',
    minLength: q.minLength,
    points: q.reward.points,
    xp: q.reward.xp,
    hasExpiry: !!q.expiresAt,
    expiresWall: isoToIstanbulWall(q.expiresAt),
    publish: q.status === 'active',
  };
}

function toUpdateInput(v: QuestFormValues, q: QuestListItem): QuestUpdateInput {
  const expiresAt = v.hasExpiry ? istanbulWallToIso(v.expiresWall) : null;
  const common: QuestUpdateInput = {
    baseUpdatedAt: q.updatedAt,
    name: v.name.trim(),
    description: v.description.trim(),
    icon: v.icon.trim(),
    points: v.points,
    xp: v.xp,
    // Değişmeyen bitiş gönderilmez (geçmişte kalmış bitiş "gelecekte olmalı" kuralına takılmasın).
    ...(expiresAt !== q.expiresAt && !(expiresAt && q.expiresAt && new Date(expiresAt).getTime() === new Date(q.expiresAt).getTime()) ? { expiresAt } : {}),
  };
  if (q.isAchievement) return common;
  const c = formToCreateInput(v);
  return { ...common, mechanic: c.mechanic, cadence: c.cadence, target: c.target, category: c.category, minLength: c.minLength };
}

export type EditorTarget = { mode: 'create'; initial?: QuestFormValues } | { mode: 'edit'; id: string };

export function QuestEditor({
  target,
  onOpenChange,
  rewardDefault,
  onSaved,
}: {
  target: EditorTarget | null;
  onOpenChange: (open: boolean) => void;
  rewardDefault: { points: number; xp: number } | undefined;
  onSaved: (id: string, mode: 'create' | 'edit') => void;
}) {
  const open = target !== null;
  const editId = target?.mode === 'edit' ? target.id : null;
  const detail = useQuery({
    queryKey: questsKeys.detail(editId ?? '_'),
    queryFn: () => fetchQuest(editId!),
    enabled: !!editId,
    staleTime: 0,
  });
  const options = useQuery({ queryKey: questsKeys.options(), queryFn: fetchOptions, enabled: open, staleTime: 60_000 });
  const def = options.data?.rewardDefault ?? rewardDefault;

  const form = useZodForm(questFormSchema, { defaultValues: emptyValues(def) });
  const quest: QuestListItem | null = editId ? detail.data?.quest ?? null : null;

  // Açılışta / kayıt değişince formu doldur.
  useEffect(() => {
    if (!target) return;
    if (target.mode === 'create') form.reset(target.initial ?? emptyValues(def));
    else if (quest && quest.id === target.id) form.reset(questToFormValues(quest));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, quest?.updatedAt]);

  const v = useWatch({ control: form.control }) as QuestFormValues;
  const mechanic = v.mechanic ?? 'give_feedback';
  const meta = MECHANIC_META[mechanic];
  const locked = !!quest && quest.metrics.participants > 0 && !quest.isAchievement;
  const isAch = mechanic === 'achievement';

  // Tek seferlik zorunlu mekanikte dönemi otomatik "tek seferlik"e çek.
  useEffect(() => {
    if (meta.onceOnly && v.cadence !== 'special' && !isAch) form.setValue('cadence', 'special', { shouldValidate: true, shouldDirty: true });
    if (mechanic === 'detailed_feedback' && v.minLength == null) form.setValue('minLength', DETAILED_MIN_LENGTH_DEFAULT, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mechanic]);

  const mechanicOptions = useMemo(
    () => [
      ...CREATABLE_MECHANICS.map((m) => ({ value: m, label: MECHANIC_META[m].label })),
      ...(isAch ? [{ value: 'achievement', label: MECHANIC_META.achievement.label }] : []),
    ],
    [isAch]
  );
  const categoryOptions = useMemo(() => {
    const list = options.data?.categories ?? [];
    const cur = v.category?.trim();
    const items = [
      { value: ANY_CATEGORY, label: 'Herhangi bir işletme' },
      ...list.map((c) => ({ value: c.value, label: `${c.value} · ${fmtNumber(c.dealers)} işletme` })),
    ];
    if (cur && !list.some((c) => c.value === cur)) items.push({ value: cur, label: `${cur} · eşleşen işletme yok` });
    return items;
  }, [options.data, v.category]);

  const rewardWarn = def && (v.points > def.points * REWARD_WARN_MULTIPLIER || v.xp > def.xp * REWARD_WARN_MULTIPLIER);
  const perPeriodNote =
    v.cadence === 'special' ? 'kullanıcı başına bir kez' : v.cadence === 'daily' ? 'kullanıcı başına günde en fazla bir kez' : v.cadence === 'weekly' ? 'kullanıcı başına haftada en fazla bir kez' : 'kullanıcı başına ayda en fazla bir kez';
  const previewExpiry = v.hasExpiry ? istanbulWallToIso(v.expiresWall ?? '') : null;

  return (
    <EntityEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={editId ? 'edit' : 'create'}
      entityLabel="görev"
      title={editId ? 'Görevi düzenle' : 'Yeni görev'}
      description={editId ? quest?.name : 'Motoru olan bir mekanikten görev oluşturun; önizleme müşterinin göreceğiyle aynıdır.'}
      form={form}
      width="xl"
      loading={!!editId && detail.isLoading}
      loadError={editId ? detail.error : undefined}
      onRetryLoad={() => detail.refetch()}
      onReloadLatest={() => detail.refetch()}
      submitLabel={editId ? 'Kaydet' : v.publish ? 'Oluştur ve yayınla' : 'Taslak olarak oluştur'}
      successToast={editId ? 'Görev güncellendi' : v.publish ? 'Görev yayında' : 'Görev taslak olarak oluşturuldu (duraklatılmış)'}
      onSubmit={async (values) => {
        if (editId && quest) return updateQuest(editId, toUpdateInput(values, quest));
        return createQuest(formToCreateInput(values));
      }}
      onSaved={(res) => {
        const id = (res as { id?: string } | undefined)?.id;
        if (id) onSaved(id, editId ? 'edit' : 'create');
      }}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="min-w-0 space-y-5">
          {/* 1. Mekanik */}
          <fieldset className="space-y-4">
            <legend className="qx-small mb-2 font-semibold text-fg">1 · Ne yapılınca ilerler?</legend>
            {isAch ? (
              <p className="qx-small flex items-start gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-2 text-fg-muted">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Sistem başarımı: mekanik, dönem ve hedef kod tarafından belirlenir. Metin, simge, ödül ve bitiş düzenlenebilir.
              </p>
            ) : (
              <SelectField
                control={form.control}
                name="mechanic"
                label="Mekanik"
                required
                disabled={locked}
                options={mechanicOptions}
                description={meta.description}
              />
            )}
            {locked ? (
              <p className="qx-caption flex items-start gap-1.5 text-fg-muted">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {fmtNumber(quest?.metrics.participants)} kullanıcının ilerlemesi var: mekanik, dönem ve kategori kilitli. Değiştirmek için görevi kopyalayın.
              </p>
            ) : null}
            {mechanic === 'visit_category' ? (
              <SelectField
                control={form.control}
                name="category"
                label="İşletme kategorisi"
                disabled={locked}
                options={categoryOptions}
                parse={(s) => (s === ANY_CATEGORY ? '' : s)}
                format={(val) => (typeof val === 'string' && val ? val : ANY_CATEGORY)}
                description="Bayilerin kayıtlı işletme kategorisinden seçilir; yazım hatası riski yok."
              />
            ) : null}
            {mechanic === 'detailed_feedback' ? (
              <NumberField control={form.control} name="minLength" label="En az karakter" required disabled={locked} min={20} max={2000} unit="karakter" stepper step={10} />
            ) : null}
            {!isAch ? (
              <NumberField
                control={form.control}
                name="target"
                label="Hedef"
                required
                min={1}
                max={10_000}
                unit={meta.unit}
                stepper
                description={`Dönem içinde ${fmtNumber(v.target || 0)} ${meta.unit}.`}
              />
            ) : null}
          </fieldset>

          {/* 2. Zamanlama */}
          <fieldset className="space-y-4">
            <legend className="qx-small mb-2 font-semibold text-fg">2 · Zamanlama</legend>
            {!isAch ? (
              <Controller
                control={form.control}
                name="cadence"
                render={({ field, fieldState }) => (
                  <Field
                    kind="labelledby"
                    label="Dönem"
                    required
                    disabled={locked || meta.onceOnly}
                    description={meta.onceOnly ? 'Bu mekanik yalnız tek seferlik olabilir.' : CADENCE_HINT[field.value as QuestCadence]}
                    error={errorMessageOf(fieldState.error)}
                  >
                    {(p) => (
                      <ChoiceChips
                        aria-labelledby={p['aria-labelledby'] as string}
                        disabled={locked || meta.onceOnly}
                        options={QUEST_CADENCES.map((c) => ({ value: c, label: CADENCE_LABEL[c] }))}
                        value={field.value}
                        onChange={(next) => next && field.onChange(next)}
                        onBlur={field.onBlur}
                      />
                    )}
                  </Field>
                )}
              />
            ) : null}
            <SwitchField control={form.control} name="hasExpiry" label="Bitiş anı belirle" description="Kapalıysa görev siz duraklatana kadar sürer." />
            {v.hasExpiry ? (
              <Controller
                control={form.control}
                name="expiresWall"
                render={({ field, fieldState }) => (
                  <Field label="Bitiş (İstanbul saati)" required description="Görev bu anda biter; tamamlanmış ödül 24 saat daha alınabilir." error={errorMessageOf(fieldState.error)}>
                    {(p) => (
                      <Input
                        {...p}
                        type="datetime-local"
                        className="min-h-11 sm:min-h-10"
                        value={field.value}
                        min={isoToIstanbulWall(new Date(Date.now() + 10 * 60_000))}
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    )}
                  </Field>
                )}
              />
            ) : null}
          </fieldset>

          {/* 3. Ödül */}
          <fieldset className="space-y-4">
            <legend className="qx-small mb-2 font-semibold text-fg">3 · Ödül</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField control={form.control} name="points" label="Puan" required min={0} max={QUEST_MAX_POINTS} unit="puan" step={5} />
              <NumberField control={form.control} name="xp" label="XP" required min={0} max={QUEST_MAX_XP} unit="XP" step={5} />
            </div>
            <div className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-2 text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" aria-hidden />
                Puan Matrisi varsayılanı: {def ? `${fmtNumber(def.points)} puan · ${fmtNumber(def.xp)} XP` : 'yükleniyor'}
              </span>
              {def ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 sm:min-h-8"
                  onClick={() => {
                    form.setValue('points', def.points, { shouldDirty: true, shouldValidate: true });
                    form.setValue('xp', def.xp, { shouldDirty: true, shouldValidate: true });
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Varsayılanı kullan
                </Button>
              ) : null}
            </div>
            <p className="qx-caption text-fg-muted">
              Ödül, müşteri tarafında tek seferlik defter kaydıyla (lib/economy) işlenir: {perPeriodNote}.
              {quest ? ` Son 30 günde bu görevden ${fmtNumber(quest.metrics.payouts30d)} ödeme ile ${fmtNumber(quest.metrics.points30d)} puan basıldı.` : ''}
            </p>
            {rewardWarn ? (
              <p role="status" className="qx-small flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-fg">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                Ödül, matris varsayılanının {REWARD_WARN_MULTIPLIER} katından fazla. Ekonomiye etkisini kontrol edin.
              </p>
            ) : null}
          </fieldset>

          {/* 4. Görünüm */}
          <fieldset className="space-y-4">
            <legend className="qx-small mb-2 font-semibold text-fg">4 · Müşterinin göreceği</legend>
            <TextField control={form.control} name="name" label="Görev adı" required maxLength={50} placeholder="Örn: Haftanın Eleştirmeni" />
            <TextareaField control={form.control} name="description" label="Açıklama" required maxLength={200} rows={2} placeholder="Müşteriye ne yapması gerektiğini tek cümlede anlatın." />
            <Controller
              control={form.control}
              name="icon"
              render={({ field, fieldState }) => (
                <Field kind="labelledby" label="Simge" required error={errorMessageOf(fieldState.error)} description="Emoji seçin ya da kendi emojinizi yazın.">
                  {(p) => (
                    <div className="space-y-2">
                      <ChoiceChips
                        aria-labelledby={p['aria-labelledby'] as string}
                        size="sm"
                        options={ICON_CHOICES.map((i) => ({ value: i, label: i }))}
                        value={(ICON_CHOICES as readonly string[]).includes(field.value) ? field.value : ''}
                        onChange={(next) => next && field.onChange(next)}
                      />
                      <Input
                        aria-label="Özel simge"
                        className="min-h-11 w-28 sm:min-h-10"
                        maxLength={16}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                      />
                    </div>
                  )}
                </Field>
              )}
            />
            {!editId ? (
              <SwitchField
                control={form.control}
                name="publish"
                variant="card"
                label="Hemen yayınla"
                description="Kapalıysa görev duraklatılmış (taslak) oluşur; listeden yayına alırsınız."
              />
            ) : null}
          </fieldset>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <QuestPreview
            name={v.name ?? ''}
            description={v.description ?? ''}
            icon={v.icon ?? ''}
            cadence={v.cadence ?? 'daily'}
            mechanic={mechanic}
            target={v.target ?? 1}
            points={v.points ?? 0}
            xp={v.xp ?? 0}
            expiresAt={previewExpiry}
          />
        </aside>
      </div>
    </EntityEditorSheet>
  );
}

export type { QuestDetail };

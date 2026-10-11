'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, MessageSquareText, Siren, Sparkles, Star, Type, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { EntityEditorSheet, Field, SelectField, SwitchField, TextField, TextareaField, errorMessageOf, useZodForm } from '@/components/ds/form';
import { InlineError } from '@/components/states';
import {
  MAX_KEYWORDS,
  TEMPLATE_VARIABLES,
  defaultConditionFor,
  describeCondition,
  renderReplyTemplate,
  replyConditionSchema,
  replyRuleBodySchema,
  unknownTemplateVariables,
  type ReplyCondition,
  type ReplyRuleBody,
} from '@/lib/dealer-automation/reply-rules';
import { AUTOMATION_KEYS, type RepliesOverviewDto, type ReplyRuleDto } from '@/lib/dealer-automation/types';
import { createReplyRule, fmtInt, fmtRelative, previewReply, updateReplyRule } from './api';

export type ReplyEditorState = { mode: 'create'; preset?: ReplyRuleBody } | { mode: 'edit'; rule: ReplyRuleDto } | null;

const EMPTY: ReplyRuleBody = {
  name: '',
  condition: defaultConditionFor('rating'),
  action: 'reply',
  template: '',
  tone: null,
  isActive: true,
};

function bodyFromRule(r: ReplyRuleDto): ReplyRuleBody {
  return {
    name: r.name,
    condition: r.condition ?? defaultConditionFor('rating'),
    action: r.action,
    template: r.template,
    tone: r.tone && !r.toneMissing ? r.tone : null,
    isActive: r.isActive,
  };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ReplyEditor({
  state,
  onClose,
  overview,
  onSaved,
}: {
  state: ReplyEditorState;
  onClose: () => void;
  overview: RepliesOverviewDto;
  onSaved: (id: string, mode: 'create' | 'edit') => void;
}) {
  const open = state !== null;
  const initial = useMemo<ReplyRuleBody>(() => {
    if (!state) return EMPTY;
    if (state.mode === 'edit') return bodyFromRule(state.rule);
    return state.preset ?? EMPTY;
  }, [state]);
  const form = useZodForm(replyRuleBodySchema, { defaultValues: initial });
  useEffect(() => {
    if (open) form.reset(initial);
  }, [open, initial, form]);

  const v = useWatch({ control: form.control }) as Partial<ReplyRuleBody>;
  const cond = v.condition as ReplyCondition | undefined;
  const parsedCond = replyConditionSchema.safeParse(cond);
  const debouncedCond = useDebounced(parsedCond.success ? parsedCond.data : null, 450);
  const preview = useQuery({
    queryKey: AUTOMATION_KEYS.replyPreview(debouncedCond),
    queryFn: ({ signal }) => previewReply(debouncedCond as ReplyCondition, signal),
    enabled: open && !!debouncedCond,
    staleTime: 60_000,
  });

  const isReply = v.action !== 'incident';
  const aiMode = isReply && !!v.tone;
  const toneOptions = overview.tones.map((t) => ({ value: t.slug, label: t.name }));
  const unknownVars = unknownTemplateVariables(v.template ?? '');

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const current = form.getValues('template') ?? '';
    const el = typeof document !== 'undefined' ? document.querySelector<HTMLTextAreaElement>('textarea[name="template"]') : null;
    const at = el && typeof el.selectionStart === 'number' ? el.selectionStart : current.length;
    const next = `${current.slice(0, at)}${token}${current.slice(at)}`;
    form.setValue('template', next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  const samplePreview = renderReplyTemplate(v.template ?? '', {
    musteri: 'Ayşe Yılmaz',
    isletme: 'İşletmeniz',
    puan: cond?.field === 'rating' ? cond.value : 2,
  });

  return (
    <EntityEditorSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      mode={state?.mode === 'edit' ? 'edit' : 'create'}
      title={state?.mode === 'edit' ? 'Kuralı düzenle' : 'Yeni otomatik kural'}
      description="Kural, geri bildirim geldiği anda bir kez çalışır. Yalnız ilk eşleşen kural uygulanır."
      form={form}
      width="xl"
      submitLabel={state?.mode === 'edit' ? 'Kaydet' : 'Kuralı oluştur'}
      successToast={state?.mode === 'edit' ? 'Kural güncellendi' : 'Kural oluşturuldu'}
      onSubmit={(values) =>
        state?.mode === 'edit' ? updateReplyRule(state.rule.id, values) : createReplyRule(values)
      }
      onSaved={(result) => onSaved((result as { id: string }).id, state?.mode === 'edit' ? 'edit' : 'create')}
    >
      {state?.mode === 'edit' && !state.rule.condition && (
        <InlineError variant="banner" tone="warning">
          Bu kuralın kayıtlı koşulu geçersizdi ve hiç tetiklenmiyordu. Koşulu aşağıda yeniden seçip kaydedin.
        </InlineError>
      )}

      <TextField control={form.control} name="name" label="Kural adı" required maxLength={80} placeholder="Düşük puana özür" />

      <fieldset className="space-y-3 rounded-card border border-subtle p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold text-fg">1. Ne zaman?</legend>
        <Controller
          control={form.control}
          name="condition"
          render={({ field, fieldState }) => {
            const c = field.value as ReplyCondition;
            return (
              <div className="space-y-3">
                <Field kind="labelledby" label="Neye bakılsın?" required>
                  {(p) => (
                    <ChoiceChips
                      aria-labelledby={p['aria-labelledby'] as string}
                      options={[
                        { value: 'rating', label: 'Puan', icon: <Star className="h-4 w-4" aria-hidden /> },
                        { value: 'sentiment', label: 'Duygu', icon: <MessageSquareText className="h-4 w-4" aria-hidden /> },
                        { value: 'text', label: 'Yorumdaki kelimeler', icon: <Type className="h-4 w-4" aria-hidden /> },
                      ]}
                      value={c.field}
                      onChange={(next) => next && next !== c.field && field.onChange(defaultConditionFor(next as ReplyCondition['field']))}
                    />
                  )}
                </Field>

                {c.field === 'rating' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field kind="labelledby" label="Karşılaştırma" required>
                      {(p) => (
                        <ChoiceChips
                          aria-labelledby={p['aria-labelledby'] as string}
                          options={[
                            { value: 'lte', label: 've altı' },
                            { value: 'gte', label: 've üstü' },
                            { value: 'eq', label: 'tam' },
                          ]}
                          value={c.op}
                          onChange={(op) => op && field.onChange({ ...c, op })}
                        />
                      )}
                    </Field>
                    <Field kind="labelledby" label="Puan" required>
                      {(p) => (
                        <ChoiceChips
                          aria-labelledby={p['aria-labelledby'] as string}
                          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} ★`, textLabel: `${n} yıldız` }))}
                          value={String(c.value)}
                          onChange={(val) => val && field.onChange({ ...c, value: Number(val) })}
                        />
                      )}
                    </Field>
                  </div>
                )}

                {c.field === 'sentiment' && (
                  <>
                    <Field kind="labelledby" label="Duygu" required>
                      {(p) => (
                        <ChoiceChips
                          aria-labelledby={p['aria-labelledby'] as string}
                          options={[
                            { value: 'negative', label: 'Olumsuz' },
                            { value: 'neutral', label: 'Nötr' },
                            { value: 'positive', label: 'Olumlu' },
                          ]}
                          value={c.value}
                          onChange={(val) => val && field.onChange({ ...c, value: val })}
                        />
                      )}
                    </Field>
                    <p className="qx-small text-fg-muted">
                      Duygu, yorum metni AI ile analiz edildiğinde belirlenir; metinsiz yorumlarda ve AI analizi kapalıyken bu kural tetiklenmez.
                      {overview.ai.canAnalyze === false && (
                        <strong className="text-warning"> Şu an otomatik AI analiziniz kapalı.</strong>
                      )}
                    </p>
                  </>
                )}

                {c.field === 'text' && (
                  <KeywordInput
                    keywords={c.keywords}
                    wholeWord={c.wholeWord}
                    error={errorMessageOf(fieldState.error)}
                    onChange={(keywords, wholeWord) => field.onChange({ ...c, keywords, wholeWord })}
                  />
                )}
                <p className="qx-small font-medium text-fg" aria-live="polite">
                  {parsedCond.success ? describeCondition(parsedCond.data) : 'Koşulu tamamlayın.'}
                </p>
              </div>
            );
          }}
        />
      </fieldset>

      <fieldset className="space-y-3 rounded-card border border-subtle p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold text-fg">2. Ne yapılsın?</legend>
        <Controller
          control={form.control}
          name="action"
          render={({ field }) => (
            <Field kind="labelledby" label="Eylem" required>
              {(p) => (
                <ChoiceChips
                  aria-labelledby={p['aria-labelledby'] as string}
                  options={[
                    { value: 'reply', label: 'Müşteriye yanıt yaz', icon: <MessageSquareText className="h-4 w-4" aria-hidden /> },
                    { value: 'incident', label: 'Vaka aç', icon: <Siren className="h-4 w-4" aria-hidden /> },
                  ]}
                  value={field.value}
                  onChange={(next) => {
                    if (!next) return;
                    field.onChange(next);
                    if (next === 'incident') form.setValue('tone', null, { shouldDirty: true });
                  }}
                />
              )}
            </Field>
          )}
        />

        {isReply ? (
          <>
            <Controller
              control={form.control}
              name="tone"
              render={({ field }) => (
                <Field kind="labelledby" label="Yanıt biçimi">
                  {(p) => (
                    <ChoiceChips
                      aria-labelledby={p['aria-labelledby'] as string}
                      options={[
                        { value: 'fixed', label: 'Sabit metin' },
                        {
                          value: 'ai',
                          label: 'AI ile kişiselleştir',
                          icon: <Sparkles className="h-4 w-4" aria-hidden />,
                          disabled: toneOptions.length === 0,
                        },
                      ]}
                      value={field.value ? 'ai' : 'fixed'}
                      onChange={(m) => field.onChange(m === 'ai' ? (field.value ?? toneOptions[0]?.value ?? null) : null)}
                    />
                  )}
                </Field>
              )}
            />
            {aiMode && (
              <>
                <SelectField control={form.control} name="tone" label="Üslup" options={toneOptions} required />
                <p className="qx-small text-fg-muted">
                  AI, müşterinin yorumuna göre bu üslupla kısa bir yanıt yazar. Yanıt vaat (indirim, ücretsiz ürün), bağlantı ya da
                  uygunsuz içerik taşırsa yayınlanmaz; aşağıdaki yedek metin gönderilir.
                  {overview.ai.canUseAi === false && (
                    <strong className="text-warning"> AI ayarınız kapalı olduğu için şu an her zaman yedek metin gönderilir.</strong>
                  )}
                </p>
              </>
            )}
            <TextareaField
              control={form.control}
              name="template"
              label={aiMode ? 'Yedek metin (AI yanıt üretemezse)' : 'Yanıt metni'}
              required
              rows={4}
              maxLength={1000}
              placeholder="Merhaba {{musteri}}, yaşadığınız sorun için üzgünüz. Ekibimizle hemen ilgileneceğiz."
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="qx-caption text-fg-muted">Değişken ekle:</span>
              {TEMPLATE_VARIABLES.map((tv) => (
                <Button key={tv.key} type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => insertVariable(tv.key)}>
                  {`{{${tv.key}}}`} <span className="sr-only">({tv.label})</span>
                  <span aria-hidden className="text-fg-muted">· {tv.label}</span>
                </Button>
              ))}
            </div>
            {unknownVars.length > 0 && (
              <p className="qx-small text-warning" role="status">
                Tanınmayan değişken: {unknownVars.map((u) => `{{${u}}}`).join(', ')} — olduğu gibi gönderilir.
              </p>
            )}
            {(v.template ?? '').trim().length >= 5 && (
              <div className="rounded-card border border-subtle bg-surface-2 p-3">
                <p className="qx-caption text-fg-muted">Müşteri böyle görür (örnek: “Ayşe Yılmaz”)</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{samplePreview}</p>
              </div>
            )}
          </>
        ) : (
          <TextareaField
            control={form.control}
            name="template"
            label="Vaka notu"
            optional
            rows={3}
            maxLength={1000}
            description="Vakaya eklenecek açıklama. Vaka Gelen Kutusu › Vakalar'da açılır; müşteriye hiçbir şey gönderilmez."
          />
        )}
      </fieldset>

      <SwitchField control={form.control} name="isActive" label="Kural etkin" description="Kapalı kural saklanır ama çalışmaz." variant="card" />

      <section aria-labelledby="reply-preview-title" className="space-y-2 rounded-card border border-subtle p-3 sm:p-4">
        <h3 id="reply-preview-title" className="text-sm font-semibold text-fg">
          Son 30 günde bu koşul
        </h3>
        {!debouncedCond ? (
          <p className="qx-small text-fg-muted">Koşul tamamlanınca gerçek geri bildirimleriniz üzerinde denenir.</p>
        ) : preview.isError ? (
          <InlineError onRetry={() => preview.refetch()}>Önizleme yüklenemedi.</InlineError>
        ) : !preview.data ? (
          <p className="qx-small text-fg-muted" role="status">Deneniyor…</p>
        ) : (
          <div className="space-y-2" aria-live="polite">
            <p className="text-sm text-fg">
              <strong className="tabular-nums">{fmtInt(preview.data.matched)}</strong> geri bildirime uyardı
              {preview.data.matched > 0 && isReply && (
                <span className="text-fg-muted">
                  {' '}
                  ({fmtInt(preview.data.alreadyReplied)} zaten yanıtlanmış, {fmtInt(preview.data.unsafe)} uygunsuz/şüpheli — bunlara yanıt yazılmaz)
                </span>
              )}
              .
            </p>
            {preview.data.capped && <p className="qx-caption text-fg-muted">En yeni {fmtInt(preview.data.scanned)} kayıt tarandı.</p>}
            {preview.data.samples.length > 0 && (
              <ul className="space-y-2">
                {preview.data.samples.map((s) => (
                  <li key={s.id} className="rounded-control border border-subtle p-2">
                    <div className="flex flex-wrap items-center gap-2 qx-caption text-fg-muted">
                      {s.rating != null && <span>{s.rating} ★</span>}
                      <span>{fmtRelative(s.createdAt)}</span>
                      {s.replied && <span>· yanıtlanmış</span>}
                      {s.keywordHits.length > 0 && <span>· {s.keywordHits.join(', ')}</span>}
                    </div>
                    <p className="mt-1 text-sm text-fg">{s.textPreview ?? <span className="text-fg-muted">Yalnız puan</span>}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </EntityEditorSheet>
  );
}

function KeywordInput({
  keywords,
  wholeWord,
  error,
  onChange,
}: {
  keywords: string[];
  wholeWord: boolean;
  error?: string;
  onChange: (keywords: string[], wholeWord: boolean) => void;
}) {
  const [draft, setDraft] = useState('');
  const wholeId = useId();
  const commit = () => {
    const parts = draft
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter((s) => s.length >= 2 && s.length <= 40);
    if (parts.length === 0) return;
    const next = [...keywords];
    for (const p of parts) {
      if (!next.some((k) => k.toLocaleLowerCase('tr-TR') === p.toLocaleLowerCase('tr-TR')) && next.length < MAX_KEYWORDS) next.push(p);
    }
    onChange(next, wholeWord);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <Field
        label="Anahtar kelimeler"
        required
        error={error}
        description={`Enter ya da virgülle ekleyin (en çok ${MAX_KEYWORDS}). Büyük/küçük harf ve Türkçe harf farkı (ı/i, ş/s) yok sayılır.`}
      >
        {(p) => (
          <Input
            {...p}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Backspace' && !draft && keywords.length > 0) {
                onChange(keywords.slice(0, -1), wholeWord);
              }
            }}
            onBlur={commit}
            maxLength={200}
            placeholder="soğuk, geç geldi, bekledim"
            className="min-h-11"
          />
        )}
      </Field>
      {keywords.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Eklenen anahtar kelimeler">
          {keywords.map((k) => (
            <li key={k} className="inline-flex items-center gap-1 rounded-chip border border-subtle bg-surface-2 py-1 pl-3 pr-1 text-sm text-fg">
              {k}
              <button
                type="button"
                onClick={() => onChange(keywords.filter((x) => x !== k), wholeWord)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-chip text-fg-muted hover:bg-surface-1 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-label={`“${k}” kelimesini kaldır`}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex min-h-11 items-center gap-2">
        <Checkbox id={wholeId} checked={wholeWord} onCheckedChange={(c) => onChange(keywords, c === true)} />
        <label htmlFor={wholeId} className="cursor-pointer text-sm text-fg">
          Yalnız tam kelime eşleşsin (“geç” → “geçti”yi saymaz)
        </label>
      </div>
      {keywords.length === 0 && (
        <p className="qx-small text-fg-muted">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          Olumsuzlamalar ayırt edilmez: “kötü değildi” de “kötü” ile eşleşir.
        </p>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, MessageSquareQuote, Pencil, Plus, Power, RotateCcw, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/components/ds/page';
import { DetailSheet, StatusBadge } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { ConfirmAction, EmptyState, InlineError, QueryState } from '@/components/states';
import { TONE_CALLOUT } from '@/components/states/tone';
import { BUILTIN_TONES, TONE_PROMPT_MAX, TONE_PROMPT_MIN, TONE_SLUG_RE, type ToneRow, type TonesState } from '@/lib/ai-studio/contract';
import { cn } from '@/lib/utils';
import { createTone, errorText, fetchToneHistory, fetchTones, fieldErrors, isConflict, previewTone, setToneStatus, studioKeys, updateTone } from './api';
import { TextDiff } from './diff-view';
import { actorName, fmtDateTime, fmtNumber } from './format';
import { CountedTextarea, PromptBlock, ReasonInput, reasonOk } from './parts';

const SOURCE: Record<ToneRow['source'], { label: string; tone: 'neutral' | 'brand' | 'info' }> = {
  builtin: { label: 'Yerleşik · etkin değil', tone: 'neutral' },
  override: { label: 'Yerleşik · özelleştirilmiş', tone: 'brand' },
  custom: { label: 'Özel', tone: 'info' },
};

type EditorState = { mode: 'create'; preset?: { slug: string; name: string; systemPrompt: string } } | { mode: 'edit'; tone: ToneRow } | null;

/**
 * Üsluplar: otomatik yanıt kurallarının AI üslup kataloğu. Bayi seçicisi yalnız AKTİF kayıtları görür;
 * yerleşik aileler etkinleştirilmeden bayiye sunulmaz. Anahtar sabit, silme yok (arşiv), her yazım gerekçeli.
 */
export default function TonesTab({ initial }: { initial?: TonesState | null }) {
  const query = useQuery({ queryKey: studioKeys.tones(), queryFn: fetchTones, initialData: initial ?? undefined, staleTime: 15_000 });
  const [editor, setEditor] = useState<EditorState>(null);
  // Durum sızıntısı yok (eski B1): ekleme ve düzenleme tek ayrık birleşimde; kapanınca null.
  return (
    <>
      <QueryState query={query} skeleton="cards" error={{ title: 'Üsluplar yüklenemedi' }}>
        {(s) => (
          <div className="space-y-4">
            {s.orphanSlugs.length ? (
              <div role="status" className={cn('flex gap-2 rounded-lg border p-3 text-sm', TONE_CALLOUT.warning)}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  Katalogda aktif karşılığı olmayan üslup kullanan kurallar var:{' '}
                  {s.orphanSlugs.map((o) => `${o.slug} (${fmtNumber(o.rules)} kural)`).join(', ')}. Bu kurallar AI yanıtında yalnız yerleşik aile tarifine (ya da “Profesyonel”e) düşer.
                </p>
              </div>
            ) : null}
            <SectionCard
              title="Yanıt üslupları"
              description="Otomatik yanıt kurallarında seçilen üslubun talimatı. Temel otomatik yanıt kuralları (vaat yok, kişisel veri yok, 3-4 cümle) kodda sabittir; buradaki metin onların yerine geçmez, yalnız üslup ek bağlamıdır."
              icon={<MessageSquareQuote />}
              actions={
                <Button className="min-h-11 sm:min-h-10" onClick={() => setEditor({ mode: 'create' })}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Yeni üslup
                </Button>
              }
              density="flush"
            >
              {s.tones.length === 0 ? (
                <EmptyState compact title="Üslup yok" />
              ) : (
                <ul className="divide-y divide-border">
                  {s.tones.map((t) => (
                    <ToneItem key={t.slug} t={t} onEdit={() => setEditor({ mode: 'edit', tone: t })} onActivate={() => setEditor({ mode: 'create', preset: presetFor(t) })} />
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        )}
      </QueryState>
      <DetailSheet
        open={editor !== null}
        onOpenChange={(o) => {
          if (!o) setEditor(null);
        }}
        id={editor?.mode === 'edit' ? editor.tone.slug : 'yeni'}
        title={editor?.mode === 'edit' ? `${editor.tone.name} üslubu` : editor?.preset ? `${editor.preset.name} üslubunu etkinleştir` : 'Yeni üslup'}
        description={editor?.mode === 'edit' ? `Anahtar: ${editor.tone.slug} (değiştirilemez)` : 'Anahtar oluşturulduktan sonra değiştirilemez; bayi kuralları bu anahtara bağlıdır.'}
        size="lg"
      >
        {editor ? <ToneEditor key={editor.mode === 'edit' ? editor.tone.slug : editor.preset?.slug ?? 'new'} state={editor} onClose={() => setEditor(null)} /> : null}
      </DetailSheet>
    </>
  );
}

function presetFor(t: ToneRow) {
  return {
    slug: t.slug,
    name: t.name,
    systemPrompt: `${t.descriptor ?? ''} bir dille yaz. Müşteriye teşekkür et ve yorumundaki somut noktaya değin.`.trim(),
  };
}

function ToneItem({ t, onEdit, onActivate }: { t: ToneRow; onEdit: () => void; onActivate: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const src = SOURCE[t.source];
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-fg">{t.name}</span>
          <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-fg-muted">{t.slug}</code>
          <StatusBadge label={src.label} tone={src.tone} size="sm" />
          {t.id ? <StatusBadge label={t.isActive ? 'Bayiye sunuluyor' : 'Arşivde'} tone={t.isActive ? 'success' : 'warning'} size="sm" /> : null}
        </div>
        <p className="qx-small text-fg-muted">
          {fmtNumber(t.usage.activeRules)} aktif kural · {fmtNumber(t.usage.rules)} toplam kural · {fmtNumber(t.usage.dealers)} bayi
          {t.updatedAt ? ` · güncellendi ${fmtDateTime(t.updatedAt)}` : ''}
        </p>
        <p className="line-clamp-2 text-sm text-fg">{t.systemPrompt ?? `Kod tarifi: “${t.descriptor}”. Bayi seçicisinde görünmesi için etkinleştirin.`}</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {t.id ? (
          <>
            <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={onEdit} aria-label={`${t.name} üslubunu düzenle`}>
              <Pencil className="h-4 w-4" aria-hidden />
              Düzenle
            </Button>
            <ConfirmAction
              tone={t.isActive ? 'warning' : 'brand'}
              trigger={
                <Button variant="ghost" className="min-h-11 sm:min-h-9" aria-label={`${t.name} üslubunu ${t.isActive ? 'arşivle' : 'yeniden etkinleştir'}`}>
                  {t.isActive ? <Archive className="h-4 w-4" aria-hidden /> : <ArchiveRestore className="h-4 w-4" aria-hidden />}
                  {t.isActive ? 'Arşivle' : 'Geri al'}
                </Button>
              }
              title={t.isActive ? `${t.name} arşivlensin mi?` : `${t.name} yeniden etkinleşsin mi?`}
              description={
                t.isActive
                  ? 'Bayi seçicisinden kalkar; bu üslubu kullanan mevcut kurallar AI yanıtında yalnız yerleşik aile tarifine düşer. Kayıt silinmez.'
                  : 'Bayi seçicisinde yeniden görünür ve kurallar bu talimatı kullanır.'
              }
              impact={{
                items: [
                  { label: 'Aktif kural', value: fmtNumber(t.usage.activeRules), emphasis: t.isActive && t.usage.activeRules > 0 },
                  { label: 'Etkilenen bayi', value: fmtNumber(t.usage.dealers) },
                ],
                warning: (
                  <span className="block pt-2">
                    <ReasonInput value={reason} onChange={setReason} />
                  </span>
                ),
              }}
              irreversibleNote={false}
              confirmLabel={t.isActive ? 'Arşivle' : 'Etkinleştir'}
              onConfirm={async () => {
                if (!reasonOk(reason)) throw new Error('Gerekçe en az 3 karakter olmalı.');
                try {
                  qc.setQueryData(studioKeys.tones(), await setToneStatus(t.id!, { active: !t.isActive, reason, expectedVersion: t.version ?? '' }));
                  qc.invalidateQueries({ queryKey: studioKeys.overview() });
                  setReason('');
                  toast.success(t.isActive ? 'Üslup arşivlendi.' : 'Üslup yeniden etkin.');
                } catch (e) {
                  if (isConflict(e)) qc.invalidateQueries({ queryKey: studioKeys.tones() });
                  throw e;
                }
              }}
            />
          </>
        ) : (
          <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={onActivate} aria-label={`${t.name} üslubunu etkinleştir`}>
            <Power className="h-4 w-4" aria-hidden />
            Etkinleştir
          </Button>
        )}
      </div>
    </li>
  );
}

function ToneEditor({ state, onClose }: { state: NonNullable<EditorState>; onClose: () => void }) {
  const qc = useQueryClient();
  const tone = state.mode === 'edit' ? state.tone : null;
  const [slug, setSlug] = useState(state.mode === 'create' ? state.preset?.slug ?? '' : tone!.slug);
  const [name, setName] = useState(state.mode === 'create' ? state.preset?.name ?? '' : tone!.name);
  const [prompt, setPrompt] = useState(state.mode === 'create' ? state.preset?.systemPrompt ?? '' : tone!.systemPrompt ?? '');
  const [reason, setReason] = useState(state.mode === 'create' && state.preset ? 'Yerleşik üslup bayilere açıldı' : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const slugLocked = state.mode === 'edit' || !!(state.mode === 'create' && state.preset);
  const isBuiltinSlug = BUILTIN_TONES.some((b) => b.slug === slug);

  const save = useMutation({
    mutationFn: () =>
      tone
        ? updateTone(tone.id!, {
            ...(name.trim() !== tone.name ? { name } : {}),
            ...(prompt.trim() !== (tone.systemPrompt ?? '') ? { systemPrompt: prompt } : {}),
            reason,
            expectedVersion: tone.version ?? '',
          })
        : createTone({ slug, name, systemPrompt: prompt, reason }),
    onSuccess: (next) => {
      qc.setQueryData(studioKeys.tones(), next);
      qc.invalidateQueries({ queryKey: studioKeys.overview() });
      if (tone) qc.invalidateQueries({ queryKey: studioKeys.toneHistory(tone.id!) });
      toast.success(tone ? 'Üslup güncellendi.' : 'Üslup oluşturuldu; bayi seçicisinde görünür.');
      onClose();
    },
    onError: (e) => {
      if (isConflict(e) && tone) {
        setFormError('Bu üslup siz düzenlerken değişti. Pencereyi kapatıp güncel hâlini açın.');
        qc.invalidateQueries({ queryKey: studioKeys.tones() });
        return;
      }
      setErrors(fieldErrors(e));
      setFormError(errorText(e));
    },
  });

  const promptLen = prompt.trim().length;
  const dirty = tone ? name.trim() !== tone.name || prompt.trim() !== (tone.systemPrompt ?? '') : true;
  const valid =
    reasonOk(reason) &&
    name.trim().length >= 2 &&
    promptLen >= TONE_PROMPT_MIN &&
    promptLen <= TONE_PROMPT_MAX &&
    (slugLocked || (TONE_SLUG_RE.test(slug) && slug.length >= 2)) &&
    dirty;

  return (
    <div className="space-y-6">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          if (!valid) {
            setFormError(!dirty ? 'Değişiklik yok.' : 'Alanları kontrol edin (ad ≥ 2, talimat 20–600 karakter, gerekçe ≥ 3).');
            return;
          }
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tone-name">Görünen ad</Label>
            <Input id="tone-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="min-h-11 sm:min-h-10" aria-invalid={!!errors.name || undefined} />
            {errors.name ? <p className="qx-small text-danger">{errors.name}</p> : <p className="qx-small text-fg-muted">Bayi kural ekranında bu ad görünür.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tone-slug">Anahtar</Label>
            <Input
              id="tone-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              readOnly={slugLocked}
              maxLength={40}
              className="min-h-11 font-mono sm:min-h-10"
              aria-describedby="tone-slug-hint"
              aria-invalid={!!errors.slug || undefined}
            />
            <p id="tone-slug-hint" className={cn('qx-small', errors.slug ? 'text-danger' : 'text-fg-muted')}>
              {errors.slug ?? (slugLocked ? 'Değiştirilemez: kurallar bu anahtara bağlı.' : 'Küçük harf, rakam ve tire (örn. sicak-ve-kisa).')}
              {!slugLocked && isBuiltinSlug ? ' Bu yerleşik bir ailenin anahtarı; listedeki “Etkinleştir”i kullanın.' : ''}
            </p>
          </div>
        </div>
        <CountedTextarea
          label="Üslup talimatı"
          value={prompt}
          onChange={setPrompt}
          max={TONE_PROMPT_MAX}
          min={TONE_PROMPT_MIN}
          rows={6}
          error={errors.systemPrompt}
          hint="Kısa üslup tarifi yazın. Model müşteri adını görmez; kişisel hitap, vaat, indirim ya da bağlantı isteyen talimatlar temel kurallar tarafından engellenir."
        />
        {tone && prompt.trim() !== (tone.systemPrompt ?? '') ? <TextDiff before={tone.systemPrompt} after={prompt.trim()} label="Kayıtlı → düzenlenen" /> : null}
        <ReasonInput value={reason} onChange={setReason} error={errors.reason} />
        {formError ? (
          <InlineError variant="banner">{formError}</InlineError>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11 sm:min-h-10" disabled={save.isPending}>
            {save.isPending ? 'Kaydediliyor…' : tone ? 'Değişiklikleri kaydet' : 'Oluştur'}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 sm:min-h-10" onClick={onClose}>
            Vazgeç
          </Button>
        </div>
      </form>

      <TonePreview slug={slug || 'professional'} prompt={prompt} />

      {tone?.id ? <ToneHistory id={tone.id} onLoad={(text) => setPrompt(text)} current={tone.systemPrompt} /> : null}
    </div>
  );
}

const RATING_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} ★`, textLabel: `${n} yıldız` }));

function TonePreview({ slug, prompt }: { slug: string; prompt: string }) {
  const [rating, setRating] = useState('2');
  const [text, setText] = useState('Yemek soğuk geldi, garson da ilgisizdi.');
  const run = useMutation({
    mutationFn: () => previewTone({ slug, systemPrompt: prompt.trim() ? prompt.trim().slice(0, TONE_PROMPT_MAX) : null, rating: Number(rating), text }),
    onError: (e) => toast.error(errorText(e)),
  });
  useEffect(() => {
    run.reset();
    // Taslak değişince eski önizleme bayatlar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, slug]);
  const r = run.data;
  return (
    <section aria-labelledby="tone-preview-h" className="space-y-3 rounded-lg border border-border p-3">
      <h3 id="tone-preview-h" className="flex items-center gap-2 font-medium text-fg">
        <Sparkles className="h-4 w-4" aria-hidden />
        Önizleme (kaydetmeden)
      </h3>
      <p className="qx-small text-fg-muted">Gerçek otomatik yanıt sistem mesajı taslağınızla derlenir ve AI geçidinden (limit + günlük tavan + kullanım kaydı) bir yanıt üretilir.</p>
      <div className="space-y-1.5">
        <span id="tone-rating-l" className="qx-small font-medium text-fg">
          Müşteri puanı
        </span>
        <ChoiceChips aria-labelledby="tone-rating-l" options={RATING_OPTIONS} value={rating} onChange={(v) => v && setRating(v)} size="sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tone-sample">Örnek yorum</Label>
        <Textarea id="tone-sample" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} />
      </div>
      <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" disabled={run.isPending || text.trim().length < 5} onClick={() => run.mutate()}>
        <Sparkles className="h-4 w-4" aria-hidden />
        {run.isPending ? 'Üretiliyor…' : 'Yanıt üret'}
      </Button>
      {r ? (
        <div className="space-y-2" aria-live="polite">
          {r.reply ? (
            <blockquote className="rounded-md border-l-4 border-brand bg-brand-subtle/40 p-3 text-sm text-fg">{r.reply}</blockquote>
          ) : (
            <InlineError variant="banner" tone="warning">
              {r.reason === 'unconfigured' ? 'AI sağlayıcısı yapılandırılmamış; yanıt üretilmedi.' : 'Yorum güvenlik denetiminden geçmedi ya da AI kapalı; yanıt üretilmedi.'}
            </InlineError>
          )}
          {r.model ? <p className="qx-small text-fg-muted">Model: {r.model}</p> : null}
          <details>
            <summary className="qx-small min-h-11 cursor-pointer content-center text-brand">Gönderilen sistem mesajını göster</summary>
            <PromptBlock text={r.systemPrompt} label="Gönderilen sistem mesajı" />
          </details>
        </div>
      ) : null}
    </section>
  );
}

function ToneHistory({ id, onLoad, current }: { id: string; onLoad: (text: string) => void; current: string | null }) {
  const q = useQuery({ queryKey: studioKeys.toneHistory(id), queryFn: () => fetchToneHistory(id), staleTime: 30_000 });
  const LABEL: Record<string, string> = { AI_TONE_CREATE: 'Oluşturuldu', AI_TONE_UPDATE: 'Güncellendi', AI_TONE_ARCHIVE: 'Arşivlendi', AI_TONE_RESTORE: 'Yeniden etkin' };
  const rows = useMemo(() => q.data ?? [], [q.data]);
  return (
    <section aria-labelledby="tone-hist-h" className="space-y-2">
      <h3 id="tone-hist-h" className="font-medium text-fg">
        Değişiklik geçmişi
      </h3>
      <QueryState query={q} skeleton="list" isEmpty={(d) => d.length === 0} empty={{ compact: true, title: 'Kayıt yok', description: 'Bu üslup için denetim kaydı bulunmuyor (sürümleme öncesi oluşturulmuş olabilir).' }}>
        {() => (
          <ol className="space-y-2">
            {rows.map((h) => (
              <li key={h.id} className="space-y-1 rounded-md border border-border p-2">
                <p className="text-sm text-fg">
                  <span className="font-medium">{LABEL[h.action] ?? h.action}</span>{' '}
                  <span className="text-fg-muted">
                    · {fmtDateTime(h.at)} · {actorName(h.actor)}
                    {h.reason ? ` · “${h.reason}”` : ''}
                  </span>
                </p>
                {h.after?.systemPrompt && h.after.systemPrompt !== current ? (
                  <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2 sm:min-h-9" onClick={() => onLoad(h.after!.systemPrompt!)}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Bu metni editöre al
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </QueryState>
    </section>
  );
}

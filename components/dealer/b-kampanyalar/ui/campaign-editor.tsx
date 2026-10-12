'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Loader2, Megaphone, Send } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import {
  CAMPAIGN_SEGMENT_KEYS,
  MESSAGE_MAX,
  MESSAGE_RECOMMENDED,
  TITLE_MAX,
  TITLE_RECOMMENDED,
  type CampaignSegmentKey,
} from '../domain';
import type { CampaignDto, PrefillDraft } from '../types';
import { campaignApi, campaignKeys } from '../client/api';
import { useCampaignCopy } from '../client/use-copy';
import { fmtNumber } from '../copy';

export type EditorTarget =
  | { mode: 'create'; prefill?: PrefillDraft | null }
  | { mode: 'edit'; campaign: CampaignDto };

export type CampaignEditorProps = {
  target: EditorTarget | null;
  dealerId: string | null;
  onClose: () => void;
  /** Kaydedildi; `andSend` → çağıran gönderim penceresini açar. */
  onSaved: (campaign: CampaignDto, opts: { andSend: boolean; created: boolean }) => void;
};

/**
 * Kampanya editörü (oluştur + düzenle aynı bileşen; denetim Bulgu 10). Sağdan açılan panel,
 * mobilde tam genişlik. Kitle kartları canlı sayı gösterir (toplam / izinli).
 */
export function CampaignEditor({ target, dealerId, onClose, onSaved }: CampaignEditorProps) {
  const { c, locale } = useCampaignCopy();
  const open = target !== null;
  const editing = target?.mode === 'edit' ? target.campaign : null;
  const prefill = target?.mode === 'create' ? target.prefill ?? null : null;

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [segment, setSegment] = useState<CampaignSegmentKey>('all');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState<null | 'save' | 'send'>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const ids = {
    title: useId(),
    titleHelp: useId(),
    titleErr: useId(),
    message: useId(),
    messageHelp: useId(),
    messageErr: useId(),
    audience: useId(),
    audienceHint: useId(),
  };

  // Açılışta formu hedefe göre doldur (eski diyalog önceki taslağı taşıyordu).
  useEffect(() => {
    if (!target) return;
    setTouched(false);
    setServerError(null);
    setSaving(null);
    if (target.mode === 'edit') {
      setTitle(target.campaign.title);
      setMessage(target.campaign.message);
      setSegment(target.campaign.segment ?? 'all');
    } else {
      setTitle(target.prefill?.title ?? '');
      setMessage(target.prefill?.message ?? '');
      setSegment(target.prefill?.segment ?? 'all');
    }
  }, [target]);

  const audience = useQuery({
    queryKey: campaignKeys.audience(dealerId),
    queryFn: ({ signal }) => campaignApi.audience(dealerId, signal),
    enabled: open,
    staleTime: 60_000,
  });
  const counts = new Map((audience.data?.segments ?? []).map((s) => [s.key, s]));

  const titleTrim = title.trim();
  const messageTrim = message.trim();
  const titleError = touched && !titleTrim ? c.editor.required : null;
  const messageError = touched && !messageTrim ? c.editor.required : null;

  async function save(andSend: boolean) {
    setTouched(true);
    setServerError(null);
    if (!titleTrim || !messageTrim) return;
    setSaving(andSend ? 'send' : 'save');
    try {
      const input = { title: titleTrim, message: messageTrim, targetSegment: segment };
      const res = editing ? await campaignApi.update(editing.id, input) : await campaignApi.create(input);
      onSaved(res.campaign, { andSend, created: !editing });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : c.errors.generic);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => (!v && !saving ? onClose() : undefined)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-subtle px-5 py-4 pr-16 text-left">
          <SheetTitle className="qx-h3 flex items-center gap-2 text-fg">
            <Megaphone aria-hidden className="h-5 w-5 text-brand" />
            {editing ? c.editor.editTitle : c.editor.createTitle}
          </SheetTitle>
          <SheetDescription className="qx-small text-fg-muted">{c.editor.description}</SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col gap-6 px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
          noValidate
        >
          {editing?.fromPlaybook && <InlineError variant="banner" tone="info">{c.editor.playbookNote}</InlineError>}
          {prefill?.source && <InlineError variant="banner" tone="info">{c.editor.prefillNote(prefill.source)}</InlineError>}

          {/* 1 · Kitle */}
          <fieldset className="space-y-3" aria-describedby={ids.audienceHint}>
            <legend className="qx-small font-semibold text-fg">{c.editor.audience}</legend>
            <p id={ids.audienceHint} className="qx-caption text-fg-muted">
              {c.editor.audienceHint}
            </p>
            {audience.isError && (
              <InlineError variant="banner" tone="warning" onRetry={() => void audience.refetch()}>
                {c.editor.audienceError}
              </InlineError>
            )}
            <div role="radiogroup" aria-label={c.editor.audience} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CAMPAIGN_SEGMENT_KEYS.map((key) => {
                const s = counts.get(key);
                const checked = segment === key;
                return (
                  <label
                    key={key}
                    className={cn(
                      'relative flex min-h-[44px] cursor-pointer flex-col gap-0.5 rounded-control border px-3 py-2.5 transition-colors duration-fast',
                      'focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background',
                      checked ? 'border-brand bg-brand-subtle' : 'border-subtle bg-surface-1 hover:bg-surface-3'
                    )}
                  >
                    <input
                      type="radio"
                      name={ids.audience}
                      value={key}
                      checked={checked}
                      onChange={() => setSegment(key)}
                      className="sr-only"
                    />
                    <span className="qx-small font-medium text-fg">{c.segments[key].label}</span>
                    <span className="qx-caption text-fg-muted">{c.segments[key].hint}</span>
                    <span className="qx-caption qx-num mt-0.5 text-fg" aria-live="polite">
                      {audience.isLoading ? (
                        <span className="text-fg-subtle">{c.editor.audienceLoading}</span>
                      ) : s ? (
                        c.editor.reachable(fmtNumber(s.reachable, locale), fmtNumber(s.total, locale))
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* 2 · İçerik */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor={ids.title} className="qx-small font-semibold text-fg">
                {c.editor.title}
              </Label>
              <Counter value={title.length} max={TITLE_MAX} recommended={TITLE_RECOMMENDED} />
            </div>
            <Input
              id={ids.title}
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={c.editor.titlePlaceholder}
              aria-describedby={ids.titleHelp}
              error={!!titleError}
              errorId={ids.titleErr}
              autoComplete="off"
            />
            <p id={ids.titleHelp} className="qx-caption text-fg-muted">
              {title.length > TITLE_RECOMMENDED ? c.editor.overRecommended : c.editor.titleHelp(TITLE_RECOMMENDED)}
            </p>
            {titleError && <InlineError id={ids.titleErr}>{titleError}</InlineError>}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor={ids.message} className="qx-small font-semibold text-fg">
                {c.editor.message}
              </Label>
              <Counter value={message.length} max={MESSAGE_MAX} recommended={MESSAGE_RECOMMENDED} />
            </div>
            <Textarea
              id={ids.message}
              value={message}
              maxLength={MESSAGE_MAX}
              rows={4}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={c.editor.messagePlaceholder}
              aria-describedby={`${ids.messageHelp}${messageError ? ` ${ids.messageErr}` : ''}`}
              aria-invalid={messageError ? true : undefined}
              className={messageError ? 'border-destructive focus-visible:ring-destructive' : undefined}
            />
            <p id={ids.messageHelp} className="qx-caption text-fg-muted">
              {message.length > MESSAGE_RECOMMENDED ? c.editor.overRecommended : c.editor.messageHelp(MESSAGE_RECOMMENDED)}
            </p>
            {messageError && <InlineError id={ids.messageErr}>{messageError}</InlineError>}
          </div>

          {/* 3 · Önizleme */}
          <section aria-label={c.editor.preview} className="space-y-2">
            <h3 className="qx-small font-semibold text-fg">{c.editor.preview}</h3>
            <div className="rounded-card border border-subtle bg-surface-3 p-3">
              <div className="flex items-start gap-3 rounded-control bg-surface-1 p-3 qx-elevation-1">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-chip bg-brand-subtle text-brand">
                  <Bell className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 qx-caption text-fg-muted">
                    <span>{c.editor.previewApp}</span>
                    <span>{c.editor.previewNow}</span>
                  </div>
                  <p className="qx-small truncate font-semibold text-fg">{titleTrim || c.editor.previewEmptyTitle}</p>
                  <p className="qx-small line-clamp-3 whitespace-pre-line break-words text-fg-muted">
                    {messageTrim || c.editor.previewEmptyMessage}
                  </p>
                </div>
              </div>
            </div>
            <p className="qx-caption text-fg-muted">{c.editor.channelNote}</p>
          </section>

          {serverError && (
            <InlineError variant="banner" tone="danger">
              {serverError}
            </InlineError>
          )}

          <div className="mt-auto flex flex-col-reverse gap-2 border-t border-subtle pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={!!saving}>
              {c.editor.cancel}
            </Button>
            <Button type="submit" variant="outline" disabled={!!saving} aria-busy={saving === 'save' || undefined}>
              {saving === 'save' && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              {saving === 'save' ? c.editor.saving : c.editor.save}
            </Button>
            <Button type="button" onClick={() => void save(true)} disabled={!!saving} aria-busy={saving === 'send' || undefined} className="shadow-none">
              {saving === 'send' ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
              {saving === 'send' ? c.editor.saving : c.editor.saveAndSend}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Counter({ value, max, recommended }: { value: number; max: number; recommended: number }) {
  const { c } = useCampaignCopy();
  return (
    <span className={cn('qx-caption qx-num', value > recommended ? 'text-warning' : 'text-fg-muted')} aria-hidden>
      {c.editor.counter(value, max)}
    </span>
  );
}

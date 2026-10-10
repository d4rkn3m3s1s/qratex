'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gift, MessageSquareText, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { InlineError, SkeletonBlock } from '@/components/states';
import { NOTE_MAX, type ActionAudience, type ActionSpec, type MessageTemplate } from '@/lib/dealer-customers/types';
import { customerKeys, executeCustomerAction, newIdempotencyKey, previewCustomerAction } from './api';
import { useCustomersCopy } from './copy';

export type ComposerRequest = {
  audience: ActionAudience;
  audienceLabel: string;
  type: ActionSpec['type'];
  template?: MessageTemplate;
};

type Props = {
  request: ComposerRequest | null;
  onClose: () => void;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Önizle → onayla → gönder penceresi. Alıcıları sunucu çözer; pencere açılınca ve seçim
 * değişince önizleme (kaç kişiye gidecek, kim neden elendi, müşterinin göreceği metin) gelir.
 * Gönder düğmesi gerçek sayıyı söyler; 0 uygun alıcıda devre dışıdır. Çift tık `Idempotency-Key`
 * ile tek gönderime iner; hata pencereyi kapatmaz.
 */
export function ActionComposer({ request, onClose }: Props) {
  const copy = useCustomersCopy();
  const qc = useQueryClient();
  const open = request != null;
  const [type, setType] = useState<ActionSpec['type']>('message');
  const [template, setTemplate] = useState<MessageTemplate>('winback');
  const [note, setNote] = useState('');
  const idemKey = useRef<string>(newIdempotencyKey());

  useEffect(() => {
    if (!request) return;
    setType(request.type);
    setTemplate(request.template ?? 'winback');
    setNote('');
    idemKey.current = newIdempotencyKey();
  }, [request]);

  const debouncedNote = useDebounced(note, 400);
  const spec: ActionSpec = useMemo(
    () => (type === 'message' ? { type, template, note: debouncedNote || undefined } : { type, note: debouncedNote || undefined }),
    [type, template, debouncedNote]
  );
  const audienceKey = request ? JSON.stringify(request.audience) : '';

  const preview = useQuery({
    queryKey: ['dealer', 'customers', 'preview', audienceKey, spec.type, spec.type === 'message' ? spec.template : '', spec.note ?? ''],
    queryFn: () => previewCustomerAction(request!.audience, spec),
    enabled: open,
    staleTime: 15_000,
    retry: 1,
  });

  const send = useMutation({
    mutationFn: () =>
      executeCustomerAction(
        request!.audience,
        type === 'message' ? { type, template, note: note.trim() || undefined } : { type, note: note.trim() || undefined },
        idemKey.current
      ),
    onSuccess: (res) => {
      const msg = type === 'message' ? copy.resultMessage(res.sent) : copy.resultOffer(res.offersCreated, res.conflicts);
      toast.success(msg);
      announce(msg);
      idemKey.current = newIdempotencyKey();
      void qc.invalidateQueries({ queryKey: customerKeys.all });
      onClose();
    },
  });

  const p = preview.data;
  const eligible = p?.eligible ?? 0;
  const noteLen = note.length;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !send.isPending ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{copy.composerTitle}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden />
            <span>
              {copy.composerAudience}: <strong className="text-fg">{request?.audienceLabel}</strong>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend id="composer-type" className="qx-small font-medium text-fg">
              {copy.composerType}
            </legend>
            <ChoiceChips
              aria-labelledby="composer-type"
              value={type}
              onChange={(v) => v && setType(v)}
              options={[
                { value: 'message', label: copy.typeMessage, icon: <MessageSquareText className="h-4 w-4" /> },
                { value: 'personal_offer', label: copy.typeOffer, icon: <Gift className="h-4 w-4" /> },
              ]}
            />
            <p className="qx-caption text-fg-muted">{type === 'message' ? copy.typeMessageHint : copy.typeOfferHint}</p>
          </fieldset>

          {type === 'message' && (
            <fieldset className="space-y-2">
              <legend id="composer-template" className="qx-small font-medium text-fg">
                {copy.template}
              </legend>
              <ChoiceChips
                aria-labelledby="composer-template"
                size="sm"
                value={template}
                onChange={(v) => v && setTemplate(v)}
                options={(['winback', 'thanks', 'welcome', 'checkin'] as const).map((t) => ({ value: t, label: copy.templates[t] }))}
              />
            </fieldset>
          )}

          <div className="space-y-2">
            <Label htmlFor="composer-note">{copy.note}</Label>
            <Textarea
              id="composer-note"
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby="composer-note-hint"
            />
            <p id="composer-note-hint" className="qx-caption text-fg-muted">
              {copy.noteHint(noteLen, NOTE_MAX)}
            </p>
          </div>

          <section aria-live="polite" aria-busy={preview.isFetching} className="space-y-3 rounded-card border border-subtle bg-surface-muted p-4">
            {preview.isError && !p ? (
              <InlineError variant="banner" onRetry={() => void preview.refetch()}>
                {(preview.error as Error)?.message || copy.previewError}
              </InlineError>
            ) : !p ? (
              <div className="space-y-2" aria-label={copy.previewLoading}>
                <SkeletonBlock className="h-4 w-1/2" />
                <SkeletonBlock className="h-16 w-full" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="qx-small text-fg-muted">{copy.candidates(p.candidates)}</p>
                  <p className="qx-h3 qx-num text-fg">{copy.eligible(p.eligible)}</p>
                </div>
                <ul className="qx-caption space-y-0.5 text-fg-muted">
                  {p.skipped.optedOut > 0 && <li>• {copy.skippedOptOut(p.skipped.optedOut)}</li>}
                  {p.skipped.cooldown > 0 && <li>• {copy.skippedCooldown(p.skipped.cooldown)}</li>}
                  {p.skipped.ineligible > 0 && <li>• {copy.skippedIneligible(p.skipped.ineligible)}</li>}
                  {p.skipped.overCap > 0 && <li>• {copy.skippedOverCap(p.skipped.overCap)}</li>}
                  <li>• {copy.dailyRemaining(p.dailyRemaining)}</li>
                </ul>
                <div className="rounded-control border border-subtle bg-surface-1 p-3">
                  <p className="qx-caption mb-1 text-fg-muted">{copy.previewTitle}</p>
                  <p className="qx-small font-semibold text-fg">{p.sample.title}</p>
                  <p className="qx-small whitespace-pre-line text-fg">{p.sample.message}</p>
                </div>
                {p.offerOptions && p.offerOptions.length > 0 && (
                  <div>
                    <p className="qx-caption mb-1 text-fg-muted">{copy.offerOptionsTitle}</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {p.offerOptions.map((o) => (
                        <li key={o.type} className="qx-caption rounded-chip border border-subtle bg-surface-1 px-2 py-1 text-fg">
                          {o.label}: {o.values.join(' / ')} {o.unit}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>

          {send.isError && <InlineError variant="banner">{(send.error as Error)?.message ?? copy.previewError}</InlineError>}
        </div>

        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={send.isPending} className="min-h-11">
            {copy.cancel}
          </Button>
          <Button
            onClick={() => send.mutate()}
            disabled={!p || eligible === 0 || send.isPending || preview.isFetching}
            loading={send.isPending}
            className="min-h-11"
          >
            <Send className="h-4 w-4" aria-hidden />
            {send.isPending ? copy.sending : copy.send(eligible)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

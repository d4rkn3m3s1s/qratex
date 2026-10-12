'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { Loader2, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InlineError, TONE_CALLOUT } from '@/components/states';
import { WEBHOOK_EVENTS } from '@/lib/integrations/contract';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { DrawCheck } from '@/components/fx/event-fx';
import { playSound } from '@/lib/sound';
import { errorText, intKeys, testWebhook } from './api';
import { ERROR_KIND_LABEL, ERROR_KIND_LABEL_EN } from './format';
import { useLocaleSafe } from '@/lib/app-locale';

/** "Test olayı gönder": örnek payload'ı yalnız bu uca gönderir; sonuç satır içi (kod, süre, yanıt). */
export function TestPanel({ webhookId, disabled }: { webhookId: string; disabled?: boolean }) {
  const en = useLocaleSafe() === 'en';
  const qc = useQueryClient();
  const reduce = useReducedMotionPref();
  const id = useId();
  const [event, setEvent] = useState<string>(WEBHOOK_EVENTS[0].key);
  const test = useMutation({
    mutationFn: () => testWebhook(webhookId, event),
    // Webhook test anı: sonuca göre ses (admin kapsamında varsayılan KAPALI, tercihle açılır).
    onSuccess: (res) => playSound(res.ok ? 'success' : 'error'),
    onError: () => playSound('error'),
    onSettled: () => void qc.invalidateQueries({ queryKey: intKeys.all }),
  });
  const r = test.data;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`${id}-ev`}>{en ? 'Sample event' : 'Örnek veri'}</Label>
          <Select value={event} onValueChange={setEvent}>
            <SelectTrigger id={`${id}-ev`} className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEBHOOK_EVENTS.map((e) => (
                <SelectItem key={e.key} value={e.key}>
                  {e.label} ({e.key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="min-h-11" onClick={() => test.mutate()} disabled={disabled || test.isPending} aria-busy={test.isPending}>
          {test.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          {en ? 'Send test event' : 'Test olayı gönder'}
        </Button>
      </div>
      <div aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {r ? (
            <Motion.div
              key={r.deliveryId}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.base, ease: EASE.emphasized }}
              className={cn('space-y-1 rounded-card border p-3 text-sm', !r.ok && !reduce && 'qx-fx-shake-once', TONE_CALLOUT[r.ok ? 'success' : 'danger'])}
            >
              <p className="flex items-center gap-2 font-medium">
                {r.ok ? <DrawCheck className="h-4 w-4" /> : <XCircle className="qx-fx-spin-in h-4 w-4" aria-hidden />}
                {r.ok ? `${en ? 'Succeeded' : 'Başarılı'} · HTTP ${r.status}` : `${en ? 'Failed' : 'Başarısız'}${r.status ? ` · HTTP ${r.status}` : ''}${r.errorKind ? ` · ${(en ? ERROR_KIND_LABEL_EN : ERROR_KIND_LABEL)[r.errorKind] ?? r.errorKind}` : ''}`}
                <span className="ml-auto text-xs font-normal">{r.durationMs} ms</span>
              </p>
              {r.error ? <p>{r.error}</p> : null}
              {r.responseSnippet ? <pre className="max-h-32 overflow-auto rounded bg-surface-1 p-2 font-mono text-xs text-fg">{r.responseSnippet}</pre> : null}
            </Motion.div>
          ) : null}
        </AnimatePresence>
        {test.isError ? <InlineError>{errorText(test.error)}</InlineError> : null}
      </div>
    </div>
  );
}

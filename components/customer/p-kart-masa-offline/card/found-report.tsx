'use client';

/**
 * "Kartı buldum, sahibine haber ver" — anonim kayıp kart bildirimi (rapor B14).
 * POST /api/cards/[token]/found; yanıt kartın durumunu ya da sahibini açığa çıkarmaz.
 */
import { useId, useRef, useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { announce } from '@/components/ds/a11y';
import { TONE_CALLOUT } from '@/components/states';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { CardCopy } from './copy';

const NOTE_MAX = 280;

export function FoundReport({ token, copy }: { token: string; copy: CardCopy }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const noteId = useId();
  const hintId = useId();
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = async () => {
    setState('pending');
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(token)}/found`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note.trim() ? { note: note.trim().slice(0, NOTE_MAX) } : {}),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('done');
      track('card_found_reported', { hasNote: !!note.trim() });
      announce(copy.foundDone);
    } catch {
      setState('error');
      announce(copy.foundFailed, { politeness: 'assertive' });
    }
  };

  if (state === 'done') {
    return (
      <p role="status" className={cn('rounded-card border p-4 text-sm', TONE_CALLOUT.success)}>
        {copy.foundDone}
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => noteRef.current?.focus());
        }}
      >
        <HeartHandshake className="h-5 w-5" aria-hidden />
        {copy.foundOpen}
      </Button>
    );
  }

  return (
    <section aria-labelledby="found-title" className="space-y-3 rounded-card border border-border bg-surface-1 p-4">
      <div className="space-y-1">
        <h2 id="found-title" className="qx-h3 text-fg">
          {copy.foundTitle}
        </h2>
        <p className="text-sm text-fg-muted">{copy.foundBody}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={noteId}>{copy.foundNoteLabel}</Label>
        <Textarea
          id={noteId}
          ref={noteRef}
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          placeholder={copy.foundNotePlaceholder}
          aria-describedby={hintId}
          onChange={(e) => setNote(e.target.value)}
        />
        <p id={hintId} className="text-xs text-fg-muted">
          {copy.foundNoteHint}
        </p>
      </div>
      {state === 'error' && (
        <p role="alert" className={cn('rounded-control border p-3 text-sm', TONE_CALLOUT.danger)}>
          {copy.foundFailed}
        </p>
      )}
      <Button type="button" className="min-h-12 w-full" loading={state === 'pending'} onClick={() => void submit()}>
        {copy.foundSubmit}
      </Button>
    </section>
  );
}

'use client';

/**
 * Saha bildirimi alt sayfası (eski /staff/field yerine). İki dokunuş: konu çipi → Gönder.
 * Çevrimdışıysa bildirim cihazda kuyruğa alınır (`clientId` ile idempotent) ve bağlantı
 * gelince/ekran açılınca otomatik gönderilir. Konum isteğe bağlı; sunucu ~100 m'ye yuvarlar.
 */
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { FIELD_REPORT_CATEGORIES, type FieldReportCategory } from '@/lib/staff-ops/core';
import { STAFF_TODAY_QUERY_KEY } from '@/lib/staff-ops/types';
import { cn } from '@/lib/utils';
import { newClientId, sendJson, TeamApiError } from '@/components/dealer/b-ekip/shared';
import { useTeamCopy } from '@/components/dealer/b-ekip/copy';
import { useStaffCopy } from './copy';

type Payload = {
  clientId: string;
  category: FieldReportCategory;
  urgent: boolean;
  note?: string;
  location?: { lat: number; lng: number; accuracyM?: number };
};

const QUEUE_KEY = 'qx.staff.fieldReportQueue.v1';
const LOC_PREF_KEY = 'qx.staff.fieldReportLocation';

function readQueue(): Payload[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as Payload[]).slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: Payload[]) {
  try {
    if (q.length) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(0, 20)));
    else window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* depolama kapalı: kuyruk yalnız bellekte kalmaz, kullanıcıya hata gösterilir */
  }
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TeamApiError && err.code === 'NETWORK';
}

/** Kuyruğu boşaltır; gönderilen sayısını döndürür. Sunucu reddederse (4xx) kayıt atılır. */
async function flushQueue(): Promise<number> {
  const q = readQueue();
  if (!q.length) return 0;
  const left: Payload[] = [];
  let sent = 0;
  for (const p of q) {
    try {
      await sendJson('/api/staff/field-reports', 'POST', p);
      sent++;
    } catch (err) {
      if (isNetworkError(err) || (err instanceof TeamApiError && (err.status >= 500 || err.status === 429))) left.push(p);
    }
  }
  writeQueue(left);
  return sent;
}

export function useFieldReportQueue() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(0);
  const refresh = useCallback(() => setPending(readQueue().length), []);
  const flush = useCallback(async () => {
    const n = await flushQueue();
    refresh();
    if (n) void qc.invalidateQueries({ queryKey: [STAFF_TODAY_QUERY_KEY] });
  }, [qc, refresh]);
  useEffect(() => {
    refresh();
    void flush();
    const on = () => void flush();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [flush, refresh]);
  return { pending, refresh, flush };
}

function getPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

export function FieldReportSheet({ open, onOpenChange, onQueued }: { open: boolean; onOpenChange: (o: boolean) => void; onQueued: () => void }) {
  const { s } = useStaffCopy();
  const { copy } = useTeamCopy();
  const c = s.sheet;
  const qc = useQueryClient();
  const [category, setCategory] = useState<FieldReportCategory | null>(null);
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [withLocation, setWithLocation] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'locating' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setWithLocation(window.localStorage.getItem(LOC_PREF_KEY) === '1');
    } catch {
      /* yok say */
    }
  }, []);

  const reset = () => {
    setCategory(null);
    setNote('');
    setUrgent(false);
    setError(null);
    setPhase('idle');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      setError(c.pickCategory);
      return;
    }
    setError(null);
    const payload: Payload = { clientId: newClientId('fr'), category, urgent, note: note.trim() || undefined };
    if (withLocation) {
      setPhase('locating');
      const pos = await getPosition();
      if (pos) payload.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy };
      else toast.message(c.locationFailed);
    }
    setPhase('sending');
    try {
      await sendJson('/api/staff/field-reports', 'POST', payload);
      toast.success(c.sent);
      void qc.invalidateQueries({ queryKey: [STAFF_TODAY_QUERY_KEY] });
      reset();
      onOpenChange(false);
    } catch (err) {
      if (isNetworkError(err)) {
        writeQueue([...readQueue(), payload]);
        onQueued();
        toast.message(c.queued);
        reset();
        onOpenChange(false);
      } else {
        setPhase('idle');
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const busy = phase !== 'idle';

  return (
    <Sheet open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-sheet sm:mx-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="text-left">
            <SheetTitle>{c.title}</SheetTitle>
            <SheetDescription>{c.desc}</SheetDescription>
          </SheetHeader>

          <fieldset className="space-y-2">
            <legend className="qx-small font-medium text-fg">{c.category}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={c.category}>
              {FIELD_REPORT_CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'qx-small min-h-12 rounded-control border px-3 font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active ? 'border-brand bg-brand-subtle text-brand' : 'border-subtle bg-surface-1 text-fg hover:border-strong'
                    )}
                  >
                    {copy.fieldCategory[cat]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="saha-not" className="qx-small font-medium text-fg">
              {c.note}
            </label>
            <textarea
              id="saha-not"
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder={c.notePh}
              aria-describedby="saha-not-sayac"
              className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p id="saha-not-sayac" className="qx-caption qx-num text-right text-fg-muted">
              {note.length}/500
            </p>
          </div>

          <div className="space-y-3 rounded-card border border-subtle p-3">
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span>
                <span className="qx-small block font-medium text-fg">{c.urgent}</span>
                <span className="qx-caption text-fg-muted">{c.urgentHint}</span>
              </span>
              <Switch checked={urgent} onCheckedChange={setUrgent} aria-label={c.urgent} />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span>
                <span className="qx-small block font-medium text-fg">{c.location}</span>
                <span className="qx-caption text-fg-muted">{c.locationHint}</span>
              </span>
              <Switch
                checked={withLocation}
                onCheckedChange={(v) => {
                  setWithLocation(v);
                  try {
                    window.localStorage.setItem(LOC_PREF_KEY, v ? '1' : '0');
                  } catch {
                    /* yok say */
                  }
                }}
                aria-label={c.location}
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="qx-small text-danger">
              {error}
            </p>
          )}

          <Button type="submit" className="min-h-12 w-full text-base" disabled={busy} aria-busy={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
            {phase === 'locating' ? c.locating : phase === 'sending' ? c.sending : c.send}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

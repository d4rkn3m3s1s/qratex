'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { PRIORITIES, PRIORITY_LABEL, type DealerOption, type Priority, type SessionDetail } from '@/lib/council/contract';
import { errorText, publishActions } from './api';
import { DealerPicker } from './parts';

type Draft = { key: string; selected: boolean; title: string; detail: string; priority: Priority };

const DUE_OPTIONS = [
  { value: '3', label: '3 gün' },
  { value: '7', label: '7 gün' },
  { value: '14', label: '14 gün' },
  { value: '30', label: '30 gün' },
] as const;

/**
 * "Yayınla" — karar aksiyonlarını düzenleyip seçilen bayinin aksiyon kuyruğuna yazar.
 * Bayiye yalnız başlık + açıklama gider: yönetici sorusu, persona adı ve uydurma etki puanı GİTMEZ.
 * Aynı bayiye daha önce yayınlanan aksiyon sunucuda atlanır (çift tık / tekrar güvenli).
 */
export function PublishDialog({
  open,
  onOpenChange,
  session,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: SessionDetail;
  onPublished: (s: SessionDetail) => void;
}) {
  const baseId = useId();
  const initialDealer: DealerOption | null =
    session.scope?.kind === 'dealer' ? { id: session.scope.dealerId, label: session.scope.dealerName, secondary: null } : null;
  const [dealer, setDealer] = useState<DealerOption | null>(initialDealer);
  const [due, setDue] = useState<string>('7');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDrafts((session.decision?.actions ?? []).map((a) => ({ key: a.key, selected: true, title: a.title, detail: a.detail, priority: a.priority })));
    setError(null);
    setDealer(initialDealer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session.id]);

  const publishedForDealer = useMemo(
    () => new Set(session.published.filter((p) => p.dealerId === dealer?.id).map((p) => p.actionKey)),
    [session.published, dealer?.id]
  );
  const chosen = drafts.filter((d) => d.selected && !publishedForDealer.has(d.key));
  const invalid = chosen.some((d) => d.title.trim().length < 3);

  const update = (key: string, patch: Partial<Draft>) => setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const submit = async () => {
    setError(null);
    if (!dealer) return setError('Bir bayi seçin.');
    if (chosen.length === 0) return setError('Yayınlanacak yeni aksiyon yok.');
    if (invalid) return setError('Seçili aksiyonların başlığı en az 3 karakter olmalı.');
    setBusy(true);
    try {
      const r = await publishActions(session.id, {
        dealerId: dealer.id,
        dueInDays: Number(due),
        actions: chosen.map((d) => ({ key: d.key, title: d.title.trim(), detail: d.detail.trim(), priority: d.priority })),
      });
      onPublished(r.detail);
      toast.success(
        r.created > 0
          ? `${r.created} aksiyon ${dealer.label} kuyruğuna yazıldı; bayi bilgilendirildi.`
          : 'Seçilen aksiyonlar bu bayiye zaten yayınlanmıştı; yeni kayıt açılmadı.'
      );
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e, 'Aksiyonlar yayınlanamadı.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aksiyonları bayi kuyruğuna yayınla</DialogTitle>
          <DialogDescription>
            Bayi yalnız başlığı ve açıklamayı görür. Konsey sorusu ve ajan adları bayiye gitmez. Aynı aksiyon aynı bayiye ikinci kez yazılmaz.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <DealerPicker value={dealer} onChange={setDealer} label="Hedef bayi" invalid={!!error && !dealer} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">Vade</legend>
            <ChoiceChips aria-label="Vade" options={DUE_OPTIONS} value={due} onChange={(v) => v && setDue(v)} size="sm" />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-fg">Aksiyonlar</legend>
            {drafts.map((d, i) => {
              const done = publishedForDealer.has(d.key);
              const fid = `${baseId}-${d.key}`;
              return (
                <div key={d.key} className="rounded-md border border-border p-3">
                  <div className="flex items-start gap-3">
                    <input
                      id={`${fid}-sel`}
                      type="checkbox"
                      checked={d.selected && !done}
                      disabled={done}
                      onChange={(e) => update(d.key, { selected: e.target.checked })}
                      className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                      aria-label={`Aksiyon ${i + 1}: yayınla`}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      {done ? <p className="text-xs font-medium text-success">Bu bayiye zaten yayınlandı.</p> : null}
                      <label htmlFor={`${fid}-title`} className="sr-only">
                        Aksiyon {i + 1} başlığı
                      </label>
                      <input
                        id={`${fid}-title`}
                        value={d.title}
                        maxLength={200}
                        disabled={done || !d.selected}
                        onChange={(e) => update(d.key, { title: e.target.value })}
                        className="h-11 w-full rounded-md border border-border bg-surface-1 px-3 text-sm font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
                      />
                      <label htmlFor={`${fid}-detail`} className="sr-only">
                        Aksiyon {i + 1} açıklaması
                      </label>
                      <textarea
                        id={`${fid}-detail`}
                        value={d.detail}
                        maxLength={1000}
                        rows={2}
                        disabled={done || !d.selected}
                        onChange={(e) => update(d.key, { detail: e.target.value })}
                        placeholder="Bayi için açıklama (ne yapılacak, nasıl ölçülecek)"
                        className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
                      />
                      <ChoiceChips
                        aria-label={`Aksiyon ${i + 1} önceliği`}
                        size="sm"
                        disabled={done || !d.selected}
                        options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
                        value={d.priority}
                        onChange={(v) => v && update(d.key, { priority: v })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </fieldset>

          {error ? <InlineError variant="banner">{error}</InlineError> : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Vazgeç
          </Button>
          <Button onClick={submit} disabled={busy || !dealer || chosen.length === 0}>
            {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send aria-hidden className="h-4 w-4" />}
            {chosen.length ? `${chosen.length} aksiyonu yayınla` : 'Yayınla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

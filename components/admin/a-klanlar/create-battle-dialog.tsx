'use client';

import { useEffect, useId, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/states';
import { BATTLE_DURATION_PRESETS, type SquadOption } from '@/lib/admin-squads/contract';
import { cn } from '@/lib/utils';
import { createBattle, errorText, fetchOptions, fieldError, squadsKeys } from './api';
import { fmtNumber } from './format';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SquadPicker({
  label,
  value,
  onChange,
  excludeId,
  error,
}: {
  label: string;
  value: SquadOption | null;
  onChange: (s: SquadOption | null) => void;
  excludeId?: string;
  error?: string;
}) {
  const id = useId();
  const [term, setTerm] = useState('');
  const q = useDebounced(term.trim());
  const opts = useQuery({
    queryKey: squadsKeys.options(q),
    queryFn: ({ signal }) => fetchOptions(q, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const items = (opts.data ?? []).filter((o) => o.id !== excludeId);

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium text-fg">{label}</legend>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-control border border-brand-border bg-brand-subtle px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-medium text-fg">
            {value.name} <span className="font-normal text-fg-muted">· {value.memberCount} üye</span>
          </span>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => onChange(null)}>
            Değiştir
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <Input
              id={id}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Klan adı ya da davet kodu"
              aria-label={`${label}: klan ara`}
              className="min-h-11 pl-9"
              autoComplete="off"
            />
          </div>
          <div role="listbox" aria-label={`${label} seçenekleri`} className="max-h-48 overflow-y-auto rounded-control border border-subtle">
            {opts.isError ? (
              <p className="p-3 text-sm text-danger">{errorText(opts.error)}</p>
            ) : opts.isLoading ? (
              <p className="p-3 text-sm text-fg-muted">Yükleniyor…</p>
            ) : items.length === 0 ? (
              <p className="p-3 text-sm text-fg-muted">Eşleşen klan yok.</p>
            ) : (
              items.map((o) => {
                const why = o.isFrozen ? 'Dondurulmuş' : o.hasOpenBattle ? 'Açık savaşı var' : o.memberCount === 0 ? 'Üyesi yok' : null;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    aria-disabled={!!why}
                    disabled={!!why}
                    onClick={() => onChange(o)}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-2 border-b border-subtle px-3 py-2 text-left text-sm last:border-b-0',
                      why ? 'cursor-not-allowed text-fg-subtle' : 'hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none'
                    )}
                  >
                    <span className="min-w-0 truncate">{o.name}</span>
                    <span className="shrink-0 text-xs text-fg-muted">{why ?? `${fmtNumber(o.memberCount)} üye`}</span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function CreateBattleDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [a, setA] = useState<SquadOption | null>(null);
  const [b, setB] = useState<SquadOption | null>(null);
  const [hours, setHours] = useState<number>(24);
  const [mode, setMode] = useState<'invite' | 'start_now'>('invite');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  // Kapanınca form tamamen sıfırlanır: görünmeyen eski seçimle savaş yaratılamaz (B7).
  useEffect(() => {
    if (!open) {
      setA(null);
      setB(null);
      setHours(24);
      setMode('invite');
      setErr(null);
    }
  }, [open]);

  const valid = !!a && !!b && a.id !== b.id;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || busy || !a || !b) return;
            setBusy(true);
            setErr(null);
            try {
              const r = await createBattle({ squad1Id: a.id, squad2Id: b.id, durationHours: hours, mode });
              toast.success(r.status === 'active' ? 'Savaş başladı; iki klanın kadrosu bilgilendirildi' : `Davet gönderildi; ${b.name} liderinin kabulü bekleniyor`);
              await qc.invalidateQueries({ queryKey: ['admin-squads'] });
              onOpenChange(false);
              onCreated(r.id);
            } catch (e2) {
              setErr(e2);
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Onur savaşı planla</DialogTitle>
            <DialogDescription>
              Yönetici savaşları ödülsüzdür: puan basılmaz, zafer klan siciline yazılır. Ödül havuzu yalnız liderlerin kendi puanıyla açtığı meydan okumalarda olur.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <SquadPicker label="Birinci klan" value={a} onChange={setA} excludeId={b?.id} error={fieldError(err, 'squad1Id')} />
            <SquadPicker label="İkinci klan" value={b} onChange={setB} excludeId={a?.id} error={fieldError(err, 'squad2Id')} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">Süre</legend>
            <div className="flex flex-wrap gap-2">
              {BATTLE_DURATION_PRESETS.map((h) => (
                <Button key={h} type="button" size="sm" variant={hours === h ? 'default' : 'outline'} className="min-h-11 sm:min-h-9" aria-pressed={hours === h} onClick={() => setHours(h)}>
                  {h < 24 ? `${h} saat` : h === 168 ? '7 gün' : `${h / 24} gün`}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">Başlangıç</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { v: 'invite', t: 'Davet gönder', d: 'İkinci klanın lideri kabul edince başlar; süre kabulden itibaren işler. Yanıtlanmazsa süre sonunda düşer.' },
                  { v: 'start_now', t: 'Hemen başlat', d: 'Kabul beklenmez; iki klanın kadrosu şimdi donar ve tüm üyeler bilgilendirilir.' },
                ] as const
              ).map((o) => (
                <label
                  key={o.v}
                  className={cn(
                    'flex min-h-11 cursor-pointer gap-3 rounded-control border p-3 text-sm',
                    mode === o.v ? 'border-brand-border bg-brand-subtle' : 'border-subtle hover:bg-surface-muted'
                  )}
                >
                  <input type="radio" name="battle-mode" value={o.v} checked={mode === o.v} onChange={() => setMode(o.v)} className="mt-1 h-4 w-4 accent-brand" />
                  <span>
                    <span className="block font-medium text-fg">{o.t}</span>
                    <span className="text-fg-muted">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {valid ? (
            <p className="rounded-control border border-subtle bg-surface-muted p-3 text-sm text-fg" aria-live="polite">
              <Check className="mr-1 inline h-4 w-4 text-success" aria-hidden />
              {a!.name} vs {b!.name} · {hours} saat · {mode === 'invite' ? 'davetle' : 'hemen'} · ödülsüz
            </p>
          ) : null}

          {err ? <InlineError>{errorText(err)}</InlineError> : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" disabled={!valid || busy} aria-busy={busy}>
              {busy ? 'Oluşturuluyor…' : mode === 'invite' ? 'Daveti gönder' : 'Savaşı başlat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

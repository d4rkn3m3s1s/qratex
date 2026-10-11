'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, Printer, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import {
  BLOCK_REASONS,
  BLOCK_REASON_CODES,
  generateBodySchema,
  type BlockReasonCode,
  type GenerateResult,
} from '@/lib/admin-cards/contract';
import { CardsApiError, cardsKeys, errorText, exportHref, fetchCustomers, generateCards, printHref } from './api';
import { fmtNumber } from './format';

function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function serverFieldError(err: unknown, path: string): string | undefined {
  if (!(err instanceof CardsApiError) || !Array.isArray(err.details)) return undefined;
  const hit = (err.details as Array<{ path?: unknown; message?: unknown }>).find((d) => d.path === path);
  return typeof hit?.message === 'string' ? hit.message : undefined;
}

// ───────────────────────────── Parti üret ─────────────────────────────

export function GenerateDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('100');
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setQty('100');
      setPrefix('');
      setErr(null);
      setResult(null);
    }
  }, [open]);

  const parsed = generateBodySchema.safeParse({ batchName: name, quantity: Number(qty), prefix: prefix || undefined });
  const localErr = (path: string) => (!parsed.success && (path === 'batchName' ? name : path === 'quantity' ? qty : prefix) !== '' ? parsed.error.issues.find((i) => i.path[0] === path)?.message : undefined);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        {result ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
                {fmtNumber(result.created)} kart üretildi
              </DialogTitle>
              <DialogDescription>
                “{result.batch.name}” partisi hazır. Matbaaya gönderilecek listeyi ya da yazdırılabilir QR sayfasını şimdi alabilirsiniz; her dışa aktarım denetim kaydına yazılır.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild className="min-h-11">
                <a href={exportHref(`batch=${encodeURIComponent(result.batch.id)}`)} download>
                  <Download className="h-4 w-4" aria-hidden />
                  CSV indir
                </a>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <a href={printHref(result.batch.id)} target="_blank" rel="noopener">
                  <Printer className="h-4 w-4" aria-hidden />
                  Baskı sayfası
                </a>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
                Kapat
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!parsed.success || busy) return;
              setBusy(true);
              setErr(null);
              try {
                const r = await generateCards(parsed.data);
                setResult(r);
                onDone();
              } catch (x) {
                setErr(x);
              } finally {
                setBusy(false);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Yeni üretim partisi</DialogTitle>
              <DialogDescription>Kartlar “Kullanılmamış” durumunda oluşur; müşteri kartı tarayıp aktive ettiğinde ya da siz atadığınızda aktifleşir.</DialogDescription>
            </DialogHeader>
            <Field id={`${id}-name`} label="Parti adı" hint="Örn. “Ekim 2026 · Kadıköy dağıtımı”" error={serverFieldError(err, 'batchName') ?? localErr('batchName')}>
              <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoComplete="off" className="min-h-11" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${id}-qty`} label="Adet" hint="1 – 10.000" error={serverFieldError(err, 'quantity') ?? localErr('quantity')}>
                <Input id={`${id}-qty`} type="number" inputMode="numeric" min={1} max={10000} value={qty} onChange={(e) => setQty(e.target.value)} required className="min-h-11" />
              </Field>
              <Field id={`${id}-prefix`} label="Token öneki (isteğe bağlı)" hint="En çok 10 harf/rakam" error={serverFieldError(err, 'prefix') ?? localErr('prefix')}>
                <Input id={`${id}-prefix`} value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={10} autoComplete="off" className="min-h-11 font-mono" />
              </Field>
            </div>
            {busy ? (
              <div role="status" aria-live="polite" className="space-y-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full w-full animate-pulse rounded-full bg-brand motion-reduce:animate-none motion-reduce:opacity-60" />
                </div>
                <p className="text-xs text-fg-muted">{fmtNumber(Number(qty) || 0)} kart üretiliyor… Büyük partiler birkaç saniye sürebilir.</p>
              </div>
            ) : null}
            {err && !serverFieldError(err, 'batchName') && !serverFieldError(err, 'quantity') ? <InlineError>{errorText(err)}</InlineError> : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onOpenChange(false)}>
                Vazgeç
              </Button>
              <Button type="submit" className="min-h-11" disabled={!parsed.success || busy} aria-busy={busy}>
                {busy ? 'Üretiliyor…' : `${parsed.success ? fmtNumber(parsed.data.quantity) : ''} kart üret`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Blokla ─────────────────────────────

export function BlockDialog({
  open,
  onOpenChange,
  title,
  description,
  canNotify,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Etkilenen kartlardan en az biri müşteriye bağlı mı? */
  canNotify: boolean;
  onConfirm: (v: { reasonCode: BlockReasonCode; note?: string; notify: boolean }) => Promise<unknown>;
}) {
  const id = useId();
  const [code, setCode] = useState<BlockReasonCode | ''>('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCode('');
      setNote('');
      setNotify(true);
      setError(null);
    }
  }, [open]);
  const valid = !!code && (code !== 'OTHER' || note.trim().length >= 3);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || !code || busy) return;
            setBusy(true);
            setError(null);
            try {
              await onConfirm({ reasonCode: code, note: note.trim() || undefined, notify: canNotify && notify });
              onOpenChange(false);
            } catch (x) {
              setError(errorText(x));
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description ?? 'Bloklu kart bayilerde okutulamaz ve aktive edilemez. Blok daha sonra kaldırılabilir.'}</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-reason`} label="Gerekçe">
            <Select value={code} onValueChange={(v) => setCode(v as BlockReasonCode)}>
              <SelectTrigger id={`${id}-reason`} className="min-h-11" aria-required>
                <SelectValue placeholder="Gerekçe seçin" />
              </SelectTrigger>
              <SelectContent>
                {BLOCK_REASON_CODES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {BLOCK_REASONS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id={`${id}-note`} label={code === 'OTHER' ? 'Açıklama' : 'Not (isteğe bağlı)'} hint="Destek ekibi kart detayında görür; denetim kaydına yazılır.">
            <Textarea id={`${id}-note`} rows={3} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-describedby={`${id}-note-hint`} />
          </Field>
          {canNotify ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-subtle px-3">
              <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
              <span className="text-sm">Kart sahibine bildirim gönder</span>
            </label>
          ) : null}
          {error ? <InlineError>{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" variant="destructive" className="min-h-11" disabled={!valid || busy} aria-busy={busy}>
              {busy ? 'Bloklanıyor…' : 'Blokla'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Müşteriye ata ─────────────────────────────

export function AssignDialog({
  open,
  onOpenChange,
  token,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  token: string;
  onConfirm: (customerId: string) => Promise<unknown>;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setDebounced('');
      setPicked(null);
      setError(null);
    }
  }, [open]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Yalnız diyalog açıkken; hafif uç (id/ad/e-posta + aktif kart sayısı).
  const customers = useQuery({
    queryKey: cardsKeys.customers(debounced),
    queryFn: ({ signal }) => fetchCustomers(debounced, signal),
    enabled: open,
    staleTime: 30_000,
  });
  const items = customers.data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!picked || busy) return;
            setBusy(true);
            setError(null);
            try {
              await onConfirm(picked);
              onOpenChange(false);
            } catch (x) {
              setError(errorText(x));
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Kartı müşteriye ata</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{token}</span> kartı seçtiğiniz müşteriye bağlanır ve aktifleşir; müşteriye bildirim gider.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-q`}>Müşteri ara</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
              <Input
                id={`${id}-q`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ad, e-posta ya da kimlik"
                className="min-h-11 pl-9"
                autoComplete="off"
                role="combobox"
                aria-expanded
                aria-controls={`${id}-list`}
              />
            </div>
          </div>
          <div id={`${id}-list`} role="listbox" aria-label="Müşteriler" aria-busy={customers.isFetching} className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-subtle p-1">
            {customers.isError ? (
              <InlineError>{errorText(customers.error, 'Müşteriler yüklenemedi.')}</InlineError>
            ) : customers.isLoading ? (
              <p className="p-3 text-sm text-fg-muted">Aranıyor…</p>
            ) : items.length === 0 ? (
              <p className="p-3 text-sm text-fg-muted">{debounced ? 'Eşleşen müşteri yok.' : 'Müşteri bulunamadı.'}</p>
            ) : (
              items.map((c) => {
                const selected = picked === c.id;
                const disabled = c.activeCards > 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={disabled}
                    disabled={disabled}
                    onClick={() => setPicked(c.id)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      selected ? 'bg-brand-subtle text-brand-text' : 'hover:bg-surface-2',
                      disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent'
                    )}
                  >
                    <UserRound className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name?.trim() || c.email}</span>
                      <span className="block truncate text-xs text-fg-muted">{c.email}</span>
                    </span>
                    {disabled ? <span className="shrink-0 text-xs text-fg-muted">Aktif kartı var</span> : null}
                  </button>
                );
              })
            )}
          </div>
          {error ? <InlineError>{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" disabled={!picked || busy} aria-busy={busy}>
              {busy ? 'Atanıyor…' : 'Ata'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useMemo, useRef, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { CheckCircle2, Loader2, Send, Square, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { matchesConfirmPhrase } from '@/components/states';
import { DURATION, useMotionPolicy } from '@/lib/motion';
import { sendLabelFor, splitRecipients, type SendResultRow, type TemplateInput, type TemplateStatView } from '@/lib/mail-center/templates-contract';
import { errorText, sendTemplateApi } from '../api';

/** Alıcıları üç gruba ayırır: yeni / daha önce başarıyla almış / son denemesi hatalı. */
export function groupRecipients(tpl: TemplateInput, stat: TemplateStatView | undefined) {
  const list = splitRecipients(tpl.email);
  const byEmail = new Map((stat?.recipients ?? []).map((r) => [r.email.toLowerCase(), r]));
  const fresh: string[] = [];
  const already: string[] = [];
  const errored: string[] = [];
  for (const e of list) {
    const r = byEmail.get(e);
    if (!r) fresh.push(e);
    else if (r.status === 'error') errored.push(e);
    else already.push(e);
  }
  return { list, fresh, already, errored };
}

/**
 * Bir şablonu gönderir; süre bütçesi aşılırsa kalan alıcılar için (yalnız onlar) devam eder.
 * Her istek kendi Idempotency-Key'i ile — ağ tekrarında çift gönderim olmaz.
 */
async function runTemplateSend(
  tpl: TemplateInput,
  onlyNew: boolean,
  shouldStop: () => boolean,
  onRows: (rows: SendResultRow[]) => void
): Promise<{ sent: number; failed: number; skipped: number; stopped: boolean }> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let only: string[] | undefined;
  let first = true;
  for (let guard = 0; guard < 10; guard++) {
    if (shouldStop()) return { sent, failed, skipped, stopped: true };
    const r = await sendTemplateApi(tpl.id, first ? onlyNew : false, crypto.randomUUID(), only);
    first = false;
    sent += r.sent;
    failed += r.failed;
    skipped += r.skipped;
    onRows(r.results);
    if (r.remaining <= 0) break;
    const done = new Set(r.results.map((x) => x.to));
    only = (only ?? splitRecipients(tpl.email)).filter((e) => !done.has(e));
    if (only.length === 0) break;
  }
  return { sent, failed, skipped, stopped: false };
}

function Progress({ value, total }: { value: number; total: number }) {
  const policy = useMotionPolicy();
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label="Gönderim ilerlemesi" className="h-2 overflow-hidden rounded-full bg-surface-3">
      <Motion.div className="h-full bg-brand" initial={false} animate={{ width: `${pct}%` }} transition={policy.transition({ duration: DURATION.base })} />
    </div>
  );
}

export function SingleSendDialog({
  open,
  onOpenChange,
  tpl,
  stat,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tpl: TemplateInput;
  stat: TemplateStatView | undefined;
  onDone: (summary: string, ok: boolean) => void;
}) {
  const g = useMemo(() => groupRecipients(tpl, stat), [tpl, stat]);
  const [onlyNew, setOnlyNew] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<SendResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const target = onlyNew ? g.fresh.length + g.errored.length : g.list.length;

  const go = async () => {
    setBusy(true);
    setError(null);
    setRows([]);
    try {
      const r = await runTemplateSend(tpl, onlyNew, () => false, (x) => setRows((p) => [...p, ...x]));
      onDone(`${r.sent} alıcıya gönderildi${r.skipped ? `, ${r.skipped} daha önce almıştı` : ''}${r.failed ? `, ${r.failed} hata` : ''}.`, r.failed === 0);
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{sendLabelFor(tpl.kind)}: gerçek gönderim</DialogTitle>
          <DialogDescription>
            &quot;{tpl.subject}&quot; · {tpl.department}. Her alıcıya ayrı, açılma takipli mail gider.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-control bg-surface-2 p-2">
            <dt className="text-xs text-fg-muted">Yeni</dt>
            <dd className="text-lg font-semibold tabular-nums">{g.fresh.length}</dd>
          </div>
          <div className="rounded-control bg-surface-2 p-2">
            <dt className="text-xs text-fg-muted">Daha önce almış</dt>
            <dd className="text-lg font-semibold tabular-nums">{g.already.length}</dd>
          </div>
          <div className="rounded-control bg-surface-2 p-2">
            <dt className="text-xs text-fg-muted">Son denemesi hatalı</dt>
            <dd className="text-lg font-semibold tabular-nums">{g.errored.length}</dd>
          </div>
        </dl>
        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
          {g.list.map((e) => {
            const row = rows.find((r) => r.to === e);
            return (
              <li key={e} className="flex items-center gap-2">
                {row ? (
                  row.ok ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <XCircle className="h-4 w-4 text-danger" aria-hidden />
                ) : (
                  <span className="h-4 w-4" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{e}</span>
                <span className="text-xs text-fg-muted">
                  {row ? (row.skipped ? 'atlandı' : row.ok ? 'gönderildi' : 'hata') : g.already.includes(e) ? 'almış' : g.errored.includes(e) ? 'hatalı' : 'yeni'}
                </span>
              </li>
            );
          })}
        </ul>
        {g.already.length > 0 && (
          <div className="flex min-h-11 items-center gap-2">
            <Checkbox id="only-new" checked={onlyNew} onCheckedChange={(v) => setOnlyNew(v === true)} disabled={busy} />
            <Label htmlFor="only-new" className="font-normal">
              Daha önce almış {g.already.length} kişiye tekrar gönderme
            </Label>
          </div>
        )}
        {busy && <Progress value={rows.length} total={g.list.length} />}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error} Tekrar denerseniz daha önce gidenler atlanır.
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
            Vazgeç
          </Button>
          <Button className="min-h-11" onClick={() => void go()} disabled={busy || target === 0} aria-busy={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
            {target === 0 ? 'Gönderilecek yeni alıcı yok' : `${target} alıcıya gönder`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BULK_PHRASE = 'GÖNDER';

export function BulkSendDialog({
  open,
  onOpenChange,
  templates,
  stats,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: TemplateInput[];
  stats: Record<string, TemplateStatView>;
  onDone: (summary: string, ok: boolean) => void;
}) {
  const plan = useMemo(
    () =>
      templates
        .map((t) => ({ tpl: t, g: groupRecipients(t, stats[t.id]) }))
        .filter((p) => p.g.list.length > 0),
    [templates, stats]
  );
  const [onlyNew, setOnlyNew] = useState(true);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, sent: 0, failed: 0, skipped: 0, current: '' });
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const targetPlan = onlyNew ? plan.filter((p) => p.g.fresh.length + p.g.errored.length > 0) : plan;
  const recipientTotal = targetPlan.reduce((n, p) => n + (onlyNew ? p.g.fresh.length + p.g.errored.length : p.g.list.length), 0);
  // Tahmini süre: alıcı başına ~0,8 sn bekleme + ~1,2 sn gönderim.
  const etaMin = Math.max(1, Math.ceil((recipientTotal * 2) / 60));

  const go = async () => {
    stopRef.current = false;
    setBusy(true);
    setError(null);
    const acc = { done: 0, sent: 0, failed: 0, skipped: 0, current: '' };
    try {
      for (const p of targetPlan) {
        if (stopRef.current) break;
        acc.current = p.tpl.subject;
        setProgress({ ...acc });
        const r = await runTemplateSend(p.tpl, onlyNew, () => stopRef.current, () => {});
        acc.done++;
        acc.sent += r.sent;
        acc.failed += r.failed;
        acc.skipped += r.skipped;
        setProgress({ ...acc });
        if (r.stopped) break;
      }
      const stopped = stopRef.current;
      onDone(
        `${stopped ? 'Durduruldu. ' : ''}${acc.done}/${targetPlan.length} şablon · ${acc.sent} mail gönderildi${acc.skipped ? ` · ${acc.skipped} atlandı` : ''}${acc.failed ? ` · ${acc.failed} hata` : ''}.`,
        acc.failed === 0 && !stopped
      );
      onOpenChange(false);
    } catch (e) {
      setError(`${errorText(e)} (${acc.done} şablon tamamlandı; tekrar başlatırsanız gidenler atlanır.)`);
    } finally {
      setBusy(false);
      setPhrase('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Toplu gönderim</DialogTitle>
          <DialogDescription>
            {targetPlan.length} şablon · {recipientTotal} alıcı · tahmini {etaMin} dk. Gönderim sırayla yapılır; sayfayı kapatmayın.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {plan.map((p) => (
            <li key={p.tpl.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{p.tpl.subject}</span>
              <span className="text-xs tabular-nums text-fg-muted">
                {p.g.fresh.length} yeni · {p.g.already.length} almış{p.g.errored.length ? ` · ${p.g.errored.length} hatalı` : ''}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex min-h-11 items-center gap-2">
          <Checkbox id="bulk-only-new" checked={onlyNew} onCheckedChange={(v) => setOnlyNew(v === true)} disabled={busy} />
          <Label htmlFor="bulk-only-new" className="font-normal">
            Yalnız yeni ve hatalı alıcılara gönder (önerilir)
          </Label>
        </div>
        {busy ? (
          <div className="space-y-2" aria-live="polite">
            <Progress value={progress.done} total={targetPlan.length} />
            <p className="text-sm text-fg-muted">
              {progress.done}/{targetPlan.length} şablon · {progress.sent} gönderildi{progress.failed ? ` · ${progress.failed} hata` : ''}
              {progress.current ? ` · şu an: ${progress.current}` : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="bulk-phrase">
              Onaylamak için <strong>{BULK_PHRASE}</strong> yazın
            </Label>
            <Input id="bulk-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" className="min-h-11" />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          {busy ? (
            <Button variant="outline" className="min-h-11" onClick={() => (stopRef.current = true)}>
              <Square className="mr-2 h-4 w-4" aria-hidden />
              Durdur
            </Button>
          ) : (
            <Button variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
          )}
          <Button
            className="min-h-11"
            onClick={() => void go()}
            disabled={busy || recipientTotal === 0 || !matchesConfirmPhrase(phrase, BULK_PHRASE)}
            aria-busy={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
            {recipientTotal === 0 ? 'Gönderilecek alıcı yok' : `${recipientTotal} alıcıya gönder`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

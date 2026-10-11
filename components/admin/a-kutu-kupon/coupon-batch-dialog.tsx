'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { TYPE_LABEL, couponBatchSchema, csvCell, formatCouponValue, normalizeCode, type CouponType } from '@/lib/admin-coupons/contract';
import { createBatch, errorText, fieldErrors } from './api';
import { downloadText, fmtNumber, wallToIso } from './format';
import { AdminKutuKuponText } from './copy';

/** Tek kullanımlık N kod üretir (kişiye özel dağıtım için) ve CSV olarak indirir. */
export function CouponBatchDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const ids = useId();
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState('50');
  const [type, setType] = useState<CouponType>('percentage');
  const [value, setValue] = useState('');
  const [expires, setExpires] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);

  const reset = () => {
    setPrefix('');
    setCount('50');
    setType('percentage');
    setValue('');
    setExpires('');
    setErrors({});
    setResult(null);
  };

  const download = (codes: string[]) => {
    const v = Number(value.replace(',', '.'));
    const lines = ['Kod;Değer;Son kullanım', ...codes.map((c) => [c, formatCouponValue(type, v), expires || 'Süresiz'].map(csvCell).join(';'))];
    downloadText(`kupon-kodlari-${prefix || 'toplu'}.csv`, '﻿' + lines.join('\r\n'));
  };

  const submit = async () => {
    const expiresAt = expires ? wallToIso(expires) : null;
    const parsed = couponBatchSchema.safeParse({ prefix, count: Number(count), type, value: Number(value.replace(',', '.')), expiresAt });
    const e: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) if (!e[String(i.path[0])]) e[String(i.path[0])] = i.message;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) e.expiresAt = 'Gelecekte bir tarih seçin.';
    setErrors(e);
    if (Object.keys(e).length || !parsed.success) return;
    setBusy(true);
    try {
      const r = await createBatch(parsed.data);
      setResult(r.codes);
      toast.success(`${fmtNumber(r.codes.length)} tek kullanımlık kod üretildi.`);
      onDone();
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle><AdminKutuKuponText k="bulkCodes" /></DialogTitle>
          <DialogDescription><AdminKutuKuponText k="bulkHint" /></DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <p className="qx-small text-fg">{fmtNumber(result.length)} kod hazır. İlk birkaçı:</p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
              {result.slice(0, 6).map((c) => (
                <li key={c} className="truncate rounded-control bg-surface-2 px-2 py-1">
                  {c}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button className="min-h-11 sm:min-h-10" onClick={() => download(result)}>
                <Download className="h-4 w-4" aria-hidden />
                CSV indir
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-prefix`}><AdminKutuKuponText k="prefix" /></Label>
                <Input id={`${ids}-prefix`} value={prefix} maxLength={12} className="font-mono uppercase" onChange={(e) => setPrefix(normalizeCode(e.target.value).replace(/[^A-Z0-9]/g, ''))} placeholder="YAZ" aria-invalid={!!errors.prefix || undefined} />
                <p className={`qx-caption ${errors.prefix ? 'text-danger' : 'text-fg-muted'}`}>{errors.prefix ?? `Örnek: ${prefix || 'YAZ'}-K7M2QX`}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-count`}>Adet</Label>
                <Input id={`${ids}-count`} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ''))} aria-invalid={!!errors.count || undefined} />
                <p className={`qx-caption ${errors.count ? 'text-danger' : 'text-fg-muted'}`}>{errors.count ?? '1–500'}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="qx-small font-medium text-fg" id={`${ids}-type`}>
                Tür
              </p>
              <ChoiceChips
                aria-labelledby={`${ids}-type`}
                value={type}
                onChange={(v) => v && setType(v as CouponType)}
                options={[
                  { value: 'percentage', label: TYPE_LABEL.percentage },
                  { value: 'fixed', label: TYPE_LABEL.fixed },
                ]}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-value`}>{type === 'percentage' ? 'İndirim (%)' : 'İndirim (₺)'}</Label>
                <Input id={`${ids}-value`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))} aria-invalid={!!errors.value || undefined} />
                {errors.value ? <p className="qx-caption text-danger">{errors.value}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-exp`}><AdminKutuKuponText k="expiry" /></Label>
                <Input id={`${ids}-exp`} type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} aria-invalid={!!errors.expiresAt || undefined} />
                <p className={`qx-caption ${errors.expiresAt ? 'text-danger' : 'text-fg-muted'}`}>{errors.expiresAt ?? 'Boş = süresiz'}</p>
              </div>
            </div>
            {errors.form ? (
              <p role="alert" className="qx-small text-danger">
                {errors.form}
              </p>
            ) : null}
            <DialogFooter>
              <Button className="min-h-11 sm:min-h-10" onClick={submit} disabled={busy} aria-busy={busy || undefined}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                Kodları üret
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

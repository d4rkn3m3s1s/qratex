'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Lock, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChoiceChips } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import { TYPE_LABEL, couponCreateSchema, formatCouponValue, normalizeCode, type CouponDetail, type CouponType } from '@/lib/admin-coupons/contract';
import { KutuKuponApiError, couponKeys, createCoupon, errorText, fetchCoupon, fieldErrors, updateCoupon } from './api';
import { fmtNumber, isoToWall, wallToIso } from './format';

export type CouponEditorTarget = { mode: 'create' } | { mode: 'edit'; id: string };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function suggestCode(): string {
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  return `QRX-${Array.from(buf, (n) => ALPHABET[n % ALPHABET.length]).join('')}`;
}

type Values = { code: string; type: CouponType; value: string; maxUses: string; expiresAt: string };
const EMPTY: Values = { code: '', type: 'percentage', value: '', maxUses: '', expiresAt: '' };

function Fields({
  values,
  setValues,
  errors,
  locked,
  usedCount,
}: {
  values: Values;
  setValues: (fn: (v: Values) => Values) => void;
  errors: Record<string, string>;
  locked: boolean;
  usedCount: number;
}) {
  const ids = useId();
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((p) => ({ ...p, [k]: v }));
  const err = (k: string) =>
    errors[k] ? (
      <p id={`${ids}-${k}-err`} className="qx-caption text-danger">
        {errors[k]}
      </p>
    ) : null;
  return (
    <div className="space-y-4">
      {locked ? (
        <p className="qx-small flex gap-2 rounded-card border border-subtle bg-surface-2 px-3 py-2 text-fg-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Kupon {fmtNumber(usedCount)} kez kullanıldı; geçmişi bozmamak için kod, tür ve değer kilitli. Limit ve son kullanım tarihini değiştirebilirsiniz.
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-code`}>Kod</Label>
        <div className="flex gap-2">
          <Input
            id={`${ids}-code`}
            value={values.code}
            disabled={locked}
            maxLength={40}
            onChange={(e) => set('code', normalizeCode(e.target.value))}
            className="font-mono uppercase tracking-wider"
            autoComplete="off"
            aria-invalid={!!errors.code || undefined}
            aria-describedby={errors.code ? `${ids}-code-err` : `${ids}-code-hint`}
          />
          {!locked ? (
            <Button type="button" variant="outline" className="min-h-11 shrink-0 sm:min-h-10" onClick={() => set('code', suggestCode())}>
              <Wand2 className="h-4 w-4" aria-hidden />
              Üret
            </Button>
          ) : null}
        </div>
        {err('code') ?? (
          <p id={`${ids}-code-hint`} className="qx-caption text-fg-muted">
            3–40 karakter: A–Z, rakam, - ve _. Büyük harfe çevrilir.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <p className="qx-small font-medium text-fg" id={`${ids}-type`}>
          Tür
        </p>
        <ChoiceChips
          aria-labelledby={`${ids}-type`}
          value={values.type}
          disabled={locked}
          onChange={(v) => v && set('type', v as CouponType)}
          options={[
            { value: 'percentage', label: TYPE_LABEL.percentage },
            { value: 'fixed', label: TYPE_LABEL.fixed },
          ]}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-value`}>{values.type === 'percentage' ? 'İndirim (%)' : 'İndirim (₺)'}</Label>
          <Input
            id={`${ids}-value`}
            inputMode="decimal"
            value={values.value}
            disabled={locked}
            onChange={(e) => set('value', e.target.value.replace(/[^\d.,]/g, ''))}
            aria-invalid={!!errors.value || undefined}
            aria-describedby={errors.value ? `${ids}-value-err` : undefined}
          />
          {err('value')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-max`}>Toplam kullanım limiti</Label>
          <Input
            id={`${ids}-max`}
            inputMode="numeric"
            value={values.maxUses}
            placeholder="Boş = sınırsız"
            onChange={(e) => set('maxUses', e.target.value.replace(/[^\d]/g, ''))}
            aria-invalid={!!errors.maxUses || undefined}
            aria-describedby={errors.maxUses ? `${ids}-maxUses-err` : `${ids}-max-hint`}
          />
          {err('maxUses') ?? (
            <p id={`${ids}-max-hint`} className="qx-caption text-fg-muted">
              Her müşteri kodu bir kez kullanabilir.
            </p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-exp`}>Son kullanım (İstanbul saati)</Label>
        <div className="flex gap-2">
          <Input
            id={`${ids}-exp`}
            type="datetime-local"
            value={values.expiresAt}
            onChange={(e) => set('expiresAt', e.target.value)}
            aria-invalid={!!errors.expiresAt || undefined}
            aria-describedby={errors.expiresAt ? `${ids}-expiresAt-err` : undefined}
          />
          {values.expiresAt ? (
            <Button type="button" variant="ghost" className="min-h-11 shrink-0 sm:min-h-10" onClick={() => set('expiresAt', '')}>
              Süresiz yap
            </Button>
          ) : null}
        </div>
        {err('expiresAt') ?? <p className="qx-caption text-fg-muted">Boş bırakılırsa süresiz.</p>}
      </div>
    </div>
  );
}

function parseNum(v: string): number {
  return Number(v.replace(',', '.'));
}

export function CouponEditor({
  target,
  onOpenChange,
  onSaved,
}: {
  target: CouponEditorTarget | null;
  onOpenChange: (o: boolean) => void;
  onSaved: (id: string, mode: 'create' | 'edit') => void;
}) {
  const open = !!target;
  const editId = target?.mode === 'edit' ? target.id : null;
  const detail = useQuery({ queryKey: couponKeys.detail(editId ?? ''), queryFn: () => fetchCoupon(editId!), enabled: !!editId, staleTime: 0 });
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setErrors({});
    setFormError(null);
    if (target?.mode === 'create') setValues({ ...EMPTY, code: '' });
  }, [target]);

  useEffect(() => {
    if (editId && detail.data) {
      const c = detail.data.coupon;
      setValues({ code: c.code, type: c.type, value: String(c.value).replace('.', ','), maxUses: c.maxUses == null ? '' : String(c.maxUses), expiresAt: isoToWall(c.expiresAt) });
    }
  }, [editId, detail.data]);

  const save = async () => {
    setFormError(null);
    const expiresAt = values.expiresAt ? wallToIso(values.expiresAt) : null;
    const draft = {
      code: values.code,
      type: values.type,
      value: parseNum(values.value),
      maxUses: values.maxUses ? Number(values.maxUses) : null,
      expiresAt,
    };
    const parsed = couponCreateSchema.safeParse(draft);
    const e: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) if (!e[String(i.path[0])]) e[String(i.path[0])] = i.message;
    if (values.expiresAt && !expiresAt) e.expiresAt = 'Geçerli bir tarih seçin.';
    const original = detail.data?.coupon;
    const expChanged = (expiresAt ?? null) !== (original?.expiresAt ? new Date(original.expiresAt).toISOString() : null);
    if (expiresAt && (!editId || expChanged) && new Date(expiresAt).getTime() <= Date.now()) e.expiresAt = 'Son kullanım tarihi gelecekte olmalı.';
    if (editId && original && draft.maxUses !== null && draft.maxUses < original.usedCount) e.maxUses = `Mevcut kullanımın (${fmtNumber(original.usedCount)}) altına inemez.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      if (editId && original) {
        const locked = detail.data!.locked;
        const res = await updateCoupon(editId, {
          baseVersion: original.updatedAt,
          ...(locked ? {} : { code: parsed.data!.code, type: draft.type, value: draft.value }),
          maxUses: draft.maxUses,
          expiresAt,
        });
        toast.success(`${res.code} güncellendi.`);
        onSaved(res.id, 'edit');
      } else {
        const res = await createCoupon(parsed.data!);
        toast.success(`${res.code} oluşturuldu.`);
        onSaved(res.id, 'create');
      }
      onOpenChange(false);
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setFormError(errorText(err));
      if (err instanceof KutuKuponApiError && err.status === 409 && editId) void detail.refetch();
    } finally {
      setSaving(false);
    }
  };

  const valueNum = parseNum(values.value);
  return (
    <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-subtle px-5 py-4 text-left">
          <SheetTitle>{editId ? 'Kuponu düzenle' : 'Yeni kupon'}</SheetTitle>
          <SheetDescription>Kupon, sürpriz kutuyla dağıtılan ve kasada gösterilen kampanya kodudur. Ödeme akışı olmadığı için indirimi işletme uygular.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 px-5 py-5">
          {editId ? (
            <QueryState query={detail} skeleton="form">
              {(d: CouponDetail) => <Fields values={values} setValues={setValues} errors={errors} locked={d.locked} usedCount={d.coupon.usedCount} />}
            </QueryState>
          ) : (
            <Fields values={values} setValues={setValues} errors={errors} locked={false} usedCount={0} />
          )}
          {values.code && Number.isFinite(valueNum) && valueNum > 0 ? (
            <div className="rounded-card border border-dashed border-strong bg-surface-2 p-4 text-center" aria-label="Müşteri görünümü önizlemesi">
              <p className="qx-caption text-fg-muted">Müşteri kutuyu açınca</p>
              <p className="mt-1 font-mono text-lg font-semibold tracking-wider text-fg">{values.code}</p>
              <p className="qx-small text-fg-muted">{formatCouponValue(values.type, valueNum)} indirim</p>
            </div>
          ) : null}
          {formError ? (
            <p role="alert" className="qx-small rounded-card border border-danger-border bg-danger-subtle px-3 py-2 text-fg">
              {formError}
            </p>
          ) : null}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-subtle bg-surface-1 px-5 py-3">
          <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button className="min-h-11 sm:min-h-10" onClick={save} disabled={saving || (!!editId && !detail.data)} aria-busy={saving || undefined}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {editId ? 'Kaydet' : 'Oluştur'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

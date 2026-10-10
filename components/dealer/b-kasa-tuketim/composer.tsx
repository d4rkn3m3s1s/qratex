'use client';

/**
 * İşlem oluşturucu: hızlı tuşlar (tek dokunuşla kayıt) + aranabilir ürün + tutar + not + fiş OCR.
 * Her kart için yeni örnek (`key`) → önceki müşterinin formu taşınmaz. İşlem kimliği
 * (`clientOpId`) form açılışında üretilir; aynı form tekrar gönderilirse sunucu tek kayıt yazar.
 */
import { useId, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Search, Settings2, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NOTE_MAX, parseAmountInput } from '@/lib/dealer/kasa/core';
import type { KasaProduct, KasaQuickKey } from '@/lib/dealer/kasa/types';
import { KasaApiError, formatMoney, kasaFetch, newClientOpId, postJson } from './api';
import { ReceiptOcr } from './receipt-ocr';
import { useKasaCopy } from './copy';

export interface ComposerDraft {
  clientOpId: string;
  productId: string | null;
  productName: string | null;
  amount: number | null;
  note: string | null;
}

export function Composer({
  customerLabel,
  products,
  quickKeys,
  canManageKeys,
  onQuickKeysChange,
  onSubmit,
  submitting,
  submitError,
}: {
  customerLabel: string;
  products: KasaProduct[];
  quickKeys: KasaQuickKey[];
  canManageKeys: boolean;
  onQuickKeysChange: (keys: KasaQuickKey[]) => void;
  onSubmit: (draft: ComposerDraft) => void;
  submitting: boolean;
  submitError: string | null;
}) {
  const { copy } = useKasaCopy();
  const c = copy.kasa.composer;
  const ids = { search: useId(), amount: useId(), note: useId(), list: useId(), keyName: useId() };
  const [clientOpId] = useState(newClientOpId);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [amountRaw, setAmountRaw] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [note, setNote] = useState('');
  const [editKeys, setEditKeys] = useState(false);
  const [keyName, setKeyName] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const product = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    const list = q
      ? products.filter((p) => p.name.toLocaleLowerCase('tr-TR').includes(q) || (p.categoryName ?? '').toLocaleLowerCase('tr-TR').includes(q))
      : products;
    return list.slice(0, 30);
  }, [products, search]);

  const amount = parseAmountInput(amountRaw);
  const amountInvalid = amount !== null && Number.isNaN(amount);

  const pickProduct = (p: KasaProduct | null) => {
    setProductId(p?.id ?? null);
    // Tutar elle değiştirilmediyse ürün fiyatı gelir; ürün kaldırılınca fiyattan gelen tutar da gider.
    if (!amountTouched) setAmountRaw(p?.price != null ? String(p.price).replace('.', ',') : '');
    if (p) amountRef.current?.focus();
  };

  const submit = () => {
    if (submitting || amountInvalid) return;
    onSubmit({
      clientOpId,
      productId,
      productName: product?.name ?? null,
      amount: amount ?? null,
      note: note.trim() ? note.trim() : null,
    });
  };

  const fireKey = (k: KasaQuickKey) => {
    if (submitting) return;
    onSubmit({ clientOpId, productId: k.productId, productName: k.productName ?? k.name, amount: k.amount, note: k.note });
  };

  const saveKey = async () => {
    const name = (keyName ?? '').trim();
    if (!name || keyBusy) return;
    setKeyBusy(true);
    try {
      const res = await postJson<{ preset: KasaQuickKey }>('/api/dealer/quick-presets', {
        name,
        productId,
        amount: amount != null && !Number.isNaN(amount) ? amount : null,
        note: note.trim() || null,
      });
      onQuickKeysChange([...quickKeys, res.preset]);
      setKeyName(null);
      toast.success(c.quickKeySaved);
    } catch (e) {
      toast.error(e instanceof KasaApiError && e.status ? e.message : copy.common.networkError);
    } finally {
      setKeyBusy(false);
    }
  };

  const removeKey = async (k: KasaQuickKey) => {
    try {
      await kasaFetch(`/api/dealer/quick-presets?id=${encodeURIComponent(k.id)}`, { method: 'DELETE' });
      onQuickKeysChange(quickKeys.filter((x) => x.id !== k.id));
      toast.success(c.quickKeyRemoved);
    } catch (e) {
      toast.error(e instanceof KasaApiError && e.status ? e.message : copy.common.networkError);
    }
  };

  return (
    <div className="space-y-5">
      {/* Hızlı tuşlar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="qx-overline text-fg-muted">{c.quickKeys}</h3>
          {canManageKeys && quickKeys.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 gap-1.5 text-fg-muted"
              aria-pressed={editKeys}
              onClick={() => setEditKeys((v) => !v)}
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              {editKeys ? copy.common.close : copy.common.edit}
            </Button>
          )}
        </div>
        {quickKeys.length === 0 ? (
          <p className="text-sm text-fg-muted">{canManageKeys ? c.quickKeysEmpty : '—'}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {quickKeys.map((k) => (
              <li key={k.id} className="relative">
                <button
                  type="button"
                  onClick={() => (editKeys ? undefined : fireKey(k))}
                  disabled={submitting || editKeys}
                  className={cn(
                    'flex min-h-14 w-full flex-col items-start justify-center rounded-xl border border-border bg-surface px-3 py-2 text-left transition-colors',
                    'hover:border-brand-border hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Zap className="h-3.5 w-3.5 text-brand" aria-hidden />
                    {k.name}
                  </span>
                  <span className="qx-num text-xs text-fg-muted">
                    {k.amount != null ? formatMoney(k.amount, copy.locale) : (k.productName ?? copy.common.noProduct)}
                  </span>
                </button>
                {editKeys && (
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -right-2 -top-2 h-11 w-11 rounded-full"
                    aria-label={c.quickKeyRemove(k.name)}
                    onClick={() => void removeKey(k)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ürün */}
      <div className="space-y-2">
        <Label htmlFor={ids.search}>{c.product}</Label>
        {products.length === 0 ? (
          <p className="text-sm text-fg-muted">{c.noProducts}</p>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <Input
                id={ids.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={c.productSearch}
                className="min-h-11 pl-9"
                aria-controls={ids.list}
                autoComplete="off"
              />
            </div>
            <div id={ids.list} role="radiogroup" aria-label={c.product} className="max-h-56 overflow-y-auto rounded-xl border border-border">
              <ProductOption selected={productId === null} onSelect={() => pickProduct(null)} title={c.productNone} />
              {filtered.map((p) => (
                <ProductOption
                  key={p.id}
                  selected={productId === p.id}
                  onSelect={() => pickProduct(p)}
                  title={p.name}
                  subtitle={[p.categoryIcon, p.categoryName].filter(Boolean).join(' ')}
                  trailing={p.price != null ? formatMoney(p.price, copy.locale) : null}
                />
              ))}
              {filtered.length === 0 && <p className="px-3 py-3 text-sm text-fg-muted">{c.noMatch}</p>}
            </div>
          </>
        )}
      </div>

      {/* Tutar */}
      <div className="space-y-1.5">
        <Label htmlFor={ids.amount}>{c.amount}</Label>
        <Input
          id={ids.amount}
          ref={amountRef}
          inputMode="decimal"
          autoComplete="off"
          value={amountRaw}
          onChange={(e) => {
            setAmountRaw(e.target.value);
            setAmountTouched(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="0,00"
          className="min-h-11 qx-num text-lg"
          aria-invalid={amountInvalid}
          aria-describedby={`${ids.amount}-hint`}
        />
        <p id={`${ids.amount}-hint`} className={cn('text-xs', amountInvalid ? 'text-danger' : 'text-fg-muted')}>
          {amountInvalid ? c.amountInvalid : c.amountHint}
        </p>
        <ReceiptOcr
          disabled={submitting}
          onUse={(v) => {
            setAmountRaw(String(v).replace('.', ','));
            setAmountTouched(true);
          }}
        />
      </div>

      {/* Not */}
      <div className="space-y-1.5">
        <Label htmlFor={ids.note}>{c.note}</Label>
        <Textarea
          id={ids.note}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={c.notePlaceholder}
          maxLength={NOTE_MAX}
          rows={2}
        />
      </div>

      {submitError && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger">
          {submitError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={submit} disabled={submitting || amountInvalid} className="min-h-12 flex-1 gap-2 text-base">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {submitting ? c.submitting : c.submit}
        </Button>
        {canManageKeys && (productId || (amount != null && !Number.isNaN(amount))) && keyName === null && (
          <Button type="button" variant="outline" className="min-h-12 gap-2" onClick={() => setKeyName(product?.name ?? '')}>
            <Zap className="h-4 w-4" aria-hidden />
            {c.makeQuickKey}
          </Button>
        )}
      </div>

      {keyName !== null && (
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-muted p-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={ids.keyName}>{c.quickKeyName}</Label>
            <Input
              id={ids.keyName}
              value={keyName}
              maxLength={40}
              onChange={(e) => setKeyName(e.target.value)}
              className="min-h-11"
              autoFocus
            />
          </div>
          <Button type="button" className="min-h-11" disabled={!keyName.trim() || keyBusy} onClick={() => void saveKey()}>
            {keyBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : copy.common.save}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setKeyName(null)}>
            {copy.common.cancel}
          </Button>
        </div>
      )}
      <p className="sr-only">{c.for(customerLabel)}</p>
    </div>
  );
}

function ProductOption({
  selected,
  onSelect,
  title,
  subtitle,
  trailing,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string;
  trailing?: string | null;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected ? 'bg-brand-subtle text-brand' : 'hover:bg-surface-muted'
      )}
    >
      <span
        aria-hidden
        className={cn('h-4 w-4 shrink-0 rounded-full border-2', selected ? 'border-brand bg-brand' : 'border-border-strong')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && <span className="block truncate text-xs text-fg-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="qx-num text-sm text-fg-muted">{trailing}</span>}
    </button>
  );
}

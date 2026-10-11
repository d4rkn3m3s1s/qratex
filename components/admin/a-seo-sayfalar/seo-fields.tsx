'use client';

import { useId, useState, type ReactNode } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ds/form';
import { CHANGE_FREQUENCIES, CHANGE_FREQUENCY_LABEL, SEO_ROUTES } from '@/lib/admin-seo/contract';
import { cn } from '@/lib/utils';
import { rowKey, type DraftOverride, type DraftSitemap } from './seo-draft';

/** Uzunluk göstergesi: ideal aralık yeşil, dışı uyarı (renk + metin). */
export function LengthMeter({ length, min, max }: { length: number; min: number; max: number }) {
  const ok = length >= min && length <= max;
  return (
    <span className={cn('tabular-nums text-xs', ok ? 'text-success' : 'text-warning')}>
      {length} karakter · ideal {min}–{max}
      {ok ? '' : length < min ? ' (kısa)' : ' (uzun)'}
    </span>
  );
}

export function TextRow(props: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  description?: ReactNode;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  meter?: { min: number; max: number };
  type?: 'text' | 'url';
  required?: boolean;
  inputMode?: 'numeric' | 'text' | 'url';
}) {
  return (
    <Field
      id={`seo-${props.name}`}
      label={props.label}
      description={props.description}
      error={props.error}
      required={props.required}
      labelAside={props.meter ? <LengthMeter length={props.value.trim().length} min={props.meter.min} max={props.meter.max} /> : undefined}
    >
      {(c) =>
        props.multiline ? (
          <Textarea {...c} rows={props.rows ?? 3} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
        ) : (
          <Input
            {...c}
            type={props.type ?? 'text'}
            inputMode={props.inputMode}
            className="min-h-11 sm:min-h-10"
            value={props.value}
            placeholder={props.placeholder}
            onChange={(e) => props.onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

/** Anahtar kelime çipleri: Enter/virgül ekler, × siler; çok kelimeli ifade yazılabilir (bulgu 3). */
export function ChipInput({ name, label, value, onChange, error, description }: { name: string; label: string; value: string[]; onChange: (v: string[]) => void; error?: string; description?: ReactNode }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((x) => x.toLocaleLowerCase('tr-TR') === p.toLocaleLowerCase('tr-TR'))) next.push(p);
    onChange(next);
    setText('');
  };
  return (
    <Field id={`seo-${name}`} label={label} description={description} error={error}>
      {(c) => (
        <div className="rounded-control border border-border bg-surface-1 p-2 focus-within:ring-2 focus-within:ring-focus">
          {value.length ? (
            <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={`${label} listesi`}>
              {value.map((k) => (
                <li key={k} className="inline-flex items-center gap-1 rounded-chip bg-surface-3 py-0.5 pl-2.5 pr-1 text-sm text-fg">
                  {k}
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((x) => x !== k))}
                    className="hit-area inline-flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    aria-label={`${k} kaldır`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            {...c}
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              if (v.includes(',')) add(v);
              else setText(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add(text);
              } else if (e.key === 'Backspace' && !text && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            onBlur={() => add(text)}
            placeholder="Yazıp Enter'a basın (ör. QR kod)"
            className="min-h-10 w-full bg-transparent px-1 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
        </div>
      )}
    </Field>
  );
}

/** Satır bazlı yol listesi (robots disallow): her yol ayrı girdi — Enter yeni satır açar (bulgu 3). */
export function PathListEditor({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const base = useId();
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  return (
    <Field id="seo-robotsDisallow" kind="fieldset" label="Engellenen yollar (Disallow)" error={error} description="Arama motorlarının taramayacağı yollar. Liste boşsa varsayılan panel yolları engellenir.">
      <div className="space-y-2">
        {value.map((p, i) => (
          <div key={`${base}-${i}`} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${base}-${i}`}>{`Engellenen yol ${i + 1}`}</label>
            <Input
              id={`${base}-${i}`}
              autoFocus={focusIdx === i}
              value={p}
              placeholder="/ozel/"
              className={cn('min-h-11 font-mono sm:min-h-10', (p.trim() === '/' || p.trim() === '/*') && 'border-danger-border')}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const next = [...value];
                  next.splice(i + 1, 0, '/');
                  onChange(next);
                  setFocusIdx(i + 1);
                }
              }}
            />
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`${p || 'Boş'} yolunu kaldır`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => { onChange([...value, '/']); setFocusIdx(value.length); }}>
          <Plus className="h-4 w-4" aria-hidden /> Yol ekle
        </Button>
      </div>
    </Field>
  );
}

const selectCls =
  'min-h-11 w-full rounded-control border border-border bg-surface-1 px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-10';

export function SitemapRows({ rows, onChange, errors }: { rows: DraftSitemap[]; onChange: (r: DraftSitemap[]) => void; errors: Record<string, string> }) {
  const set = (key: string, patch: Partial<DraftSitemap>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const err = (f: string) => errors[`sitemap.${r.key}.${f}`];
        return (
          <fieldset key={r.key} className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-[minmax(0,2fr)_6rem_9rem_10rem_auto] sm:items-end">
            <legend className="sr-only">{`Ek adres ${i + 1}`}</legend>
            <Field id={`seo-sm-${r.key}-url`} label="Adres" error={err('url')}>
              {(c) => <Input {...c} className="min-h-11 font-mono sm:min-h-10" value={r.url} placeholder="/kampanya veya https://…" onChange={(e) => set(r.key, { url: e.target.value })} />}
            </Field>
            <Field id={`seo-sm-${r.key}-priority`} label="Öncelik" error={err('priority')}>
              {(c) => <Input {...c} inputMode="decimal" className="min-h-11 sm:min-h-10" value={r.priority} placeholder="0,5" onChange={(e) => set(r.key, { priority: e.target.value })} />}
            </Field>
            <Field id={`seo-sm-${r.key}-freq`} label="Sıklık" error={err('changeFrequency')}>
              {(c) => (
                <select {...c} className={selectCls} value={r.changeFrequency} onChange={(e) => set(r.key, { changeFrequency: e.target.value })}>
                  <option value="">Aylık (varsayılan)</option>
                  {CHANGE_FREQUENCIES.map((f) => <option key={f} value={f}>{CHANGE_FREQUENCY_LABEL[f]}</option>)}
                </select>
              )}
            </Field>
            <Field id={`seo-sm-${r.key}-lastmod`} label="Son değişiklik" error={err('lastModified')}>
              {(c) => <Input {...c} type="date" className="min-h-11 sm:min-h-10" value={r.lastModified} onChange={(e) => set(r.key, { lastModified: e.target.value })} />}
            </Field>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`${r.url || 'Boş'} adresini kaldır`} onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </fieldset>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => onChange([...rows, { key: rowKey(), url: '', priority: '', changeFrequency: '', lastModified: '' }])}>
        <Plus className="h-4 w-4" aria-hidden /> Adres ekle
      </Button>
    </div>
  );
}

export function OverrideRows({
  rows,
  onChange,
  errors,
  onFocusRow,
}: {
  rows: DraftOverride[];
  onChange: (r: DraftOverride[]) => void;
  errors: Record<string, string>;
  onFocusRow: (path: string) => void;
}) {
  const used = new Set(rows.map((r) => r.path));
  const free = SEO_ROUTES.filter((r) => !used.has(r.path));
  const set = (key: string, patch: Partial<DraftOverride>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-control border border-dashed border-border p-4 text-sm text-fg-muted">
          Ezme yok: tüm sayfalar kendi varsayılan başlık ve açıklamasını kullanıyor.
        </p>
      ) : null}
      {rows.map((r) => {
        const err = (f: string) => errors[`override.${r.key}.${f}`];
        const label = SEO_ROUTES.find((x) => x.path === r.path)?.label ?? 'Sayfa';
        return (
          <fieldset key={r.key} className="space-y-3 rounded-control border border-border p-3" onFocus={() => r.path && onFocusRow(r.path)}>
            <legend className="px-1 text-sm font-medium text-fg">{label}</legend>
            <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:items-end">
              <Field id={`seo-ov-${r.key}-path`} label="Sayfa" error={err('path')}>
                {(c) => (
                  <select {...c} className={selectCls} value={r.path} onChange={(e) => set(r.key, { path: e.target.value as DraftOverride['path'] })}>
                    <option value="">Seçin…</option>
                    {SEO_ROUTES.filter((x) => x.path === r.path || !used.has(x.path)).map((x) => (
                      <option key={x.path} value={x.path}>{`${x.label} (${x.path})`}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field id={`seo-ov-${r.key}-title`} label="Başlık" error={err('title')} labelAside={r.title ? <LengthMeter length={r.title.trim().length} min={10} max={60} /> : undefined}>
                {(c) => <Input {...c} className="min-h-11 sm:min-h-10" value={r.title} placeholder="Boş: sayfanın kendi başlığı" onChange={(e) => set(r.key, { title: e.target.value })} />}
              </Field>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`${label} ezmesini kaldır`} onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <Field id={`seo-ov-${r.key}-description`} label="Açıklama" error={err('description')} labelAside={r.description ? <LengthMeter length={r.description.trim().length} min={70} max={160} /> : undefined}>
              {(c) => <Textarea {...c} rows={2} value={r.description} placeholder="Boş: sayfanın kendi açıklaması" onChange={(e) => set(r.key, { description: e.target.value })} />}
            </Field>
            <Field id={`seo-ov-${r.key}-canonical`} label="Canonical adres" error={err('canonical')} optional>
              {(c) => <Input {...c} type="url" className="min-h-11 sm:min-h-10" value={r.canonical} placeholder="Boş: sayfanın kendi adresi" onChange={(e) => set(r.key, { canonical: e.target.value })} />}
            </Field>
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 sm:min-h-9"
        disabled={free.length === 0}
        onClick={() => onChange([...rows, { key: rowKey(), path: free[0]?.path ?? '', title: '', description: '', canonical: '' }])}
      >
        <Plus className="h-4 w-4" aria-hidden /> Sayfa ezmesi ekle
      </Button>
    </div>
  );
}

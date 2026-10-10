'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, ExternalLink, FileImage, FileText, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChoiceChips } from '@/components/ds/a11y';
import { cn } from '@/lib/utils';
import {
  DEFAULT_CTA,
  PRINT_PRESETS,
  PRINT_TEMPLATES,
  QR_CTA_MAX,
  buildLinkUrl,
  checkPrintColors,
  fileSlug,
  type PrintTemplate,
  type QrLink,
} from '@/lib/dealer/qr-codes/rules';
import type { QrItemDto } from '@/lib/dealer/qr-codes/types';
import { downloadPng, downloadPrint, printUrl, type PrintParams } from './api';
import { TEMPLATE_META, errorText } from './format';
import { copyText } from './clipboard';

const fieldCls = 'qx-small font-medium text-fg';

export function PrintPanel({ item, links }: { item: QrItemDto; links: QrLink[] }) {
  const uid = useId();
  const [template, setTemplate] = useState<PrintTemplate>('card');
  const [fg, setFg] = useState('#111111');
  const [bg, setBg] = useState('#FFFFFF');
  const [cta, setCta] = useState('');
  const [link, setLink] = useState<string>('');
  const [busy, setBusy] = useState<null | 'pdf' | 'svg' | 'png'>(null);
  const [utm, setUtm] = useState({ source: '', medium: '', campaign: '' });

  const verdict = checkPrintColors(fg, bg);
  const params: PrintParams = { ids: [item.id], template, format: 'svg', fg, bg, cta, link: link || null };

  // Önizleme isteği yazarken her tuşta değil, kısa bir bekleme sonrası (sunucu üretir → WYSIWYG).
  const previewSrc = verdict.ok ? printUrl(params) : null;
  const [debounced, setDebounced] = useState(previewSrc);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(previewSrc), 300);
    return () => window.clearTimeout(t);
  }, [previewSrc]);
  useEffect(() => setLoaded(false), [debounced]);

  const target = buildLinkUrl(item.targetUrl, { segment: link || null });
  const campaignUrl = useMemo(
    () => buildLinkUrl(item.targetUrl, { segment: link || null, utmSource: utm.source, utmMedium: utm.medium, utmCampaign: utm.campaign }),
    [item.targetUrl, link, utm]
  );
  const base = `qr-${fileSlug(item.name)}-${template}`;

  const run = async (kind: 'pdf' | 'svg' | 'png') => {
    setBusy(kind);
    try {
      if (kind === 'png') await downloadPng(params, `${base}.png`);
      else await downloadPrint({ ...params, format: kind }, `${base}.${kind}`);
      toast.success(kind === 'pdf' ? 'PDF indirildi — %100 ölçekte yazdırın' : 'Dosya indirildi');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-2">
        <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-lg border border-border bg-surface-muted p-3">
          {debounced ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={debounced}
              src={debounced}
              alt={`${item.name} — ${TEMPLATE_META[template].label} önizlemesi`}
              onLoad={() => setLoaded(true)}
              className={cn('max-h-full max-w-full object-contain shadow-sm transition-opacity duration-base motion-reduce:transition-none', loaded ? 'opacity-100' : 'opacity-0')}
            />
          ) : (
            <p className="qx-small max-w-[16rem] text-center text-fg-muted">Renkler okunabilir olmadığı için önizleme gösterilmiyor.</p>
          )}
          {debounced && !loaded && <span className="qx-caption absolute inset-x-0 bottom-2 text-center text-fg-muted">Hazırlanıyor…</span>}
        </div>
        <p className="qx-caption text-fg-muted">{TEMPLATE_META[template].hint}. Önizleme, indirilen dosyanın aynısıdır.</p>
      </div>

      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className={fieldCls}>Şablon</legend>
          <ChoiceChips
            aria-label="Şablon"
            options={PRINT_TEMPLATES.map((t) => ({ value: t, label: TEMPLATE_META[t].label }))}
            value={template}
            onChange={(next) => next && setTemplate(next as PrintTemplate)}
          />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={fieldCls}>Renk</legend>
          <div className="flex flex-wrap gap-2">
            {PRINT_PRESETS.map((p) => {
              const active = p.fg === fg.toUpperCase() && p.bg === bg.toUpperCase();
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFg(p.fg);
                    setBg(p.bg);
                  }}
                  className={cn(
                    'qx-small inline-flex min-h-11 items-center gap-2 rounded-md border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    active ? 'border-brand bg-brand-subtle text-fg' : 'border-border bg-surface-1 text-fg-muted hover:bg-surface-2'
                  )}
                >
                  <span className="flex h-5 w-5 overflow-hidden rounded-sm ring-1 ring-border" aria-hidden>
                    <span className="w-1/2" style={{ background: p.fg }} />
                    <span className="w-1/2" style={{ background: p.bg }} />
                  </span>
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor={`${uid}-fg`} className="qx-caption text-fg-muted">
                QR rengi
              </label>
              <input id={`${uid}-fg`} type="color" value={fg} onChange={(e) => setFg(e.target.value.toUpperCase())} className="h-11 w-full cursor-pointer rounded-md border border-border bg-surface-1" />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${uid}-bg`} className="qx-caption text-fg-muted">
                Zemin rengi
              </label>
              <input id={`${uid}-bg`} type="color" value={bg} onChange={(e) => setBg(e.target.value.toUpperCase())} className="h-11 w-full cursor-pointer rounded-md border border-border bg-surface-1" />
            </div>
          </div>
          {verdict.ok ? (
            <p className="qx-caption flex items-center gap-1 text-success">
              <Check className="h-3.5 w-3.5" aria-hidden /> Kontrast {verdict.ratio.toFixed(1).replace('.', ',')}:1 — okunur
            </p>
          ) : (
            <p role="alert" className="qx-caption flex items-start gap-1 text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {verdict.reason === 'inverted'
                ? 'QR koyu, zemin açık renk olmalı. Ters renkleri birçok telefon okuyamaz.'
                : `Kontrast ${verdict.ratio.toFixed(1).replace('.', ',')}:1 — en az 4,5:1 olmalı.`}
            </p>
          )}
        </fieldset>

        {template !== 'plain' && (
          <div className="space-y-1">
            <label htmlFor={`${uid}-cta`} className={fieldCls}>
              Çağrı metni
            </label>
            <Input id={`${uid}-cta`} value={cta} maxLength={QR_CTA_MAX} placeholder={DEFAULT_CTA} onChange={(e) => setCta(e.target.value)} className="min-h-11" />
            <p className="qx-caption text-fg-muted">
              {cta.length}/{QR_CTA_MAX} · Boş bırakırsanız “{DEFAULT_CTA}” yazılır.
            </p>
          </div>
        )}

        {links.length > 0 && (
          <div className="space-y-1">
            <label htmlFor={`${uid}-link`} className={fieldCls}>
              Karşılama bağlantısı
            </label>
            <select
              id={`${uid}-link`}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="qx-small min-h-11 w-full rounded-md border border-border bg-surface-1 px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <option value="">Varsayılan karşılama</option>
              {links.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.key}
                </option>
              ))}
            </select>
            <p className="qx-caption text-fg-muted">Bu kartı okutan müşteri, bağlantının karşılama metnini görür; taramalar bağlantıya göre ayrışır.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => run('pdf')} disabled={!verdict.ok || busy !== null} aria-busy={busy === 'pdf'} className="min-h-11">
            <FileText className="mr-2 h-4 w-4" aria-hidden />
            {busy === 'pdf' ? 'Hazırlanıyor…' : 'PDF indir (baskı)'}
          </Button>
          <Button type="button" variant="outline" onClick={() => run('svg')} disabled={!verdict.ok || busy !== null} aria-busy={busy === 'svg'} className="min-h-11">
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {busy === 'svg' ? 'Hazırlanıyor…' : 'SVG'}
          </Button>
          <Button type="button" variant="outline" onClick={() => run('png')} disabled={!verdict.ok || busy !== null} aria-busy={busy === 'png'} className="min-h-11">
            <FileImage className="mr-2 h-4 w-4" aria-hidden />
            {busy === 'png' ? 'Hazırlanıyor…' : 'PNG'}
          </Button>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className={fieldCls}>Bağlantı</p>
          <p className="qx-caption break-all font-mono text-fg-muted">{target}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => copyText(target, 'Bağlantı kopyalandı')}>
              <Copy className="mr-2 h-4 w-4" aria-hidden /> Kopyala
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" asChild>
              <a href={target} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden /> Formu aç
              </a>
            </Button>
          </div>
        </div>

        <details className="group rounded-lg border border-border p-3">
          <summary className="qx-small flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-fg">
            <Link2 className="h-4 w-4 text-fg-muted" aria-hidden /> Kampanya bağlantısı (UTM)
          </summary>
          <div className="mt-2 space-y-2">
            <p className="qx-caption text-fg-muted">Instagram, e-posta ya da broşür için ayrı bağlantı; taramalar kaynağa göre ölçülür.</p>
            {(['source', 'medium', 'campaign'] as const).map((k) => (
              <div key={k} className="space-y-1">
                <label htmlFor={`${uid}-utm-${k}`} className="qx-caption text-fg-muted">
                  {k === 'source' ? 'Kaynak (ör. instagram)' : k === 'medium' ? 'Kanal (ör. hikaye)' : 'Kampanya (ör. ekim-menu)'}
                </label>
                <Input
                  id={`${uid}-utm-${k}`}
                  value={utm[k]}
                  maxLength={64}
                  onChange={(e) => setUtm((u) => ({ ...u, [k]: e.target.value }))}
                  className="min-h-11"
                />
              </div>
            ))}
            <p className="qx-caption break-all font-mono text-fg-muted">{campaignUrl}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={!utm.source.trim()}
              onClick={() => copyText(campaignUrl, 'Kampanya bağlantısı kopyalandı')}
            >
              <Copy className="mr-2 h-4 w-4" aria-hidden /> Kampanya bağlantısını kopyala
            </Button>
          </div>
        </details>
      </div>
    </div>
  );
}


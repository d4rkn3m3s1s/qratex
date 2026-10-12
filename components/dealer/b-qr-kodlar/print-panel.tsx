'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { errorText } from './format';
import { useQrCopy } from './copy';
import { copyText } from './clipboard';
import { DrawCheck } from '@/components/fx/event-fx';

const fieldCls = 'qx-small font-medium text-fg';

export function PrintPanel({ item, links }: { item: QrItemDto; links: QrLink[] }) {
  const uid = useId();
  const copy = useQrCopy();
  const c = copy.print;
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
  // Kopyala tiki: başarılı kopyadan sonra ikon ~1.2 sn çizilen tike döner.
  const [copied, setCopied] = useState<'link' | 'utm' | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  const flashCopied = (k: 'link' | 'utm') => {
    setCopied(k);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1200);
  };
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
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
      toast.success(kind === 'pdf' ? c.pdfDone : c.fileDone);
    } catch (e) {
      toast.error(errorText(e, copy.common.actionFailed));
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
              alt={c.previewAlt(item.name, copy.template[template].label)}
              onLoad={() => setLoaded(true)}
              className={cn('max-h-full max-w-full object-contain shadow-sm transition-opacity duration-base motion-reduce:transition-none', loaded ? 'qx-fx-qr-draw opacity-100' : 'opacity-0')}
            />
          ) : (
            <p className="qx-small max-w-[16rem] text-center text-fg-muted">{c.unreadable}</p>
          )}
          {debounced && !loaded && <span className="qx-caption absolute inset-x-0 bottom-2 text-center text-fg-muted">{copy.common.preparing}</span>}
        </div>
        <p className="qx-caption text-fg-muted">{c.sameAsFile(copy.template[template].hint)}</p>
      </div>

      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className={fieldCls}>{c.template}</legend>
          <ChoiceChips
            aria-label={c.template}
            options={PRINT_TEMPLATES.map((t) => ({ value: t, label: copy.template[t].label }))}
            value={template}
            onChange={(next) => next && setTemplate(next as PrintTemplate)}
          />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={fieldCls}>{c.color}</legend>
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
                {c.qrColor}
              </label>
              <input id={`${uid}-fg`} type="color" value={fg} onChange={(e) => setFg(e.target.value.toUpperCase())} className="h-11 w-full cursor-pointer rounded-md border border-border bg-surface-1" />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${uid}-bg`} className="qx-caption text-fg-muted">
                {c.bgColor}
              </label>
              <input id={`${uid}-bg`} type="color" value={bg} onChange={(e) => setBg(e.target.value.toUpperCase())} className="h-11 w-full cursor-pointer rounded-md border border-border bg-surface-1" />
            </div>
          </div>
          {verdict.ok ? (
            <p className="qx-caption flex items-center gap-1 text-success">
              <Check className="h-3.5 w-3.5" aria-hidden /> {c.contrastOk(verdict.ratio.toFixed(1).replace('.', c.decimalSep))}
            </p>
          ) : (
            <p role="alert" className="qx-caption flex items-start gap-1 text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {verdict.reason === 'inverted'
                ? c.inverted
                : c.contrastLow(verdict.ratio.toFixed(1).replace('.', c.decimalSep))}
            </p>
          )}
        </fieldset>

        {template !== 'plain' && (
          <div className="space-y-1">
            <label htmlFor={`${uid}-cta`} className={fieldCls}>
              {c.cta}
            </label>
            <Input id={`${uid}-cta`} value={cta} maxLength={QR_CTA_MAX} placeholder={DEFAULT_CTA} onChange={(e) => setCta(e.target.value)} className="min-h-11" />
            <p className="qx-caption text-fg-muted">
              {c.ctaHint(cta.length, QR_CTA_MAX, DEFAULT_CTA)}
            </p>
          </div>
        )}

        {links.length > 0 && (
          <div className="space-y-1">
            <label htmlFor={`${uid}-link`} className={fieldCls}>
              {c.welcomeLink}
            </label>
            <select
              id={`${uid}-link`}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="qx-small min-h-11 w-full rounded-md border border-border bg-surface-1 px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <option value="">{c.defaultWelcome}</option>
              {links.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.key}
                </option>
              ))}
            </select>
            <p className="qx-caption text-fg-muted">{c.welcomeHint}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => run('pdf')} disabled={!verdict.ok || busy !== null} aria-busy={busy === 'pdf'} className="min-h-11">
            <FileText className="mr-2 h-4 w-4" aria-hidden />
            {busy === 'pdf' ? copy.common.preparing : c.pdf}
          </Button>
          <Button type="button" variant="outline" onClick={() => run('svg')} disabled={!verdict.ok || busy !== null} aria-busy={busy === 'svg'} className="min-h-11">
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {busy === 'svg' ? copy.common.preparing : 'SVG'}
          </Button>
          <Button type="button" variant="outline" onClick={() => run('png')} disabled={!verdict.ok || busy !== null} aria-busy={busy === 'png'} className="min-h-11">
            <FileImage className="mr-2 h-4 w-4" aria-hidden />
            {busy === 'png' ? copy.common.preparing : 'PNG'}
          </Button>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className={fieldCls}>{c.link}</p>
          <p className="qx-caption break-all font-mono text-fg-muted">{target}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void copyText(target, copy.common.linkCopied, copy.common.clipboardFailed).then((ok) => ok && flashCopied('link'))}>
              {copied === 'link' ? <DrawCheck circle={false} className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" aria-hidden />} {c.copy}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" asChild>
              <a href={target} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden /> {c.openForm}
              </a>
            </Button>
          </div>
        </div>

        <details className="group rounded-lg border border-border p-3">
          <summary className="qx-small flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-fg">
            <Link2 className="h-4 w-4 text-fg-muted" aria-hidden /> {c.utm}
          </summary>
          <div className="mt-2 space-y-2">
            <p className="qx-caption text-fg-muted">{c.utmHint}</p>
            {(['source', 'medium', 'campaign'] as const).map((k) => (
              <div key={k} className="space-y-1">
                <label htmlFor={`${uid}-utm-${k}`} className="qx-caption text-fg-muted">
                  {k === 'source' ? c.utmSource : k === 'medium' ? c.utmMedium : c.utmCampaign}
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
              onClick={() => void copyText(campaignUrl, c.utmCopied, copy.common.clipboardFailed).then((ok) => ok && flashCopied('utm'))}
            >
              {copied === 'utm' ? <DrawCheck circle={false} className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" aria-hidden />} {c.utmCopy}
            </Button>
          </div>
        </details>
      </div>
    </div>
  );
}


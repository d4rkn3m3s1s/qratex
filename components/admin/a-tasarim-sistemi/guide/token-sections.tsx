'use client';

import { useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionCard } from '@/components/states';
import { contrastRatio, formatRatio, gradeContrast } from '@/lib/design/contrast';
import {
  BORDER_TOKENS,
  CATEGORY_TOKENS,
  ELEVATION_SCALE,
  RADIUS_SCALE,
  SPACING_SCALE,
  STATUS_LABELS,
  STATUS_NAMES,
  SURFACE_TOKENS,
  TEXT_TOKENS,
  TYPE_SCALE,
  Z_SCALE,
  contrastContract,
} from '@/lib/design/tokens';
import { useLiveTokens } from './use-live-tokens';
import { useDesignSystemCopy } from '../copy';

const ALL_COLOR_NAMES = [
  'background',
  'card',
  ...SURFACE_TOKENS.map((t) => t.name),
  ...TEXT_TOKENS.map((t) => t.name),
  ...BORDER_TOKENS.map((t) => t.name),
  ...STATUS_NAMES.flatMap((n) => [n, `${n}-fg`, `${n}-text`, `${n}-subtle`, `${n}-border`]),
  ...CATEGORY_TOKENS.map((t) => t.name),
] as const;

function RatioPill({ ratio, min = 4.5 }: { ratio: number; min?: number }) {
  const ux = useDesignSystemCopy().ui;
  const ok = Number.isFinite(ratio) && ratio >= min;
  const grade = gradeContrast(ratio);
  return (
    <span
      className={cn(
        'qx-caption qx-num inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 font-medium',
        ok ? 'border-success-border bg-success-subtle text-success' : 'border-danger-border bg-danger-subtle text-danger',
      )}
      title={`Gereken ≥ ${min}:1`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
      {formatRatio(ratio)}
      <span className="sr-only">{ok ? ux.gecti : ux.kaldi}</span>
      <span aria-hidden className="text-fg-subtle">· {min === 3 && grade === 'AA-large' ? 'AA' : grade}</span>
    </span>
  );
}

function Swatch({ name, value, label, utility }: { name: string; value?: string; label: string; utility: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden
        className="h-10 w-10 shrink-0 rounded-control border border-strong/40"
        style={{ background: value ? `hsl(${value})` : undefined }}
      />
      <div className="min-w-0">
        <p className="qx-small truncate font-medium text-fg">{label}</p>
        <p className="qx-caption truncate font-mono text-fg-muted">
          --{name} · {utility}
        </p>
      </div>
    </div>
  );
}

export function ColorTokensSection() {
  const uy = useDesignSystemCopy().ui2;
  const ux = useDesignSystemCopy().ui;
  const dx = useDesignSystemCopy();
  const v = useLiveTokens(ALL_COLOR_NAMES);
  const c = (a: string, b: string) => contrastRatio(v[a] ?? '', v[b] ?? '');

  return (
    <SectionCard
      title={ux.renkTokenLariCanli}
      description={ux.degerlerBelgedenOkunurAktif}
    >
      <div className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3">
            <h3 className="qx-overline text-fg-muted">{dx.surfaces}</h3>
            {SURFACE_TOKENS.map((t) => (
              <Swatch key={t.name} name={t.name} value={v[t.name]} label={t.label} utility={t.utility} />
            ))}
          </div>
          <div className="space-y-3">
            <h3 className="qx-overline text-fg-muted">{uy.metin}</h3>
            {TEXT_TOKENS.map((t) => (
              <div key={t.name} className="flex items-center justify-between gap-2">
                <Swatch name={t.name} value={v[t.name]} label={t.label} utility={t.utility} />
                <RatioPill ratio={c(t.name, 'surface-1')} />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <h3 className="qx-overline text-fg-muted">{dx.border}</h3>
            {BORDER_TOKENS.map((t) => (
              <div key={t.name} className="flex items-center justify-between gap-2">
                <Swatch name={t.name} value={v[t.name]} label={t.label} utility={t.utility} />
                {t.name === 'border-strong' && <RatioPill ratio={c(t.name, 'surface-1')} min={3} />}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="qx-overline text-fg-muted">{dx.semanticRoles}</h3>
          <div className="overflow-x-auto rounded-control border">
            <table className="w-full min-w-[40rem] text-left">
              <thead className="bg-surface-muted">
                <tr className="qx-caption text-fg-muted">
                  <th scope="col" className="px-3 py-2 font-medium">{uy.rol}</th>
                  <th scope="col" className="px-3 py-2 font-medium">Dolgu (bg-*) + *-fg</th>
                  <th scope="col" className="px-3 py-2 font-medium">Metin (text-*) / kart</th>
                  <th scope="col" className="px-3 py-2 font-medium">Metin / sayfa zemini</th>
                  <th scope="col" className="px-3 py-2 font-medium">Rozet (*-subtle)</th>
                </tr>
              </thead>
              <tbody>
                {STATUS_NAMES.map((n) => (
                  <tr key={n} className="border-t">
                    <th scope="row" className="qx-small px-3 py-2.5 font-medium text-fg">
                      {STATUS_LABELS[n]}
                      <span className="block font-mono qx-caption font-normal text-fg-subtle">{n}</span>
                    </th>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="qx-small rounded-control px-2.5 py-1 font-semibold"
                          style={{ background: `hsl(${v[n]})`, color: `hsl(${v[`${n}-fg`]})` }}
                        >
                          {uy.kaydet}
                        </span>
                        <RatioPill ratio={c(`${n}-fg`, n)} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="qx-small font-medium" style={{ color: `hsl(${v[`${n}-text`]})` }}>
                          {uy.durumMetni}
                        </span>
                        <RatioPill ratio={c(`${n}-text`, 'surface-1')} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <RatioPill ratio={c(`${n}-text`, 'surface-0')} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="qx-caption rounded-full border px-2 py-0.5 font-semibold"
                          style={{
                            background: `hsl(${v[`${n}-subtle`]})`,
                            color: `hsl(${v[`${n}-text`]})`,
                            borderColor: `hsl(${v[`${n}-border`]})`,
                          }}
                        >
                          {uy.rozet}
                        </span>
                        <RatioPill ratio={c(`${n}-text`, `${n}-subtle`)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="qx-caption text-fg-muted">
            Tailwind: <code className="font-mono">text-danger</code> / <code className="font-mono">text-destructive</code> {ux.metinRolu}
            <code className="font-mono">--danger-text</code>), <code className="font-mono">bg-danger</code> → dolgu. Dolgu rengi metin olarak
            {ux.kullanilamaz}
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="qx-overline text-fg-muted">{dx.identityColors}</h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {CATEGORY_TOKENS.map((t) => (
              <div key={t.name} className="space-y-1 text-center">
                <span aria-hidden className="block h-10 rounded-control" style={{ background: v[t.name] ? `hsl(${v[t.name]})` : undefined }} />
                <span className="qx-caption font-mono text-fg-muted">{t.name.replace('category-', 'c')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

export function ContrastAuditSection() {
  const fz = useDesignSystemCopy().fx;
  const ux = useDesignSystemCopy().ui;
  const pairs = useMemo(() => contrastContract(), []);
  const names = useMemo(() => Array.from(new Set(pairs.flatMap((p) => [p.fg, p.bg]))), [pairs]);
  const v = useLiveTokens(names);
  const ready = names.every((n) => v[n]);
  const results = pairs.map((p) => ({ ...p, ratio: contrastRatio(v[p.fg] ?? '', v[p.bg] ?? '') }));
  const failing = results.filter((r) => !(r.ratio >= r.min));

  return (
    <SectionCard
      title={ux.kontrastSozlesmesi}
      description={ux.aktifTemadaZorunluCiftlerin}
      tone={failing.length ? 'danger' : 'success'}
      stripe
    >
      {!ready ? (
        <p className="qx-small text-fg-muted">Token'lar okunuyor…</p>
      ) : failing.length === 0 ? (
        <p className="qx-body flex items-center gap-2 font-medium text-success">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          {fz.allPairsPass(results.length)}
        </p>
      ) : (
        <div className="space-y-3" role="alert">
          <p className="qx-body font-medium text-danger">
            {fz.pairsFail(failing.length, results.length)}
          </p>
          <ul className="space-y-1.5">
            {failing.map((r) => (
              <li key={`${r.fg}/${r.bg}`} className="qx-small flex flex-wrap items-center gap-2 text-fg">
                <RatioPill ratio={r.ratio} min={r.min} />
                <code className="font-mono">
                  --{r.fg} / --{r.bg}
                </code>
                <span className="text-fg-muted">{r.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

export function TypographySection() {
  const fz = useDesignSystemCopy().fx;
  const ux = useDesignSystemCopy().ui;
  return (
    <SectionCard title={ux.tipografiOlcegi} description={fz.typeScaleDesc}>
      <div className="divide-y">
        {TYPE_SCALE.map((t) => (
          <div key={t.cls} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[12rem_1fr] sm:items-baseline sm:gap-4">
            <div>
              <p className="qx-small font-medium text-fg">{t.label}</p>
              <p className="qx-caption font-mono text-fg-muted">.{t.cls}</p>
              <p className="qx-caption text-fg-subtle">{t.spec}</p>
            </div>
            <p className={cn(t.cls, 'min-w-0 break-words text-fg')}>{t.sample}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function ScalesSection() {
  const ux = useDesignSystemCopy().ui;
  return (
    <div className="grid gap-section lg:grid-cols-2">
      <SectionCard title={ux.radius} description={ux.t4DegerKontroller12}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RADIUS_SCALE.map((r) => (
            <div key={r.token} className="space-y-1.5 text-center">
              <div className="mx-auto h-14 w-full border-2 border-brand-border bg-brand-subtle" style={{ borderRadius: `var(${r.token})` }} />
              <p className="qx-caption font-mono text-fg">{r.utility}</p>
              <p className="qx-caption text-fg-muted">
                {r.px}px · {r.use}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={ux.elevation} description={ux.opsKartlari1Acilir}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {ELEVATION_SCALE.map((e) => (
            <div key={e.cls} className="space-y-2 text-center">
              <div className={cn('mx-auto h-14 w-full rounded-card border bg-surface-1', e.cls)} />
              <p className="qx-caption font-mono text-fg">.{e.cls}</p>
              <p className="qx-caption text-fg-muted">{e.use}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={ux.boslukRitmi} description={ux.t4pxTabanSayfaVe}>
        <ul className="space-y-3">
          {SPACING_SCALE.map((s) => (
            <li key={s.token} className="space-y-1">
              <p className="qx-small font-medium text-fg">
                <code className="font-mono">{s.utility}</code>
              </p>
              <div className="flex items-center gap-2">
                <span aria-hidden className="h-3 rounded-full bg-brand" style={{ width: `var(${s.token})` }} />
                <span className="qx-caption text-fg-muted">
                  {s.value} · {s.use}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title={ux.katmanlarZIndex} description={ux.keyfiZNYerine}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <tbody>
              {Z_SCALE.map((z) => (
                <tr key={z.token} className="border-b last:border-b-0">
                  <td className="qx-small py-1.5 font-mono text-fg">{z.utility}</td>
                  <td className="qx-small qx-num py-1.5 text-right text-fg-muted">{z.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Ban, CheckCircle2, ExternalLink, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, StatusBadge, Timeline } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { ENFORCEMENT_HINT, ENFORCEMENT_LABEL, SCOPE_LABEL, SEVERITY_LABEL, type ModuleRow } from '@/lib/admin-flags/contract';
import { fcKeys, fetchHistory } from './api';
import { ENFORCEMENT_TONE, SEVERITY_TONE, fmtAbs, fmtNum } from './format';
import { useSourceT } from '@/components/ds/page/source-dict';
import { FEATURE_LAB_DICT, useFeatureLabCopy } from './copy';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

const ROLE_ROWS = [
  ['customer', 'Müşteri'],
  ['dealer', 'Bayi'],
  ['system', 'Sistem / yönetim'],
] as const;

export function ModuleDetail({ row: m, onToggle }: { row: ModuleRow; onToggle: (next: boolean) => void }) {
  const fz = useFeatureLabCopy().fx;
  const L = useSourceT(FEATURE_LAB_DICT);
  const ux = useFeatureLabCopy().ui;
  const fx = useFeatureLabCopy();
  const qs = `kind=all&key=${encodeURIComponent(m.key)}&size=20`;
  const history = useQuery({ queryKey: fcKeys.history(qs), queryFn: ({ signal }) => fetchHistory(qs, signal), staleTime: 30_000 });
  const inertLocked = m.enforcement === 'none' && m.enabled;
  const b = m.blocks24h;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={m.enabled ? 'success' : 'danger'} label={m.enabled ? ux.acik : ux.kapali} icon={m.enabled ? CheckCircle2 : Ban} />
          <StatusBadge tone={ENFORCEMENT_TONE[m.enforcement]} label={L(ENFORCEMENT_LABEL[m.enforcement])} />
          <StatusBadge tone={SEVERITY_TONE[m.severity]} label={L(SEVERITY_LABEL[m.severity])} />
        </div>
        <p className="text-sm text-fg-muted">{m.description}</p>
        <p className="text-sm text-fg">{L(ENFORCEMENT_HINT[m.enforcement])}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant={m.enabled ? 'destructive' : 'default'}
            className="min-h-11 sm:min-h-10"
            disabled={inertLocked}
            onClick={() => onToggle(!m.enabled)}
          >
            {m.enabled ? ux.moduluKapat : ux.moduluAc}
          </Button>
          {m.adminHref ? (
            <Button asChild variant="outline" className="min-h-11 sm:min-h-10">
              <Link href={m.adminHref}>
                {ux.yonetimSayfasi}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          { label: ux.anahtar, value: m.key, mono: true, copyValue: m.key },
          { label: ux.kapsam, value: L(SCOPE_LABEL[m.scope]) },
          {
            label: ux.kullaniciEkrani,
            value: m.previewPath ?? '—',
            mono: !!m.previewPath,
            copyValue: m.previewPath ?? undefined,
            hint: m.previewPath ? ux.musteriBayiPanelindeYonetici : undefined,
          },
          {
            label: ux.kademeliAcilis,
            value: m.rollout
              ? m.rollout.active && !m.rollout.expired
                ? (m.rollout.allowCount ? fz.pctPlus(m.rollout.percent, fmtNum(m.rollout.allowCount)) : fz.pct(m.rollout.percent))
                : m.rollout.expired
                  ? ux.suresiDolduHerkeseAcik
                  : 'Durduruldu'
              : 'Yok',
            hint: m.rollout?.expiresAt ? fz.endsAt(fmtAbs(m.rollout.expiresAt)) : undefined,
          },
        ]}
      />

      <Section title={fz.boundApi(fmtNum(m.bindings.api.length))}>
        {m.bindings.api.length ? (
          <ul className="divide-y divide-border rounded-card border border-border">
            {m.bindings.api.map((e) => (
              <li key={e.file} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <code className="min-w-0 break-all font-mono text-xs text-fg">{e.endpoint}</code>
                <span className="flex flex-wrap gap-1">
                  {e.methods.map((mt) => (
                    <StatusBadge key={mt} size="sm" tone="neutral" icon={null} label={mt} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{fx.noApi}</p>
        )}
        {m.bindings.pages.length || m.bindings.server.length || m.bindings.landing.length || m.bindings.menu.length ? (
          <ul className="space-y-1 text-xs text-fg-muted">
            {m.bindings.pages.map((f) => (
              <li key={f}>
                {fz.pageGate} <code className="font-mono">{f}</code>
              </li>
            ))}
            {m.bindings.server.map((f) => (
              <li key={f}>
                {fz.serverLogic} <code className="font-mono">{f}</code>
              </li>
            ))}
            {m.bindings.landing.map((f) => (
              <li key={f}>
                {fz.publicSite} <code className="font-mono">{f}</code>
              </li>
            ))}
            {m.bindings.menu.map((f) => (
              <li key={f}>
                {fz.menuHide} <code className="font-mono">{f}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title={ux.rolGorunurlugu}>
        <ul className="grid gap-2 sm:grid-cols-3">
          {ROLE_ROWS.map(([k, label0]) => {
            const label = L(label0);
            const v = m.roles[k];
            return (
              <li key={k} className="flex items-center justify-between rounded-card border border-border px-3 py-2 text-sm">
                <span className="text-fg">{label}</span>
                {v === null ? <span className="text-fg-muted">Uygulanmaz</span> : <StatusBadge size="sm" tone={v ? 'success' : 'danger'} label={v ? ux.acik : ux.kapali} />}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-fg-muted">
          {fz.roleManaged}{' '}
          <Link className="font-medium text-brand underline-offset-2 hover:underline" href="/admin/settings?tab=page-settings">
            {ux.sayfaGorunurlugunuAc}
            <ExternalLink className="ml-0.5 inline h-3 w-3" aria-hidden />
          </Link>
        </p>
      </Section>

      <Section title={ux.son24SaatteEngellenen}>
        <KeyValueList
          layout="grid"
          columns={2}
          dense
          items={[
            { label: ux.genelKapatma, value: fmtNum(b.global) },
            { label: ux.rolKapatmasi, value: fmtNum(b.role) },
            { label: ux.kademeliAcilisDisi, value: fmtNum(b.rollout) },
            { label: ux.toplamOturumlu, value: fmtNum(b.total) },
          ]}
        />
        <p className="text-xs text-fg-muted">{fx.anonBlocks}</p>
      </Section>

      <Section title={ux.degisiklikGecmisi}>
        <QueryState query={history} skeleton="list" onRetry={() => history.refetch()} isEmpty={(d) => d.items.length === 0} empty={{ title: ux.kayitYok, description: ux.buModuldeHenuzDegisiklik }}>
          {(d) => (
            <Timeline
              dense
              ariaLabel={fz.historyOf(m.label)}
              events={d.items.map((it) => ({
                id: it.id,
                title: it.summary,
                description: it.reason ?? undefined,
                at: it.at,
                actor: it.actor ?? undefined,
                icon: History,
                tone: it.kind === 'module' ? (it.summary.includes(ux.kapatildi) ? 'danger' : 'success') : 'info',
              }))}
            />
          )}
        </QueryState>
      </Section>
    </div>
  );
}

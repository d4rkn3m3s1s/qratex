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
import { useFeatureLabCopy } from './copy';

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
  const fx = useFeatureLabCopy();
  const qs = `kind=all&key=${encodeURIComponent(m.key)}&size=20`;
  const history = useQuery({ queryKey: fcKeys.history(qs), queryFn: ({ signal }) => fetchHistory(qs, signal), staleTime: 30_000 });
  const inertLocked = m.enforcement === 'none' && m.enabled;
  const b = m.blocks24h;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={m.enabled ? 'success' : 'danger'} label={m.enabled ? 'Açık' : 'Kapalı'} icon={m.enabled ? CheckCircle2 : Ban} />
          <StatusBadge tone={ENFORCEMENT_TONE[m.enforcement]} label={ENFORCEMENT_LABEL[m.enforcement]} />
          <StatusBadge tone={SEVERITY_TONE[m.severity]} label={SEVERITY_LABEL[m.severity]} />
        </div>
        <p className="text-sm text-fg-muted">{m.description}</p>
        <p className="text-sm text-fg">{ENFORCEMENT_HINT[m.enforcement]}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant={m.enabled ? 'destructive' : 'default'}
            className="min-h-11 sm:min-h-10"
            disabled={inertLocked}
            onClick={() => onToggle(!m.enabled)}
          >
            {m.enabled ? 'Modülü kapat' : 'Modülü aç'}
          </Button>
          {m.adminHref ? (
            <Button asChild variant="outline" className="min-h-11 sm:min-h-10">
              <Link href={m.adminHref}>
                Yönetim sayfası
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
          { label: 'Anahtar', value: m.key, mono: true, copyValue: m.key },
          { label: 'Kapsam', value: SCOPE_LABEL[m.scope] },
          {
            label: 'Kullanıcı ekranı',
            value: m.previewPath ?? '—',
            mono: !!m.previewPath,
            copyValue: m.previewPath ?? undefined,
            hint: m.previewPath ? 'Müşteri/bayi panelinde; yönetici hesabıyla açılmaz.' : undefined,
          },
          {
            label: 'Kademeli açılış',
            value: m.rollout
              ? m.rollout.active && !m.rollout.expired
                ? `%${m.rollout.percent}${m.rollout.allowCount ? ` + ${fmtNum(m.rollout.allowCount)} kişi` : ''}`
                : m.rollout.expired
                  ? 'Süresi doldu (herkese açık)'
                  : 'Durduruldu'
              : 'Yok',
            hint: m.rollout?.expiresAt ? `Bitiş: ${fmtAbs(m.rollout.expiresAt)}` : undefined,
          },
        ]}
      />

      <Section title={`Bağlı API uçları (${fmtNum(m.bindings.api.length)})`}>
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
                Sayfa kapısı: <code className="font-mono">{f}</code>
              </li>
            ))}
            {m.bindings.server.map((f) => (
              <li key={f}>
                Sunucu mantığı: <code className="font-mono">{f}</code>
              </li>
            ))}
            {m.bindings.landing.map((f) => (
              <li key={f}>
                Açık site: <code className="font-mono">{f}</code>
              </li>
            ))}
            {m.bindings.menu.map((f) => (
              <li key={f}>
                Menü gizleme: <code className="font-mono">{f}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Rol görünürlüğü">
        <ul className="grid gap-2 sm:grid-cols-3">
          {ROLE_ROWS.map(([k, label]) => {
            const v = m.roles[k];
            return (
              <li key={k} className="flex items-center justify-between rounded-card border border-border px-3 py-2 text-sm">
                <span className="text-fg">{label}</span>
                {v === null ? <span className="text-fg-muted">Uygulanmaz</span> : <StatusBadge size="sm" tone={v ? 'success' : 'danger'} label={v ? 'Açık' : 'Kapalı'} />}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-fg-muted">
          Rol bazlı kapatma Ayar Merkezi’nde yönetilir.{' '}
          <Link className="font-medium text-brand underline-offset-2 hover:underline" href="/admin/settings?tab=page-settings">
            Sayfa görünürlüğünü aç
            <ExternalLink className="ml-0.5 inline h-3 w-3" aria-hidden />
          </Link>
        </p>
      </Section>

      <Section title="Son 24 saatte engellenen istekler">
        <KeyValueList
          layout="grid"
          columns={2}
          dense
          items={[
            { label: 'Genel kapatma', value: fmtNum(b.global) },
            { label: 'Rol kapatması', value: fmtNum(b.role) },
            { label: 'Kademeli açılış dışı', value: fmtNum(b.rollout) },
            { label: 'Toplam (oturumlu)', value: fmtNum(b.total) },
          ]}
        />
        <p className="text-xs text-fg-muted">{fx.anonBlocks}</p>
      </Section>

      <Section title="Değişiklik geçmişi">
        <QueryState query={history} skeleton="list" onRetry={() => history.refetch()} isEmpty={(d) => d.items.length === 0} empty={{ title: 'Kayıt yok', description: 'Bu modülde henüz değişiklik yapılmadı.' }}>
          {(d) => (
            <Timeline
              dense
              ariaLabel={`${m.label} değişiklik geçmişi`}
              events={d.items.map((it) => ({
                id: it.id,
                title: it.summary,
                description: it.reason ?? undefined,
                at: it.at,
                actor: it.actor ?? undefined,
                icon: History,
                tone: it.kind === 'module' ? (it.summary.includes('kapatıldı') ? 'danger' : 'success') : 'info',
              }))}
            />
          )}
        </QueryState>
      </Section>
    </div>
  );
}

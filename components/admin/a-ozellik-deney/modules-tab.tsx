'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { FilterBar, SectionCard, type FilterField } from '@/components/ds/page';
import { DataTable, DetailSheet, StatusBadge, useDetailSheet, type DataTableColumnMeta } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import {
  ENFORCEMENT_HINT,
  ENFORCEMENT_LABEL,
  SCOPE_LABEL,
  SEVERITY_LABEL,
  type Enforcement,
  type ModuleRow,
  type ModulesOverview,
  type ModuleScope,
  type ModuleSeverity,
} from '@/lib/admin-flags/contract';
import { fcKeys, patchModule } from './api';
import { ENFORCEMENT_TONE, SEVERITY_TONE, fmtAbs, fmtNum, fmtRel, norm } from './format';
import { ReasonDialog } from './reason-dialog';
import { ModuleDetail } from './module-detail';

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'Ad, anahtar, açıklama' },
  {
    type: 'select',
    key: 'scope',
    label: 'Kapsam',
    allLabel: 'Tüm kapsamlar',
    options: (Object.keys(SCOPE_LABEL) as ModuleScope[]).map((v) => ({ value: v, label: SCOPE_LABEL[v] })),
  },
  {
    type: 'select',
    key: 'state',
    label: 'Durum',
    allLabel: 'Açık ve kapalı',
    options: [
      { value: 'on', label: 'Açık' },
      { value: 'off', label: 'Kapalı' },
      { value: 'role', label: 'Rol için kapalı' },
    ],
  },
  {
    type: 'select',
    key: 'enf',
    label: 'Zorlama',
    allLabel: 'Tüm zorlama seviyeleri',
    options: (Object.keys(ENFORCEMENT_LABEL) as Enforcement[]).map((v) => ({ value: v, label: ENFORCEMENT_LABEL[v] })),
  },
  {
    type: 'select',
    key: 'sev',
    label: 'Önem',
    allLabel: 'Tüm önem seviyeleri',
    options: (Object.keys(SEVERITY_LABEL) as ModuleSeverity[]).map((v) => ({ value: v, label: SEVERITY_LABEL[v] })),
  },
  {
    type: 'select',
    key: 'sort',
    label: 'Sırala',
    allLabel: 'Katalog sırası',
    options: [
      { value: 'blocks', label: 'En çok engelleyen' },
      { value: 'severity', label: 'Önem (kritik önce)' },
      { value: 'recent', label: 'Son değişen' },
    ],
  },
];

const SEV_RANK: Record<ModuleSeverity, number> = { critical: 0, important: 1, optional: 2 };

function roleClosed(m: ModuleRow) {
  return m.roles.customer === false || m.roles.dealer === false || m.roles.system === false;
}

export function applyModuleFilters(rows: ModuleRow[], get: (k: string) => string | null): ModuleRow[] {
  const q = norm(get('q') ?? '');
  const scope = get('scope');
  const state = get('state');
  const enf = get('enf');
  const sev = get('sev');
  const sort = get('sort');
  let out = rows.filter((m) => {
    if (q && !norm(`${m.label} ${m.key} ${m.description}`).includes(q)) return false;
    if (scope && m.scope !== scope) return false;
    if (state === 'on' && !m.enabled) return false;
    if (state === 'off' && m.enabled) return false;
    if (state === 'role' && !roleClosed(m)) return false;
    if (enf && m.enforcement !== enf) return false;
    if (sev && m.severity !== sev) return false;
    return true;
  });
  if (sort === 'blocks') out = [...out].sort((a, b) => b.blocks24h.total - a.blocks24h.total);
  else if (sort === 'severity') out = [...out].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  else if (sort === 'recent') out = [...out].sort((a, b) => (b.lastChange?.at ?? '').localeCompare(a.lastChange?.at ?? ''));
  return out;
}

function RoleDots({ roles }: { roles: ModuleRow['roles'] }) {
  const items = [
    ['Müşteri', roles.customer],
    ['Bayi', roles.dealer],
    ['Sistem', roles.system],
  ] as const;
  const shown = items.filter(([, v]) => v !== null);
  if (!shown.length) return <span className="text-sm text-fg-muted">—</span>;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Rol görünürlüğü">
      {shown.map(([label, v]) => (
        <li key={label}>
          <StatusBadge size="sm" tone={v ? 'success' : 'danger'} label={`${label} ${v ? 'açık' : 'kapalı'}`} />
        </li>
      ))}
    </ul>
  );
}

type Pending = { row: ModuleRow; next: boolean };

export function ModulesTab({ query }: { query: UseQueryResult<ModulesOverview> }) {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const sheet = useDetailSheet('modul');
  const [pending, setPending] = useState<Pending | null>(null);
  const data = query.data;
  const rows = useMemo(() => (data ? applyModuleFilters(data.modules, (k) => sp.get(k)) : undefined), [data, sp]);
  const filtered = FIELDS.some((f) => sp.get(f.key));

  const columns = useMemo<ColumnDef<ModuleRow>[]>(
    () => [
      {
        id: 'module',
        header: 'Modül',
        enableSorting: false,
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-sm">
            <p className="truncate font-medium text-fg">{row.original.label}</p>
            <p className="truncate font-mono text-xs text-fg-muted" title={row.original.key}>
              {row.original.key}
            </p>
          </div>
        ),
      },
      {
        id: 'enforcement',
        header: 'Zorlama',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Zorlama' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const m = row.original;
          const n = m.bindings.api.length;
          return (
            <StatusBadge
              size="sm"
              tone={ENFORCEMENT_TONE[m.enforcement]}
              label={m.enforcement === 'api' ? `API kapısı · ${fmtNum(n)} uç` : ENFORCEMENT_LABEL[m.enforcement]}
              title={ENFORCEMENT_HINT[m.enforcement]}
            />
          );
        },
      },
      {
        id: 'scope',
        header: 'Kapsam',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Kapsam' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-sm text-fg">{SCOPE_LABEL[row.original.scope]}</span>
            {row.original.severity !== 'optional' ? <StatusBadge size="sm" tone={SEVERITY_TONE[row.original.severity]} label={SEVERITY_LABEL[row.original.severity]} /> : null}
          </div>
        ),
      },
      {
        id: 'roles',
        header: 'Rol görünürlüğü',
        enableSorting: false,
        meta: { mobile: 'hidden' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <RoleDots roles={row.original.roles} />,
      },
      {
        id: 'blocks',
        header: 'Engelleme (24 sa)',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Engelleme (24 sa)', numeric: true, align: 'end' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const b = row.original.blocks24h;
          return (
            <span className="tabular-nums text-sm text-fg" title={`Genel ${b.global} · Rol ${b.role} · Açılış ${b.rollout}`}>
              {b.total ? fmtNum(b.total) : '—'}
            </span>
          );
        },
      },
      {
        id: 'changed',
        header: 'Son değişiklik',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Son değişiklik' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const c = row.original.lastChange;
          if (!c) return <span className="text-sm text-fg-muted">—</span>;
          return (
            <span className="text-sm text-fg-muted">
              <time dateTime={c.at} title={fmtAbs(c.at)}>
                {fmtRel(c.at)}
              </time>
              {c.actor ? ` · ${c.actor}` : ''}
            </span>
          );
        },
      },
      {
        id: 'toggle',
        header: () => <span className="sr-only">Anahtar</span>,
        enableSorting: false,
        meta: { mobile: 'actions', interactive: true, align: 'end' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const m = row.original;
          const inertLocked = m.enforcement === 'none' && m.enabled;
          return (
            <div className="flex min-h-11 items-center justify-end gap-2 sm:min-h-0" onClick={(e) => e.stopPropagation()}>
              <span className={m.enabled ? 'text-sm text-fg' : 'text-sm font-medium text-danger'} aria-hidden>
                {m.enabled ? 'Açık' : 'Kapalı'}
              </span>
              <Switch
                checked={m.enabled}
                disabled={inertLocked}
                onCheckedChange={(next) => setPending({ row: m, next })}
                aria-label={`${m.label} modülünü ${m.enabled ? 'kapat' : 'aç'}`}
                title={inertLocked ? ENFORCEMENT_HINT.none : undefined}
              />
            </div>
          );
        },
      },
    ],
    []
  );

  const p = pending?.row;
  const impact = p
    ? [
        { label: 'Zorlama', value: ENFORCEMENT_LABEL[p.enforcement], emphasis: true },
        { label: 'Etkilenen API ucu', value: fmtNum(p.bindings.api.length), emphasis: p.bindings.api.length > 0 },
        { label: 'Sayfa / menü kapısı', value: `${fmtNum(p.bindings.pages.length)} sayfa · ${p.bindings.menu.length ? 'menüde' : 'menüde yok'}` },
        { label: 'Son 24 saatte engellenen', value: fmtNum(p.blocks24h.total) },
        ...(p.rollout?.active ? [{ label: 'Kademeli açılış', value: `%${p.rollout.percent} (kapatınca herkes için kapanır)` }] : []),
      ]
    : [];

  return (
    <SectionCard
      title="Modül anahtarları"
      description="Kapatmanın etkisi koddan taranır: API kapısı olan modüllerde bağlı uçlar 403 döner. Satıra tıklayınca bağlı uçlar, rol görünürlüğü ve geçmiş açılır."
    >
      <div className="space-y-4">
        <FilterBar fields={FIELDS} resetKeys={['modul']} />
        <p className="sr-only" aria-live="polite">
          {rows ? `${fmtNum(rows.length)} modül listeleniyor` : ''}
        </p>
        {data?.unknownKeys.length ? (
          <p className="text-sm text-fg-muted">
            Katalog dışı kapı anahtarları:{' '}
            {data.unknownKeys.map((u, i) => (
              <span key={u.key}>
                {i ? ', ' : ''}
                <code className="font-mono text-fg">{u.key}</code> ({u.files.length} dosya)
              </span>
            ))}
            . Bu kapılar kapatılamaz; kataloğa eklenmeleri gerekir.
          </p>
        ) : null}
        <DataTable
          ariaLabel="Modül anahtarları"
          columns={columns}
          data={rows}
          query={query}
          getRowId={(r) => r.key}
          getRowLabel={(r) => r.label}
          paginated={false}
          filtered={filtered}
          density="compact"
          onRowClick={(r) => sheet.open(r.key)}
          activeRowId={sheet.id}
          empty={
            filtered
              ? { title: 'Filtreye uyan modül yok', description: 'Filtreleri gevşetin ya da aramayı temizleyin.' }
              : { title: 'Katalogda modül yok', description: 'lib/module-controls.ts kataloğu boş.' }
          }
        />
      </div>

      <DetailSheet paramKey="modul" size="lg" title="Modül ayrıntısı" siblings={rows?.map((r) => r.key)}>
        {(key: string) => {
          const row = data?.modules.find((m) => m.key === key);
          return row ? <ModuleDetail row={row} onToggle={(next) => setPending({ row, next })} /> : <p className="text-sm text-fg-muted">Bu anahtar katalogda yok.</p>;
        }}
      </DetailSheet>

      <ReasonDialog
        open={pending !== null}
        onOpenChange={(v) => !v && setPending(null)}
        title={p ? `${p.label} ${pending?.next ? 'açılsın' : 'kapatılsın'} mı?` : ''}
        description={p ? ENFORCEMENT_HINT[p.enforcement] : undefined}
        impact={impact}
        warning={
          p && !pending?.next && p.severity === 'critical'
            ? 'Kritik modül. Kapatmak kullanıcıların bu özelliğe erişimini hemen keser (önbellek anında tazelenir).'
            : undefined
        }
        confirmPhrase={p && !pending?.next && p.severity === 'critical' ? p.key : undefined}
        tone={pending?.next ? 'brand' : 'danger'}
        confirmLabel={pending?.next ? 'Aç' : 'Kapat'}
        onConfirm={async (reason) => {
          if (!pending || !data) return;
          try {
            await patchModule(pending.row.key, { enabled: pending.next, reason, baseVersion: data.version });
          } catch (e) {
            await qc.invalidateQueries({ queryKey: fcKeys.overview() });
            throw e;
          }
          const msg = `${pending.row.label} ${pending.next ? 'açıldı' : 'kapatıldı'}.`;
          toast.success(msg);
          announce(msg);
          await qc.invalidateQueries({ queryKey: fcKeys.all });
        }}
      />
    </SectionCard>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AlertTriangle, KeyRound, Pencil, Plus, RefreshCcw, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar, SectionCard, useUrlState, type FilterField } from '@/components/ds/page';
import {
  DataTable,
  DetailSheet,
  KeyValueList,
  StatusBadge,
  Timeline,
  useDetailSheet,
  useUrlTableState,
  type DataTableColumnMeta,
} from '@/components/ds/data';
import { QueryState, TONE_CALLOUT } from '@/components/states';
import { scopeLabel, type ApiKeyItem, type Paged } from '@/lib/integrations/contract';
import { cn } from '@/lib/utils';
import { keyQs } from './qs';
import { errorText, fetchKey, fetchKeys, intKeys, revokeKey } from './api';
import { CreateKeyDialog, EditKeyDialog, RollKeyDialog } from './key-dialogs';
import { ReasonDialog } from './reason-dialog';
import { KEY_STATUS_META, expiryText, fmtAbs, fmtDay, fmtNum, fmtRel } from './format';
import { AdminEntegrasyonlarText } from './copy';

const FIELDS: FilterField[] = [
  { type: 'search', key: 'kq', label: 'Ara', placeholder: 'Ad ya da önek (qrx_…)' },
  {
    type: 'select',
    key: 'kstatus',
    label: 'Durum',
    allLabel: null,
    defaultValue: 'active',
    options: [
      { value: 'active', label: 'Etkin' },
      { value: 'expired', label: 'Süresi dolan' },
      { value: 'revoked', label: 'İptal edilen' },
      { value: 'all', label: 'Tümü' },
    ],
  },
];

function ScopeChips({ item }: { item: ApiKeyItem }) {
  if (item.scopeless) {
    return <StatusBadge size="sm" tone="warning" label="Kapsam yok · korumalı uçlarda çalışmaz" />;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {item.scopes.map((s) => (
        <StatusBadge key={s} size="sm" tone={s === '*' ? 'danger' : 'info'} icon={null} label={scopeLabel(s)} />
      ))}
    </div>
  );
}

/** API anahtarları: kapsamlı, süreli, bayiye/partnere bağlanabilir; iptal/rotasyon, kullanım ve denetim. */
export function KeysTab({ initial }: { initial: { qs: string; page: Paged<ApiKeyItem> } | null }) {
  const sp = useSearchParams();
  const { get, set } = useUrlState();
  const qs = keyQs((k) => sp.get(k));
  const table = useUrlTableState({ pageKey: 'kpage', sizeKey: 'ksize', sortKey: 'ksort' });
  const sheet = useDetailSheet('key');
  const creating = get('create') === 'key';

  const list = useQuery({
    queryKey: intKeys.keys(qs),
    queryFn: ({ signal }) => fetchKeys(qs, signal),
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const columns = useMemo<ColumnDef<ApiKeyItem>[]>(
    () => [
      {
        id: 'name',
        header: 'Anahtar',
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{row.original.name}</p>
            <p className="font-mono text-xs text-fg-muted">{row.original.display}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Durum',
        meta: { mobile: 'field', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" tone={KEY_STATUS_META[row.original.status].tone} label={KEY_STATUS_META[row.original.status].label} />,
      },
      {
        id: 'scope',
        header: 'Kapsam',
        meta: { mobile: 'field', label: 'Kapsam' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <ScopeChips item={row.original} />,
      },
      {
        id: 'reach',
        header: 'Erişim alanı',
        meta: { mobile: 'field', label: 'Erişim alanı' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="text-sm">
            <p>{row.original.dealer ? row.original.dealer.label : 'Platform geneli'}</p>
            {row.original.partner ? <p className="text-xs text-fg-muted">Partner: {row.original.partner.label}</p> : null}
          </div>
        ),
      },
      {
        id: 'lastUsed',
        header: 'Son kullanım',
        meta: { mobile: 'subtitle' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const k = row.original;
          const idle = !k.lastUsedAt || Date.parse(k.lastUsedAt) < Date.now() - 90 * 86_400_000;
          return (
            <span className="whitespace-nowrap text-sm text-fg-muted">
              {k.lastUsedAt ? (
                <time dateTime={k.lastUsedAt} title={fmtAbs(k.lastUsedAt)}>
                  {fmtRel(k.lastUsedAt)}
                </time>
              ) : (
                'Hiç kullanılmadı'
              )}
              {idle && k.status === 'active' ? <span className="ml-1 text-warning"><AdminEntegrasyonlarText k="idle" /></span> : null}
            </span>
          );
        },
      },
      {
        id: 'expires',
        header: 'Geçerlilik',
        meta: { mobile: 'field', label: 'Geçerlilik' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="whitespace-nowrap text-sm text-fg-muted">{row.original.status === 'revoked' ? `İptal · ${fmtAbs(row.original.revokedAt)}` : expiryText(row.original.expiresAt)}</span>,
      },
      {
        id: 'createdBy',
        header: 'Oluşturan',
        meta: { mobile: 'hidden' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="text-sm text-fg-muted">
            {row.original.createdBy ?? 'Silinmiş kullanıcı'} · <time dateTime={row.original.createdAt}>{fmtAbs(row.original.createdAt)}</time>
          </span>
        ),
      },
    ],
    []
  );

  return (
    <SectionCard
      title="API anahtarları"
      description="Partner API'si (/api/partner/v1/*) için Bearer anahtarları. Yalnız SHA-256 özeti saklanır; ham anahtar oluşturulurken bir kez gösterilir."
      actions={
        <Button className="min-h-11 sm:min-h-10" onClick={() => set({ create: 'key' }, { history: 'push' })}>
          <Plus className="h-4 w-4" aria-hidden />
          Yeni anahtar
        </Button>
      }
    >
      <div className="space-y-4">
        <FilterBar fields={FIELDS} resetKeys={['kpage']} />
        <DataTable
          ariaLabel="API anahtarları"
          columns={columns}
          data={list.data?.items}
          query={list}
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.name}
          manualPagination
          rowCount={list.data?.total}
          pagination={table.pagination}
          onPaginationChange={table.onPaginationChange}
          filtered={Boolean(sp.get('kq') || (sp.get('kstatus') && sp.get('kstatus') !== 'active'))}
          onRowClick={(r) => sheet.open(r.id)}
          activeRowId={sheet.id}
          empty={{
            icon: KeyRound,
            title: 'Etkin API anahtarı yok',
            description: 'POS, BI ya da partner entegrasyonu için kapsamlı ve süreli bir anahtar oluşturun.',
            action: (
              <Button className="min-h-11" onClick={() => set({ create: 'key' }, { history: 'push' })}>
                <Plus className="h-4 w-4" aria-hidden /> Yeni anahtar
              </Button>
            ),
          }}
        />
      </div>

      <DetailSheet paramKey="key" size="lg" title="Anahtar ayrıntısı" siblings={list.data?.items.map((r) => r.id)}>
        {(id: string) => <KeyDetailView id={id} />}
      </DetailSheet>

      <CreateKeyDialog open={creating} onOpenChange={(v) => set(v ? { create: 'key' } : { create: null, partner: null })} presetPartnerId={get('partner')} />
    </SectionCard>
  );
}

function UsageBars({ usage }: { usage: { day: string; ok: number; denied: number }[] }) {
  const max = Math.max(1, ...usage.map((u) => u.ok + u.denied));
  const total = usage.reduce((a, u) => a + u.ok, 0);
  const denied = usage.reduce((a, u) => a + u.denied, 0);
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm text-fg-muted">
        <AdminEntegrasyonlarText k="last14d" /> <strong className="text-fg">{fmtNum(total)}</strong> <AdminEntegrasyonlarText k="successfulRequests" /> <strong className={denied ? 'text-danger' : 'text-fg'}>{fmtNum(denied)}</strong> <AdminEntegrasyonlarText k="deniedRequests" />
      </figcaption>
      <div className="flex h-24 items-end gap-1" aria-hidden>
        {usage.map((u) => (
          <div key={u.day} className="flex flex-1 flex-col justify-end gap-px" title={`${fmtDay(u.day)}: ${u.ok} başarılı, ${u.denied} reddedilen`}>
            {u.denied > 0 ? <div className="rounded-sm bg-danger/70" style={{ height: `${(u.denied / max) * 100}%` }} /> : null}
            <div className="min-h-px rounded-sm bg-brand" style={{ height: `${(u.ok / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption><AdminEntegrasyonlarText k="dailyRequests" /></caption>
        <thead>
          <tr>
            <th><AdminEntegrasyonlarText k="day" /></th>
            <th><AdminEntegrasyonlarText k="successful" /></th>
            <th>Reddedilen</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((u) => (
            <tr key={u.day}>
              <td>{fmtDay(u.day)}</td>
              <td>{u.ok}</td>
              <td>{u.denied}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function KeyDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: intKeys.key(id), queryFn: ({ signal }) => fetchKey(id, signal), staleTime: 10_000 });
  const [dialog, setDialog] = useState<'edit' | 'roll' | 'revoke' | null>(null);

  return (
    <QueryState query={detail} skeleton="detail">
      {(d) => {
        const k = d.key;
        const active = k.status === 'active';
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-lg font-semibold text-fg">{k.name}</p>
              <p className="font-mono text-sm text-fg-muted">{k.display}</p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={KEY_STATUS_META[k.status].tone} label={KEY_STATUS_META[k.status].label} />
                <ScopeChips item={k} />
              </div>
            </div>

            {k.scopeless ? (
              <p className={cn('flex items-start gap-2 rounded-card border p-3 text-sm', TONE_CALLOUT.warning)}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Bu eski anahtarın kapsamı yok; korumalı uçlar (ör. bayi özeti) 403 döner. “Düzenle” ile kapsam verin.
              </p>
            ) : null}

            {active ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-11" onClick={() => setDialog('edit')}>
                  <Pencil className="h-4 w-4" aria-hidden /> Düzenle
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => setDialog('roll')}>
                  <RefreshCcw className="h-4 w-4" aria-hidden /> Döndür
                </Button>
                <Button variant="destructive" className="min-h-11" onClick={() => setDialog('revoke')}>
                  <ShieldOff className="h-4 w-4" aria-hidden /> İptal et
                </Button>
              </div>
            ) : null}

            <KeyValueList
              items={[
                { label: 'Erişim alanı', value: k.dealer ? `Bayi: ${k.dealer.label}` : 'Platform geneli' },
                { label: 'Partner', value: k.partner?.label ?? 'Partnersiz' },
                { label: 'Geçerlilik', value: k.status === 'revoked' ? `İptal edildi · ${fmtAbs(k.revokedAt)}` : expiryText(k.expiresAt), hint: k.revokeReason ?? undefined },
                { label: 'IP izin listesi', value: k.ipAllowlist.length ? k.ipAllowlist.join(', ') : 'Kısıt yok' },
                { label: 'Son kullanım', value: k.lastUsedAt ? `${fmtRel(k.lastUsedAt)} · ${fmtAbs(k.lastUsedAt)}` : 'Hiç kullanılmadı' },
                { label: 'Oluşturan', value: `${k.createdBy ?? 'Silinmiş kullanıcı'} · ${fmtAbs(k.createdAt)}` },
                ...(k.rolledToId ? [{ label: 'Döndürüldü', value: 'Yerine yeni anahtar üretildi; bu anahtar ek süre sonunda kapanır.' }] : []),
              ]}
            />

            <section aria-labelledby={`usage-${id}`} className="space-y-2">
              <h3 id={`usage-${id}`} className="text-sm font-semibold text-fg">
                Kullanım
              </h3>
              {d.usage ? <UsageBars usage={d.usage} /> : <p className="text-sm text-fg-muted"><AdminEntegrasyonlarText k="noRedis" /></p>}
            </section>

            <section aria-labelledby={`audit-${id}`} className="space-y-2">
              <h3 id={`audit-${id}`} className="text-sm font-semibold text-fg">
                Etkinlik
              </h3>
              <Timeline
                dense
                events={d.audit.map((a) => ({ id: a.id, title: a.label, description: a.detail ?? undefined, at: a.at, actor: a.actor ?? undefined }))}
                emptyLabel="Bu anahtar için denetim kaydı yok."
              />
            </section>

            <EditKeyDialog item={k} open={dialog === 'edit'} onOpenChange={(v) => setDialog(v ? 'edit' : null)} />
            <RollKeyDialog item={k} open={dialog === 'roll'} onOpenChange={(v) => setDialog(v ? 'roll' : null)} />
            <ReasonDialog
              open={dialog === 'revoke'}
              onOpenChange={(v) => setDialog(v ? 'revoke' : null)}
              title={`“${k.name}” iptal edilsin mi?`}
              description="İptal edilen anahtar bir sonraki istekte 401 alır. Kayıt silinmez; “İptal edilen” filtresinde kalır."
              confirmLabel="Anahtarı iptal et"
              onConfirm={async (reason) => {
                await revokeKey(k.id, reason);
                toast.success('Anahtar iptal edildi.');
                void qc.invalidateQueries({ queryKey: intKeys.all });
              }}
            />
          </div>
        );
      }}
    </QueryState>
  );
}


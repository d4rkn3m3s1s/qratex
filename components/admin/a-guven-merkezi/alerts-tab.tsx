'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Check, CheckCheck, Eye, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar, SectionCard, type FilterField } from '@/components/ds/page';
import { DataTable, SeverityBadge, StatusBadge, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { alertQsFromParams, type AlertItem, type Paged } from '@/lib/admin-trust/contract';
import { alertAction, errorText, fetchAlerts, trustKeys } from './api';
import { fmtAbs, fmtNum, fmtRel, toDsSeverity } from './format';

const FIELDS: FilterField[] = [
  {
    type: 'select',
    key: 'astatus',
    label: 'Durum',
    allLabel: null,
    defaultValue: 'open',
    options: [
      { value: 'open', label: 'Açık' },
      { value: 'unread', label: 'Okunmamış' },
      { value: 'resolved', label: 'Çözülen' },
      { value: 'all', label: 'Tümü' },
    ],
  },
];

/**
 * Güvenlik uyarıları (SecurityAlert): kaba kuvvet kilitleri ve kritik şüpheli olaylar.
 * Okundu / çözüldü yaşam döngüsü artık gerçekten işletiliyor (önceden hiçbir kod güncellemiyordu).
 */
export function AlertsTab({ initial }: { initial: { qs: string; page: Paged<AlertItem> } | null }) {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const qs = alertQsFromParams((k) => sp.get(k));
  const table = useUrlTableState({ pageKey: 'apage', sizeKey: 'asize', sortKey: 'asort' });

  const list = useQuery({
    queryKey: trustKeys.alerts(qs),
    queryFn: ({ signal }) => fetchAlerts(qs, signal),
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const act = useMutation({
    mutationFn: alertAction,
    onSuccess: (r, v) => {
      const verb = v.action === 'read' ? 'okundu olarak işaretlendi' : v.action === 'resolve' ? 'çözüldü' : 'yeniden açıldı';
      toast.success(`${fmtNum(r.updated)} uyarı ${verb}.`);
      void qc.invalidateQueries({ queryKey: trustKeys.all });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const columns = useMemo<ColumnDef<AlertItem>[]>(
    () => [
      {
        id: 'severity',
        header: 'Önem',
        meta: { mobile: 'field', label: 'Önem' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <SeverityBadge severity={toDsSeverity(row.original.severity)} size="sm" emphasize />,
      },
      {
        id: 'message',
        header: 'Uyarı',
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className={`text-sm ${row.original.isRead ? 'text-fg-muted' : 'font-medium text-fg'}`}>{row.original.message}</p>
            <p className="text-xs text-fg-muted">{row.original.typeLabel}</p>
          </div>
        ),
      },
      {
        id: 'state',
        header: 'Durum',
        meta: { mobile: 'field', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.isResolved ? (
            <StatusBadge size="sm" tone="success" label="Çözüldü" />
          ) : row.original.isRead ? (
            <StatusBadge size="sm" tone="info" label="Okundu" />
          ) : (
            <StatusBadge size="sm" tone="warning" label="Yeni" />
          ),
      },
      {
        id: 'createdAt',
        header: 'Zaman',
        meta: { mobile: 'subtitle' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} title={fmtAbs(row.original.createdAt)} className="whitespace-nowrap text-sm text-fg-muted">
            {fmtRel(row.original.createdAt)}
          </time>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        meta: { mobile: 'actions', interactive: true, label: 'İşlemler' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.isResolved ? (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 sm:min-h-9"
              disabled={act.isPending}
              onClick={() => act.mutate({ ids: [row.original.id], action: 'reopen' })}
              aria-label={`Uyarıyı yeniden aç: ${row.original.message}`}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 sm:min-h-9"
              disabled={act.isPending}
              onClick={() => act.mutate({ ids: [row.original.id], action: 'resolve' })}
              aria-label={`Uyarıyı çöz: ${row.original.message}`}
            >
              <Check className="h-4 w-4" aria-hidden />
              Çöz
            </Button>
          ),
      },
    ],
    [act],
  );

  return (
    <SectionCard
      title="Güvenlik uyarıları"
      description="Hesap kilitleri (5 hatalı giriş) ve yüksek önemli şüpheli olaylar. Okundu ve çözüldü bilgisi tüm yöneticiler için ortaktır."
    >
      <div className="space-y-4">
        <FilterBar fields={FIELDS} resetKeys={['apage']} />
        <DataTable
          ariaLabel="Güvenlik uyarıları"
          columns={columns}
          data={list.data?.items}
          query={list}
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.message}
          manualPagination
          rowCount={list.data?.total}
          pagination={table.pagination}
          onPaginationChange={table.onPaginationChange}
          filtered={Boolean(sp.get('astatus') && sp.get('astatus') !== 'open')}
          enableRowSelection
          bulkActions={({ ids, clear }) => (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={act.isPending} onClick={() => act.mutate({ ids, action: 'read' }, { onSuccess: clear })}>
                <Eye className="h-4 w-4" aria-hidden />
                Okundu
              </Button>
              <Button size="sm" className="min-h-11 sm:min-h-9" disabled={act.isPending} onClick={() => act.mutate({ ids, action: 'resolve' }, { onSuccess: clear })}>
                <CheckCheck className="h-4 w-4" aria-hidden />
                Çöz
              </Button>
            </div>
          )}
          empty={{ title: 'Uyarı yok', description: 'Bu filtrede güvenlik uyarısı bulunmuyor.' }}
        />
      </div>
    </SectionCard>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ExternalLink, History, Lock, RotateCcw, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, SeverityBadge, StatusBadge } from '@/components/ds/data';
import { ConfirmAction, EmptyState, QueryState } from '@/components/states';
import { TONE_CALLOUT } from '@/components/states/tone';
import { CATEGORY_LABEL, SEVERITY_LABEL } from '@/lib/admin-audit/catalog';
import { ACTOR_KIND_LABEL, ROLE_LABEL, type AuditActor, type AuditDetail, type DiffRow } from '@/lib/admin-audit/contract';
import { cn } from '@/lib/utils';
import { REVERT_LABEL, auditKeys, errorText, fetchAuditDetail, revertEntry } from './api';
import { CATEGORY_ICON, SEVERITY_TO_DS, fmtAgo, fmtDateTime, fmtFull } from './format';

export function actorText(a: AuditActor): string {
  if (a.kind === 'system' || a.kind === 'cron') return ACTOR_KIND_LABEL[a.kind];
  const who = a.name ?? a.email;
  if (a.deleted) return who ? `${who} (silinmiş)` : 'Silinmiş kullanıcı';
  return who ?? 'Adsız kullanıcı';
}

const qsOf = (patch: Record<string, string>) => `?${new URLSearchParams(patch).toString()}`;

/** Denetim kaydı detayı: özet cümle, aktör/hedef, alan bazlı fark, ham JSON, geri alma, ilgili kayıtlar. */
export function AuditDetailBody({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const q = useQuery({ queryKey: auditKeys.detail(id), queryFn: ({ signal }) => fetchAuditDetail(id, signal), staleTime: 60_000 });
  return (
    <QueryState query={q} error={{ title: 'Kayıt yüklenemedi' }} isEmpty={() => false}>
      {(d: AuditDetail) => <DetailView d={d} onOpen={onOpen} />}
    </QueryState>
  );
}

function DetailView({ d, onOpen }: { d: AuditDetail; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [view, setView] = useState<'diff' | 'raw'>('diff');
  const [showSame, setShowSame] = useState(false);
  const Icon = CATEGORY_ICON[d.category];
  const a = d.actor;
  const changed = d.diff.filter((r) => r.change !== 'same');
  const same = d.diff.length - changed.length;
  const rows = showSame ? d.diff : changed;
  const hasData = d.oldData != null || d.newData != null;

  return (
    <div className="space-y-5">
      <section aria-label="Özet" className="space-y-2">
        <p className="text-base leading-relaxed text-fg">
          <strong className="font-semibold">{actorText(a)}</strong>, <time dateTime={d.at}>{fmtDateTime(d.at)}</time> tarihinde{' '}
          <strong className="font-semibold">{d.label}</strong>
          {d.diff.length > 0 && changed.length > 0 ? ` — ${changed.length} alan değişti` : ''}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={SEVERITY_TO_DS[d.severity]} label={SEVERITY_LABEL[d.severity]} emphasize size="sm" />
          <StatusBadge label={CATEGORY_LABEL[d.category]} icon={Icon} tone="neutral" size="sm" srPrefix="Kategori" />
        </div>
      </section>

      {a.deleted ? (
        <div role="note" className={cn('rounded-lg border p-3 text-sm', TONE_CALLOUT.warning)}>
          {a.fromSnapshot
            ? 'Bu işlemi yapan hesap silinmiş; aktör bilgisi işlem anında kaydedilen anlık görüntüden gösteriliyor.'
            : 'Bu işlemi yapan hesap silinmiş ve kayıt, aktör anlık görüntüsü tutulmaya başlanmadan önce yazılmış; kimlik bilinmiyor.'}
        </div>
      ) : null}

      <KeyValueList
        touchTarget
        items={[
          { id: 'at', label: 'Zaman', value: <time dateTime={d.at}>{fmtFull(d.at)}</time>, hint: fmtAgo(d.at) },
          {
            id: 'actor',
            label: 'Aktör',
            value: (
              <span className="inline-flex flex-wrap items-center gap-2">
                <UserRound className="h-4 w-4 text-fg-muted" aria-hidden />
                {a.userId ? (
                  <Link href={`/admin/users/${encodeURIComponent(a.userId)}`} className="font-medium underline underline-offset-2">
                    {actorText(a)}
                  </Link>
                ) : (
                  <span className="font-medium">{actorText(a)}</span>
                )}
                {a.role ? <StatusBadge label={ROLE_LABEL[a.role] ?? a.role} tone={a.role === 'ADMIN' ? 'brand' : 'neutral'} size="sm" icon={null} srPrefix="Rol" /> : null}
              </span>
            ),
            hint: a.email && a.name ? a.email : a.fromSnapshot ? 'İşlem anındaki anlık görüntü' : ACTOR_KIND_LABEL[a.kind],
          },
          { id: 'action', label: 'Eylem kodu', value: d.action, mono: true, copyValue: d.action },
          { id: 'entity', label: 'Varlık', value: `${d.entityLabel}${d.entityLabel !== d.entity ? ` (${d.entity})` : ''}` },
          {
            id: 'entityId',
            label: 'Varlık kimliği',
            value: d.entityId ? (
              d.entityHref ? (
                <Link href={d.entityHref} className="inline-flex items-center gap-1 break-all underline underline-offset-2">
                  {d.entityId}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </Link>
              ) : (
                <span className="break-all">{d.entityId}</span>
              )
            ) : null,
            mono: true,
            copyValue: d.entityId ?? undefined,
          },
          { id: 'ip', label: 'IP adresi', value: d.ip, hint: d.ip ? 'Maskeli gösterilir' : 'Kaydedilmemiş', mono: true },
          { id: 'device', label: 'Cihaz', value: d.device, hint: d.userAgent ?? undefined },
          { id: 'id', label: 'Kayıt no', value: d.id, mono: true, copyValue: d.id },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {a.userId ? (
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link href={qsOf({ aktor: a.userId })}>
              <UserRound className="h-4 w-4" aria-hidden />
              Bu aktörün tüm kayıtları
            </Link>
          </Button>
        ) : null}
        {d.entityId ? (
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link href={qsOf({ varlik: d.entity, q: d.entityId })}>
              <History className="h-4 w-4" aria-hidden />
              Bu kaydın geçmişi
            </Link>
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="audit-changes" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="audit-changes" className="text-sm font-semibold text-fg">
            Ne değişti?
          </h3>
          {hasData ? (
            <div role="group" aria-label="Görünüm" className="inline-flex rounded-control border border-border p-0.5">
              {(['diff', 'raw'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    'min-h-10 rounded-control px-3 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    view === v ? 'bg-surface-muted font-medium text-fg' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {v === 'diff' ? 'Alan farkı' : 'Ham JSON'}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {d.redactedCount > 0 ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Gizli değerler (anahtar, şifre, token) maskelendi; değişip değişmedikleri yine görünür.
          </p>
        ) : null}

        {!hasData ? (
          <EmptyState title="Bu kayıt veri gövdesi içermiyor" description="İşlemi yazan uç önceki/sonraki değeri kaydetmemiş; yalnız kim, ne zaman ve hangi kayıt bilgisi var." />
        ) : view === 'raw' ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <RawBlock title="Önce" value={d.oldData} />
            <RawBlock title="Sonra" value={d.newData} />
          </div>
        ) : (
          <>
            {changed.length === 0 ? <p className="text-sm text-fg-muted">Önceki ve sonraki değer arasında alan farkı yok.</p> : null}
            {rows.length > 0 ? <DiffTable rows={rows} /> : null}
            {same > 0 ? (
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setShowSame((s) => !s)} aria-expanded={showSame}>
                {showSame ? 'Değişmeyen alanları gizle' : `Değişmeyen ${same} alanı göster`}
              </Button>
            ) : null}
            {d.diffTruncated ? <p className="text-xs text-fg-muted">Fark ilk 400 alanla sınırlandı; tamamı için Ham JSON görünümüne geçin.</p> : null}
          </>
        )}
      </section>

      {d.revert ? (
        <section aria-labelledby="audit-revert" className={cn('space-y-2 rounded-lg border p-3', TONE_CALLOUT.info)}>
          <h3 id="audit-revert" className="text-sm font-semibold">
            Geri al
          </h3>
          <p className="text-sm">{REVERT_LABEL[d.revert.kind]}. Geri alma yeni bir denetim kaydı üretir; mevcut değerler o kayıtta “önce” olarak saklanır.</p>
          <ConfirmAction
            tone="warning"
            title="Bu değişiklik geri alınsın mı?"
            description={`${d.label} (${fmtDateTime(d.at)}) kaydındaki önceki değerler yeniden yazılacak. Bu kayıttan sonra yapılan değişiklikler de üzerine yazılabilir.`}
            confirmLabel="Geri al"
            irreversibleNote={false}
            trigger={
              <Button variant="outline" className="min-h-11">
                <RotateCcw className="h-4 w-4" aria-hidden />
                Geri al
              </Button>
            }
            onConfirm={async () => {
              try {
                await revertEntry(d.revert!.endpoint, d.id);
                toast.success('Değişiklik geri alındı.');
                await qc.invalidateQueries({ queryKey: auditKeys.all });
              } catch (e) {
                toast.error(errorText(e, 'Geri alma başarısız.'));
                throw e;
              }
            }}
          />
        </section>
      ) : null}

      {d.related.length > 0 ? (
        <section aria-labelledby="audit-related" className="space-y-2">
          <h3 id="audit-related" className="text-sm font-semibold text-fg">
            Aynı kaydın diğer olayları
          </h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {d.related.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <time dateTime={r.at} className="tabular-nums text-fg-muted">
                    {fmtDateTime(r.at)}
                  </time>
                  <span className="font-medium text-fg">{r.label}</span>
                  <span className="text-fg-muted">{r.actorLabel}</span>
                  {r.severity !== 'normal' ? <SeverityBadge severity={SEVERITY_TO_DS[r.severity]} label={SEVERITY_LABEL[r.severity]} size="sm" className="ml-auto" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const CHANGE_LABEL: Record<DiffRow['change'], string> = { changed: 'Değişti', added: 'Eklendi', removed: 'Kaldırıldı', same: 'Aynı' };

function DiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">Alan bazlı önce/sonra farkı</caption>
        <thead className="bg-surface-muted text-left text-xs text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Alan
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Önce
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Sonra
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.path} className={r.change === 'same' ? 'text-fg-muted' : undefined}>
              <th scope="row" className="max-w-[12rem] break-all px-3 py-2 text-left align-top font-mono text-xs font-normal">
                {r.path}
                <span className="mt-1 block font-sans text-[11px] text-fg-muted">
                  {CHANGE_LABEL[r.change]}
                  {r.secret ? ' · gizli' : ''}
                </span>
              </th>
              <td className="px-3 py-2 align-top">
                <Value v={r.before} tone={r.change === 'changed' || r.change === 'removed' ? 'old' : null} />
              </td>
              <td className="px-3 py-2 align-top">
                <Value v={r.after} tone={r.change === 'changed' || r.change === 'added' ? 'new' : null} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Value({ v, tone }: { v: string | null; tone: 'old' | 'new' | null }) {
  if (v === null) return <span className="text-fg-muted">—</span>;
  return (
    <span
      className={cn(
        'block whitespace-pre-wrap break-all rounded px-1.5 py-0.5 font-mono text-xs',
        tone === 'old' && 'bg-danger-subtle text-fg line-through',
        tone === 'new' && 'bg-success-subtle text-fg'
      )}
    >
      {tone === 'old' ? <span className="sr-only">Önceki değer: </span> : tone === 'new' ? <span className="sr-only">Yeni değer: </span> : null}
      {v}
    </span>
  );
}

function RawBlock({ title, value }: { title: string; value: unknown }) {
  const text = value == null ? 'null' : JSON.stringify(value, null, 2);
  return (
    <figure className="min-w-0 space-y-1">
      <figcaption className="flex items-center justify-between text-xs font-medium text-fg-muted">
        {title}
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => {
            navigator.clipboard
              ?.writeText(text)
              .then(() => toast.success('Kopyalandı.'))
              .catch(() => toast.error('Kopyalanamadı.'));
          }}
        >
          <Copy className="h-4 w-4" aria-hidden />
          Kopyala
        </Button>
      </figcaption>
      <pre tabIndex={0} aria-label={`${title} JSON`} className="max-h-80 overflow-auto rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed">
        {text}
      </pre>
    </figure>
  );
}

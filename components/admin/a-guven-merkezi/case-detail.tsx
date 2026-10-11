'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, CheckCircle2, ExternalLink, RotateCcw, ShieldOff, Undo2, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, SeverityBadge, StatusBadge, Timeline, useDetailSheet } from '@/components/ds/data';
import { EmptyState, QueryState, SectionCard } from '@/components/states';
import {
  FRAUD_STATUSES,
  FRAUD_STATUS_LABEL,
  RESOLUTION_CODES,
  RESOLUTION_LABEL,
  type CaseDetail,
  type FraudStatus,
  type LedgerRow,
  type ResolutionCode,
  type SubjectProfile,
} from '@/lib/admin-trust/contract';
import { caseAction, fetchCase, reverseLedger, subjectAction, trustKeys } from './api';
import { LEDGER_STATUS_LABEL, ROLE_LABEL, fmtAbs, fmtNum, fmtRel, ledgerSourceLabel, subjectText, toDsSeverity } from './format';
import { ReasonDialog } from './reason-dialog';
import { AdminGuvenMerkeziText } from './copy';

const RESOLUTION_CHOICES = RESOLUTION_CODES.map((c) => ({ value: c, label: RESOLUTION_LABEL[c] }));
const FRAUD_TONE: Record<FraudStatus, 'success' | 'warning' | 'danger'> = { clean: 'success', flagged: 'warning', shadow_ban: 'danger' };

function useCase(id: string) {
  return useQuery({ queryKey: trustKeys.caseDetail(id), queryFn: ({ signal }) => fetchCase(id, signal), staleTime: 10_000 });
}

function useRefreshAll() {
  const qc = useQueryClient();
  return (id: string, next?: CaseDetail) => {
    if (next) qc.setQueryData(trustKeys.caseDetail(id), next);
    void qc.invalidateQueries({ queryKey: trustKeys.all });
  };
}

/** Çekmece altı sabit aksiyon çubuğu: çöz / yeniden aç. */
export function CaseDetailFooter({ id }: { id: string }) {
  const q = useCase(id);
  const refresh = useRefreshAll();
  const [open, setOpen] = useState<'resolve' | 'reopen' | null>(null);
  const c = q.data;
  if (!c) return null;
  return (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {c.isResolved ? (
        <Button variant="outline" className="min-h-11" onClick={() => setOpen('reopen')}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Yeniden aç
        </Button>
      ) : (
        <Button className="min-h-11" onClick={() => setOpen('resolve')}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Vakayı çöz
        </Button>
      )}
      <ReasonDialog<ResolutionCode>
        open={open === 'resolve'}
        onOpenChange={(v) => setOpen(v ? 'resolve' : null)}
        title="Vaka çözülsün mü?"
        description="Karar ve gerekçe vakaya ve denetim günlüğüne yazılır. Gerekirse sonra yeniden açabilirsiniz."
        choices={RESOLUTION_CHOICES}
        confirmLabel="Çöz"
        onConfirm={async ({ note, choice }) => {
          if (!choice) return;
          const next = await caseAction(id, { action: 'resolve', code: choice, note });
          toast.success('Vaka çözüldü.');
          refresh(id, next);
        }}
      />
      <ReasonDialog
        open={open === 'reopen'}
        onOpenChange={(v) => setOpen(v ? 'reopen' : null)}
        title="Vaka yeniden açılsın mı?"
        description="Önceki çözüm kaydı denetim günlüğünde kalır; vaka tekrar kuyruğa döner."
        confirmLabel="Yeniden aç"
        tone="warning"
        onConfirm={async ({ note }) => {
          const next = await caseAction(id, { action: 'reopen', note });
          toast.success('Vaka yeniden açıldı.');
          refresh(id, next);
        }}
      />
    </div>
  );
}

export function CaseDetailView({ id }: { id: string }) {
  const q = useCase(id);
  return (
    <QueryState query={q} skeleton="detail" onRetry={() => q.refetch()}>
      {(c) => <CaseBody c={c} />}
    </QueryState>
  );
}

function CaseBody({ c }: { c: CaseDetail }) {
  const sheet = useDetailSheet('case');
  const subj = subjectText(c.subject);
  const meta = c.metadata && typeof c.metadata === 'object' ? (c.metadata as Record<string, unknown>) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={toDsSeverity(c.severity)} emphasize />
        <StatusBadge tone="neutral" icon={null} label={c.typeLabel} />
        {c.isResolved ? (
          <StatusBadge tone={c.resolutionCode === 'confirmed' ? 'danger' : 'success'} label={c.resolutionCode ? RESOLUTION_LABEL[c.resolutionCode] : 'Çözüldü'} />
        ) : (
          <StatusBadge tone="warning" label="Açık" />
        )}
      </div>
      <p className="text-sm text-fg">{c.description}</p>

      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          { label: 'Oluşturma', value: <time dateTime={c.createdAt}>{fmtAbs(c.createdAt)}</time>, hint: fmtRel(c.createdAt) },
          { label: 'Özne', value: subj.title, hint: subj.sub },
          { label: 'Bayi', value: c.dealer?.name ?? null },
          { label: 'IP adresi', value: c.ipAddress, copyValue: c.ipAddress ?? undefined, mono: true },
          { label: 'Kart', value: c.cardId, copyValue: c.cardId ?? undefined, mono: true },
          { label: 'Vaka no', value: c.id, copyValue: c.id, mono: true },
          ...(meta && typeof meta.value === 'number' && typeof meta.threshold === 'number'
            ? [{ label: 'Ölçülen / eşik', value: `${fmtNum(meta.value)} / ${fmtNum(meta.threshold)}` }]
            : []),
          ...(c.userAgent ? [{ label: 'Tarayıcı', value: <span className="break-all text-xs">{c.userAgent}</span> }] : []),
        ]}
      />

      {c.resolution ? (
        <SectionCard title="Çözüm" density="compact" tone={c.resolution.code === 'confirmed' ? 'danger' : 'success'} stripe>
          <p className="text-sm text-fg">{c.resolution.note || '—'}</p>
          <p className="mt-1 text-xs text-fg-muted">
            {c.resolution.by?.name ?? 'Bilinmeyen yönetici'} · {fmtAbs(c.resolvedAt)}
          </p>
        </SectionCard>
      ) : null}

      {c.profile ? <SubjectCard caseId={c.id} profile={c.profile} /> : c.subject.kind === 'identifier' ? (
        <EmptyState
          variant="no-results"
          title="Hesap eşleşmedi"
          description="Bu giriş denemesindeki tanımlayıcıya karşılık gelen bir hesap bulunamadı; hesap aksiyonu yok."
        />
      ) : null}

      {c.profile ? <LedgerCard caseId={c.id} rows={c.ledger} /> : null}

      {c.sameIpAccounts.length ? (
        <SectionCard title="Aynı IP'deki hesaplar" description="Son 30 günün denetim kayıtlarından (ya da kuralın yakaladığı grup)." density="compact">
          <ul className="divide-y divide-border">
            {c.sameIpAccounts.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-fg">{u.name || u.email || u.id}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {ROLE_LABEL[u.role] ?? u.role}
                    {u.email && u.name ? ` · ${u.email}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge size="sm" tone={FRAUD_TONE[u.fraudStatus]} label={FRAUD_STATUS_LABEL[u.fraudStatus]} />
                  <Link href={`/admin/users/${encodeURIComponent(u.id)}`} className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" aria-label={`${u.name || u.email || 'Hesap'} profilini aç`}>
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {c.related.length ? (
        <SectionCard title="İlişkili vakalar" description="Aynı özne ya da aynı IP." density="compact">
          <ul className="space-y-1">
            {c.related.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => sheet.open(r.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-2 text-left text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-fg">{r.typeLabel}</span>
                    <span className="block truncate text-xs text-fg-muted">{r.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <SeverityBadge severity={toDsSeverity(r.severity)} size="sm" />
                    <span className="text-xs text-fg-muted">{r.isResolved ? 'Çözüldü' : 'Açık'} · {fmtRel(r.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Geçmiş" description="Bu vaka ve öznesi üzerindeki hassas işlemler." density="compact">
        {c.history.length ? (
          <Timeline
            events={c.history.map((h) => ({
              id: h.id,
              at: h.createdAt,
              title: h.actionLabel,
              actor: [h.actor.name || h.actor.email || 'Sistem', h.actor.role ? ROLE_LABEL[h.actor.role] ?? h.actor.role : null].filter(Boolean).join(' · '),
              description: noteOf(h.newData),
              tone: h.action.includes('REOPEN') || h.action.includes('UNSUSPEND') ? 'info' : h.action.includes('RESOLVE') ? 'success' : 'warning',
            }))}
          />
        ) : (
          <p className="text-sm text-fg-muted"><AdminGuvenMerkeziText k="noActions" /></p>
        )}
      </SectionCard>

      {meta ? (
        <details className="rounded-card border border-border bg-surface-1 p-3 text-sm">
          <summary className="min-h-11 cursor-pointer select-none py-2 font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><AdminGuvenMerkeziText k="rawEvidence" /></summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-fg-muted">{JSON.stringify(meta, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function noteOf(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const s = o.note ?? o.reason;
  return typeof s === 'string' ? s : undefined;
}

function SubjectCard({ caseId, profile: p }: { caseId: string; profile: SubjectProfile }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'status' | 'suspend' | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: trustKeys.all });
  const isAdmin = p.role === 'ADMIN';
  const statusChoices = FRAUD_STATUSES.filter((s) => s !== p.fraudStatus).map((s) => ({ value: s, label: FRAUD_STATUS_LABEL[s] }));

  return (
    <SectionCard
      title="Özne profili"
      density="compact"
      actions={
        <Link href={`/admin/users/${encodeURIComponent(p.id)}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          Kullanıcı sayfası
          <ExternalLink className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-fg">{p.name || p.email || p.id}</span>
          <StatusBadge size="sm" tone="neutral" icon={null} label={ROLE_LABEL[p.role] ?? p.role} />
          <StatusBadge size="sm" tone={FRAUD_TONE[p.fraudStatus]} label={FRAUD_STATUS_LABEL[p.fraudStatus]} />
          {p.suspendedAt ? <StatusBadge size="sm" tone="danger" label="Askıda" /> : null}
          {p.isDemo ? <StatusBadge size="sm" tone="info" label="Demo hesap" /> : null}
        </div>
        <KeyValueList
          layout="grid"
          columns={2}
          items={[
            { label: 'E-posta', value: p.email, copyValue: p.email ?? undefined },
            { label: 'Bakiye', value: `${fmtNum(p.points)} puan` },
            { label: '24 saatte kazanılan', value: `${fmtNum(p.points24h)} puan` },
            { label: '24 saatte tüketim', value: fmtNum(p.consumptions24h) },
            { label: 'Güven puanı', value: `${fmtNum(p.trustScore)} / 100` },
            { label: 'Açık vaka', value: fmtNum(p.openCases) },
            { label: 'Üyelik', value: fmtAbs(p.createdAt) },
            ...(p.suspendedAt ? [{ label: 'Askı gerekçesi', value: p.suspendedReason, hint: fmtAbs(p.suspendedAt) }] : []),
          ]}
        />
        {p.fraudStatus === 'shadow_ban' ? (
          <p className="text-xs text-fg-muted"><AdminGuvenMerkeziText k="shadowNote" /></p>
        ) : null}
        {isAdmin || p.anonymized ? (
          <p className="text-sm text-fg-muted">{isAdmin ? 'Yönetici hesaplarında güven aksiyonu alınamaz.' : 'Anonimleştirilmiş hesapta işlem yapılamaz.'}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setDialog('status')}>
              <ShieldOff className="h-4 w-4" aria-hidden />
              Sahtekârlık durumunu değiştir
            </Button>
            <Button variant={p.suspendedAt ? 'outline' : 'destructive'} className="min-h-11 sm:min-h-10" onClick={() => setDialog('suspend')}>
              {p.suspendedAt ? <UserCheck className="h-4 w-4" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />}
              {p.suspendedAt ? 'Askıyı kaldır' : 'Hesabı askıya al'}
            </Button>
          </div>
        )}
      </div>

      <ReasonDialog<FraudStatus>
        open={dialog === 'status'}
        onOpenChange={(v) => setDialog(v ? 'status' : null)}
        title="Sahtekârlık durumu değişsin mi?"
        description={`Mevcut durum: ${FRAUD_STATUS_LABEL[p.fraudStatus]}. "Gölge yasak" seçilirse sonraki puan kazanımları bakiyeye yazılmaz; "İşaretli" yalnız izleme etiketidir.`}
        choices={statusChoices}
        choiceLabel="Yeni durum"
        confirmLabel="Durumu değiştir"
        tone="warning"
        onConfirm={async ({ note, choice }) => {
          if (!choice) return;
          await subjectAction(p.id, { action: 'fraud_status', status: choice, from: p.fraudStatus, reason: note, caseId });
          toast.success(`Durum: ${FRAUD_STATUS_LABEL[choice]}.`);
          refresh();
        }}
      />
      <ReasonDialog
        open={dialog === 'suspend'}
        onOpenChange={(v) => setDialog(v ? 'suspend' : null)}
        title={p.suspendedAt ? 'Askı kaldırılsın mı?' : 'Hesap askıya alınsın mı?'}
        description={
          p.suspendedAt
            ? 'Kullanıcı yeniden giriş yapabilir.'
            : 'Kullanıcının tüm oturumları kapanır ve askı kaldırılana kadar giriş yapamaz. Veriler silinmez.'
        }
        confirmLabel={p.suspendedAt ? 'Askıyı kaldır' : 'Askıya al'}
        tone={p.suspendedAt ? 'brand' : 'danger'}
        onConfirm={async ({ note }) => {
          await subjectAction(p.id, { action: p.suspendedAt ? 'unsuspend' : 'suspend', reason: note, caseId });
          toast.success(p.suspendedAt ? 'Askı kaldırıldı.' : 'Hesap askıya alındı.');
          refresh();
        }}
      />
    </SectionCard>
  );
}

function LedgerCard({ caseId, rows }: { caseId: string; rows: LedgerRow[] }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<LedgerRow | null>(null);
  return (
    <SectionCard
      title="Puan defteri (son 25)"
      description="Kazanım satırı puan ekonomisi üzerinden geri alınabilir; bakiye eksiye düşmez ve aynı satır iki kez geri alınamaz."
      density="compact"
    >
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted"><AdminGuvenMerkeziText k="noLedger" /></p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only"><AdminGuvenMerkeziText k="recentPoints" /></caption>
            <thead>
              <tr className="text-left text-xs text-fg-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Zaman</th>
                <th scope="col" className="py-2 pr-3 font-medium">Kaynak</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Puan</th>
                <th scope="col" className="py-2 pr-3 font-medium">Durum</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only"><AdminGuvenMerkeziText k="operation" /></span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap py-2 pr-3 text-fg-muted">
                    <time dateTime={r.createdAt} title={fmtAbs(r.createdAt)}>{fmtRel(r.createdAt)}</time>
                  </td>
                  <td className="py-2 pr-3 text-fg">{ledgerSourceLabel(r.source)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${r.delta < 0 ? 'text-danger' : 'text-fg'}`}>
                    {r.delta > 0 ? '+' : r.delta < 0 ? '−' : ''}
                    {fmtNum(Math.abs(r.delta))}
                  </td>
                  <td className="py-2 pr-3 text-xs text-fg-muted">{r.reversed ? 'Geri alındı' : LEDGER_STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="py-1 text-right">
                    {r.reversible ? (
                      <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => setTarget(r)} aria-label={`${ledgerSourceLabel(r.source)} kazanımı ${fmtNum(r.delta)} puanı geri al`}>
                        <Undo2 className="h-4 w-4" aria-hidden />
                        Geri al
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ReasonDialog
        open={target !== null}
        onOpenChange={(v) => !v && setTarget(null)}
        title={target ? `${fmtNum(target.delta)} puan geri alınsın mı?` : ''}
        description="Kullanıcının bakiyesinden düşülür, defterde yönetici düzeltmesi olarak görünür ve denetim günlüğüne yazılır. Bakiye yetmezse işlem yapılmaz."
        confirmLabel="Puanı geri al"
        tone="danger"
        onConfirm={async ({ note }) => {
          if (!target) return;
          const r = await reverseLedger(target.id, { reason: note, caseId });
          toast.success(`${fmtNum(r.reversed)} puan geri alındı. Yeni bakiye: ${fmtNum(r.balance)}.`);
          void qc.invalidateQueries({ queryKey: trustKeys.all });
        }}
      />
    </SectionCard>
  );
}

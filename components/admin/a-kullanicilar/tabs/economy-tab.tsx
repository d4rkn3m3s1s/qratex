'use client';

import { useId, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ArrowDownRight, ArrowUpRight, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChoiceChips } from '@/components/ds/a11y';
import { DataTable, KeyValueList, MetricGrid, MetricTile, StatusBadge, statusBadgeProps, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { InlineError } from '@/components/states';
import {
  ADJUST_PER_OPERATION_MAX,
  ADJUST_SECOND_APPROVAL_ABOVE,
  REASON_CODE_LABELS,
  type AdjustPointsInput,
  type LedgerRow,
  type User360,
} from '@/lib/admin-users/contract';
import { UsersApiError, adjustPoints, errorText, fetchAdmins, fetchLedger, issueApproval, newRequestId, usersKeys } from '../api';
import { LEDGER_STATUS, fmtDateTime, fmtNumber, fmtSigned, sourceLabel } from '../format';
import { FormField, fieldError } from '../parts';
import { AdminKullanicilarText } from '../copy';

type Direction = 'credit' | 'debit' | 'xp';
type ReasonCode = AdjustPointsInput['reasonCode'];

const parseInt0 = (s: string) => {
  const n = Number(s.replace(/[.\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

export function EconomyTab({ user: u, onChanged }: { user: User360; onChanged: () => void }) {
  const locked = u.identity.status === 'anonymized' || u.isSelf;
  return (
    <div className="space-y-6">
      <LedgerSummary userId={u.identity.id} points={u.gamification.points} />
      {!locked ? <AdjustForm user={u} onChanged={onChanged} /> : null}
      {!u.isSelf ? <ApprovalIssuer user={u} /> : null}
      <LedgerTable userId={u.identity.id} />
    </div>
  );
}

function LedgerSummary({ userId, points }: { userId: string; points: number }) {
  const q = useQuery({ queryKey: usersKeys.sub(userId, 'ledger', 1), queryFn: () => fetchLedger(userId, 1), staleTime: 15_000 });
  const s = q.data?.last30;
  return (
    <MetricGrid cols={4}>
      <MetricTile label="Güncel bakiye" metric={{ value: points }} tone="brand" animate />
      <MetricTile label="Son 30 gün kazanılan" metric={{ value: s?.earned ?? 0 }} loading={q.isLoading} tone="success" />
      <MetricTile label="Son 30 gün harcanan" metric={{ value: s?.spent ?? 0 }} loading={q.isLoading} tone="warning" />
      <MetricTile label="Son 30 gün XP" metric={{ value: s?.xp ?? 0 }} loading={q.isLoading} />
    </MetricGrid>
  );
}

function AdjustForm({ user: u, onChanged }: { user: User360; onChanged: () => void }) {
  const id = useId();
  const qc = useQueryClient();
  const [direction, setDirection] = useState<Direction>('credit');
  const [amount, setAmount] = useState('');
  const [reasonCode, setReasonCode] = useState<ReasonCode>('support');
  const [note, setNote] = useState('');
  const [token, setToken] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [requestId, setRequestId] = useState(() => newRequestId());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const n = parseInt0(amount);
  const validAmount = Number.isInteger(n) && n > 0 && n <= ADJUST_PER_OPERATION_MAX;
  const delta = direction === 'credit' ? n : direction === 'debit' ? -n : 0;
  const xp = direction === 'xp' ? n : 0;
  const after = u.gamification.points + (Number.isFinite(delta) ? delta : 0);
  const overDraft = direction === 'debit' && validAmount && after < 0;
  const bigOne = validAmount && n > ADJUST_SECOND_APPROVAL_ABOVE;
  const approvalNeeded = needsApproval || bigOne;
  // Dört göz: onay ancak BAŞKA bir etkin yöneticiden gelebilir. Hiç yoksa belirteç alanı
  // boşuna beklenmesin — dürüst bir açıklama gösterilir ve gönderim kapanır.
  const otherAdmins = useQuery({ queryKey: usersKeys.catalog('admins'), queryFn: fetchAdmins, enabled: approvalNeeded, staleTime: 5 * 60_000 });
  const noSecondAdmin = approvalNeeded && otherAdmins.isSuccess && otherAdmins.data.items.length === 0;
  const valid = validAmount && note.trim().length >= 5 && !overDraft && !noSecondAdmin;
  const err = (p: string) => fieldError(error, p);

  const reset = () => {
    setAmount('');
    setNote('');
    setToken('');
    setNeedsApproval(false);
    setRequestId(newRequestId());
    setError(null);
  };

  return (
    <SectionCard title="Bakiye düzeltmesi" description="Her düzeltme deftere gerekçesiyle yazılır, kullanıcıya bildirilir ve denetime düşer. Bakiye eksiye inemez.">
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          setError(null);
          try {
            const r = await adjustPoints(u.identity.id, {
              delta,
              xp,
              reasonCode,
              note: note.trim(),
              approvalToken: token.trim() || null,
              requestId,
            });
            toast.success(
              r.duplicate
                ? 'Bu düzeltme zaten işlenmişti; ikinci kez uygulanmadı.'
                : xp > 0
                  ? `${fmtNumber(r.xpDelta)} XP eklendi. Seviye ${r.level}.`
                  : `Bakiye ${fmtNumber(r.pointsBefore)} → ${fmtNumber(r.points)} puan.`
            );
            reset();
            onChanged();
            await qc.invalidateQueries({ queryKey: ['admin-users', 'detail', u.identity.id] });
          } catch (e2) {
            if (e2 instanceof UsersApiError && e2.code === 'SECOND_APPROVAL_REQUIRED') setNeedsApproval(true);
            setError(e2);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <p id={`${id}-dir`} className="text-sm font-medium text-fg">
            İşlem
          </p>
          <ChoiceChips
            aria-labelledby={`${id}-dir`}
            value={direction}
            onChange={(v) => setDirection((v as Direction) || 'credit')}
            options={[
              { value: 'credit', label: 'Puan ekle' },
              { value: 'debit', label: 'Puan düş' },
              { value: 'xp', label: 'XP ekle' },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            htmlFor={`${id}-amount`}
            label={direction === 'xp' ? 'XP miktarı' : 'Puan miktarı'}
            error={err('delta') ?? err('xp') ?? (amount && !validAmount ? `1 ile ${fmtNumber(ADJUST_PER_OPERATION_MAX)} arasında bir tam sayı girin` : overDraft ? 'Bakiye eksiye düşemez' : undefined)}
            hint={bigOne ? `${fmtNumber(ADJUST_SECOND_APPROVAL_ABOVE)} üzeri için ikinci bir yöneticinin onay belirteci gerekir.` : 'Tam sayı.'}
          >
            <Input
              id={`${id}-amount`}
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.\s]/g, ''))}
              aria-invalid={!!amount && (!validAmount || overDraft)}
            />
          </FormField>
          <FormField htmlFor={`${id}-code`} label="Gerekçe türü">
            <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as ReasonCode)}>
              <SelectTrigger id={`${id}-code`} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REASON_CODE_LABELS) as ReasonCode[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {REASON_CODE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <FormField htmlFor={`${id}-note`} label="Açıklama" error={err('note')} hint="En az 5 karakter; kullanıcıya bildirimde de gösterilir.">
          <Textarea id={`${id}-note`} rows={2} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        {noSecondAdmin ? (
          <InlineError>
            Sistemde onay verebilecek başka etkin bir yönetici yok. {fmtNumber(ADJUST_SECOND_APPROVAL_ABOVE)} puanın üzerindeki düzeltmeler ikinci
            yönetici olmadan yapılamaz; tutarı {fmtNumber(ADJUST_SECOND_APPROVAL_ABOVE)} veya altına indirin ya da önce ikinci bir yönetici atayın.
          </InlineError>
        ) : approvalNeeded ? (
          <FormField
            htmlFor={`${id}-token`}
            label="İkinci onay belirteci"
            hint="Başka bir yönetici bu kullanıcının sayfasında “Düzeltmeyi onayla” bölümünden sizin adınıza belirteç üretir (15 dk geçerli, tek kullanımlık)."
          >
            <Input id={`${id}-token`} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
          </FormField>
        ) : null}

        {validAmount && direction !== 'xp' ? (
          <KeyValueList
            layout="grid"
            columns={3}
            items={[
              { label: 'Önce', value: `${fmtNumber(u.gamification.points)} puan` },
              { label: 'Değişim', value: fmtSigned(delta) },
              { label: 'Sonra', value: `${fmtNumber(after)} puan` },
            ]}
          />
        ) : null}
        {error && !err('delta') && !err('note') ? <InlineError>{errorText(error)}</InlineError> : null}
        <div className="flex justify-end">
          <Button type="submit" className="min-h-11" disabled={!valid || busy} aria-busy={busy}>
            {direction === 'debit' ? <ArrowDownRight className="h-4 w-4" aria-hidden /> : <ArrowUpRight className="h-4 w-4" aria-hidden />}
            {busy ? 'Uygulanıyor…' : 'Düzeltmeyi uygula'}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/** Dört göz: başka bir yöneticinin büyük düzeltmesi için bu oturumla imzalı onay belirteci üretir. */
function ApprovalIssuer({ user: u }: { user: User360 }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const admins = useQuery({ queryKey: usersKeys.catalog('admins'), queryFn: fetchAdmins, enabled: open, staleTime: 5 * 60_000 });
  const [requesterId, setRequesterId] = useState('');
  const [direction, setDirection] = useState<Direction>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ token: string; expiresAt: string } | null>(null);
  const n = parseInt0(amount);
  const valid = !!requesterId && Number.isInteger(n) && n > 0 && n <= ADJUST_PER_OPERATION_MAX && reason.trim().length >= 5;

  if (!open) {
    return (
      <SectionCard title="Düzeltmeyi onayla (dört göz)" density="compact" icon={<ShieldCheck />}>
        <p className="text-sm text-fg-muted">
          Başka bir yönetici bu kullanıcıya {fmtNumber(ADJUST_SECOND_APPROVAL_ABOVE)} puanın üzerinde düzeltme yapacaksa, onayınızı buradan imzalı bir
          belirteç olarak verirsiniz.
        </p>
        <Button variant="outline" className="mt-3 min-h-11" onClick={() => setOpen(true)}>
          <KeyRound className="h-4 w-4" aria-hidden />
          Onay belirteci üret
        </Button>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Düzeltmeyi onayla (dört göz)" icon={<ShieldCheck />} description="Belirteç yalnız seçtiğiniz yönetici, bu kullanıcı ve bu miktar için 15 dakika geçerlidir; tek kullanımlıktır.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          setError(null);
          try {
            const delta = direction === 'credit' ? n : direction === 'debit' ? -n : 0;
            const xp = direction === 'xp' ? n : 0;
            setIssued(await issueApproval(u.identity.id, { requesterId, delta, xp, reason: reason.trim() }));
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {admins.isSuccess && admins.data.items.length === 0 ? (
          <InlineError><AdminKullanicilarText k="noOtherAdmin" /></InlineError>
        ) : null}
        <FormField htmlFor={`${id}-req`} label="Talep eden yönetici">
          <Select value={requesterId} onValueChange={setRequesterId} disabled={admins.isLoading}>
            <SelectTrigger id={`${id}-req`} className="min-h-11">
              <SelectValue placeholder={admins.isLoading ? 'Yükleniyor…' : admins.isError ? 'Liste yüklenemedi' : 'Seçin'} />
            </SelectTrigger>
            <SelectContent>
              {(admins.data?.items ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name || a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div className="space-y-2">
          <p id={`${id}-dir`} className="text-sm font-medium text-fg">
            Onaylanan işlem
          </p>
          <ChoiceChips
            aria-labelledby={`${id}-dir`}
            value={direction}
            onChange={(v) => setDirection((v as Direction) || 'credit')}
            options={[
              { value: 'credit', label: 'Puan ekle' },
              { value: 'debit', label: 'Puan düş' },
              { value: 'xp', label: 'XP ekle' },
            ]}
          />
        </div>
        <FormField htmlFor={`${id}-amt`} label="Miktar (talep edilenle birebir aynı olmalı)">
          <Input id={`${id}-amt`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.\s]/g, ''))} />
        </FormField>
        <FormField htmlFor={`${id}-why`} label="Onay notu" hint="En az 5 karakter; denetime yazılır.">
          <Textarea id={`${id}-why`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        {error ? <InlineError>{error}</InlineError> : null}
        {issued ? (
          <div className="space-y-2 rounded-lg border border-subtle bg-surface-2 p-3">
            <p className="text-sm font-medium text-fg"><AdminKullanicilarText k="tokenReady" /></p>
            <Input readOnly value={issued.token} aria-label="Onay belirteci" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
              <span>Son geçerlilik: {fmtDateTime(issued.expiresAt)}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 sm:min-h-9"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(issued.token);
                    toast.success('Belirteç kopyalandı.');
                  } catch {
                    toast.error('Kopyalanamadı; metni seçip elle kopyalayın.');
                  }
                }}
              >
                Kopyala
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
            Kapat
          </Button>
          <Button type="submit" className="min-h-11" disabled={!valid || busy} aria-busy={busy}>
            {busy ? 'Üretiliyor…' : 'Belirteç üret'}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function LedgerTable({ userId }: { userId: string }) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const page = pagination.pageIndex + 1;
  const q = useQuery({
    queryKey: [...usersKeys.sub(userId, 'ledger', page), pagination.pageSize],
    queryFn: () => fetchLedger(userId, page, pagination.pageSize),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const columns = useMemo<ColumnDef<LedgerRow>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'Tarih',
        meta: { mobile: 'subtitle', label: 'Tarih' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <time dateTime={row.original.createdAt}>{fmtDateTime(row.original.createdAt)}</time>,
      },
      {
        id: 'source',
        header: 'Kaynak',
        meta: { mobile: 'title', label: 'Kaynak' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-fg">{sourceLabel(row.original.source)}</p>
            {row.original.reason ? <p className="line-clamp-2 text-xs text-fg-muted">{row.original.reason}</p> : null}
          </div>
        ),
      },
      {
        id: 'delta',
        header: 'Puan',
        meta: { numeric: true, label: 'Puan' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className={row.original.delta > 0 ? 'text-success' : row.original.delta < 0 ? 'text-danger' : 'text-fg-muted'}>
            {row.original.currency === 'POINTS' ? fmtSigned(row.original.delta) : '—'}
          </span>
        ),
      },
      {
        id: 'xp',
        header: 'XP',
        meta: { numeric: true, label: 'XP' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.xpDelta ? fmtSigned(row.original.xpDelta) : '—'),
      },
      {
        id: 'balance',
        header: 'Sonraki bakiye',
        meta: { numeric: true, label: 'Sonraki bakiye' } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmtNumber(row.original.balanceAfter),
      },
      {
        id: 'status',
        header: 'Durum',
        meta: { label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(LEDGER_STATUS, row.original.status)} />,
      },
      {
        id: 'actor',
        header: 'Yapan',
        meta: { label: 'Yapan' } satisfies DataTableColumnMeta,
        cell: ({ row }) => row.original.actorLabel ?? <span className="text-fg-subtle">Sistem</span>,
      },
    ],
    []
  );
  return (
    <SectionCard title="Puan defteri" description="Bakiyenin nereden geldiği: her hareket kaynağı, gerekçesi ve yapanıyla." density="flush">
      <DataTable
        ariaLabel="Puan defteri"
        columns={columns}
        data={q.data?.items}
        query={q}
        getRowId={(r) => r.id}
        manualPagination
        rowCount={q.data?.total}
        pagination={pagination}
        onPaginationChange={setPagination}
        enableColumnVisibility={false}
        empty={{ title: 'Defterde hareket yok', description: 'Bu kullanıcının henüz kayıtlı bir puan hareketi bulunmuyor.' }}
      />
    </SectionCard>
  );
}

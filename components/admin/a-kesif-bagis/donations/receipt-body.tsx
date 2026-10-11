'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, StatusBadge } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import type { TransactionDetail } from '@/lib/admin-donations/contract';
import { donationKeys, fetchTransaction } from '../api';
import { fmtDateTime, fmtDecimal, fmtNumber } from '../format';
import { AdminKesifBagisText } from '../copy';

/**
 * Bağış makbuzu — makbuz numarası, puan defteri satırıyla eşleşme (defterdeki düşüm = bağış
 * tutarı), etki ve görünürlük. Defter satırı olmayan eski bağışlar açıkça "makbuzsuz" gösterilir.
 */
export function ReceiptBody({ id }: { id: string }) {
  const q = useQuery({ queryKey: donationKeys.transaction(id), queryFn: () => fetchTransaction(id), staleTime: 60_000 });
  return (
    <QueryState query={q} skeleton="detail">
      {(t: TransactionDetail) => {
        const matched = t.ledger != null && Math.abs(t.ledger.delta) === t.points && t.ledger.status === 'posted';
        return (
          <div className="space-y-5">
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="font-mono text-sm text-fg-muted">{t.receiptNo}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-fg">{fmtNumber(t.points)} puan</p>
              <p className="text-sm text-fg-muted">
                <span aria-hidden>{t.project.icon}</span> {t.project.name}
              </p>
              {t.impact ? (
                <p className="mt-1 text-sm">
                  Etki: {fmtDecimal(t.impact.value)} {t.impact.unit} {t.impact.label ? `· ${t.impact.label}` : ''}
                </p>
              ) : null}
            </div>
            <div className="flex items-start gap-2 text-sm">
              {t.ledger ? (
                matched ? (
                  <>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span>Puan defteriyle eşleşiyor: kullanıcıdan {fmtNumber(Math.abs(t.ledger.delta))} puan düşüldü{t.ledger.balanceAfter != null ? `, kalan bakiye ${fmtNumber(t.ledger.balanceAfter)}` : ''}.</span>
                  </>
                ) : (
                  <>
                    <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    <span>
                      Defter satırı var ama tutar/durum farklı ({fmtNumber(t.ledger.delta)} · {t.ledger.status}). İnceleyin.
                    </span>
                  </>
                )
              ) : (
                <>
                  <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <span><AdminKesifBagisText k="noLedgerRow" /></span>
                </>
              )}
            </div>
            <KeyValueList
              items={[
                { label: 'Makbuz no', value: t.receiptNo, mono: true, copyValue: t.receiptNo },
                { label: 'Tarih', value: fmtDateTime(t.at) },
                { label: 'Bağışçı', value: `${t.user.name ?? 'Adsız kullanıcı'}${t.user.email ? ` · ${t.user.email}` : ''}` },
                { label: 'Görünürlük', value: <StatusBadge size="sm" tone={t.isPublic ? 'info' : 'neutral'} label={t.isPublic ? 'Herkese açık (sıralamada)' : 'Gizli'} /> },
                { label: 'Mesaj', value: t.message ?? '—' },
                { label: 'Defter kaydı', value: t.ledger ? `${t.ledger.id} · ${fmtDateTime(t.ledger.at)}` : 'Yok', mono: !!t.ledger },
                { label: 'Kayıt kimliği', value: t.id, mono: true, copyValue: t.id },
              ]}
            />
            <Button asChild variant="outline" className="min-h-11">
              <Link href={`/admin/users/${encodeURIComponent(t.user.id)}`}>
                <ExternalLink className="h-4 w-4" aria-hidden />
                Kullanıcı profili
              </Link>
            </Button>
          </div>
        );
      }}
    </QueryState>
  );
}

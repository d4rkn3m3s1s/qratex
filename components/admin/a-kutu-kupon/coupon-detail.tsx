'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Gift, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, Sparkline, StatusBadge, statusBadgeProps, Timeline, type TimelineEvent } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { AUDIT_ACTION_LABEL, TYPE_LABEL, formatCouponValue, type CouponDetail } from '@/lib/admin-coupons/contract';
import { couponKeys, fetchCoupon } from './api';
import { CouponActions } from './coupon-actions';
import { COUPON_STATUS_MAP, fmtDateTime, fmtNumber, pct } from './format';
import { AdminKutuKuponText } from './copy';

export function CouponDetailBody({ id, onEdit }: { id: string; onEdit: (id: string) => void }) {
  const q = useQuery({ queryKey: couponKeys.detail(id), queryFn: () => fetchCoupon(id), staleTime: 10_000 });
  return (
    <QueryState query={q} skeleton="detail">
      {(d: CouponDetail) => {
        const c = d.coupon;
        const total14 = d.redemptions14d.reduce((a, b) => a + b, 0);
        const events: TimelineEvent[] = d.audit.map((a) => ({
          id: a.id,
          title: AUDIT_ACTION_LABEL[a.action] ?? a.action,
          description: a.changes.length ? `Değişen: ${a.changes.join(', ')}` : undefined,
          at: a.at,
          actor: a.actorName ?? undefined,
          tone: a.action === 'DEACTIVATE_COUPON' ? 'warning' : a.action === 'ACTIVATE_COUPON' || a.action.startsWith('CREATE') ? 'success' : 'neutral',
        }));
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="break-all font-mono text-xl font-semibold tracking-wider text-fg">{c.code}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge size="sm" {...statusBadgeProps(COUPON_STATUS_MAP, c.status)} />
                  <span className="qx-small text-fg-muted">
                    {formatCouponValue(c.type, c.value)} · {TYPE_LABEL[c.type]}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => onEdit(c.id)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Düzenle
                </Button>
                {c.status === 'usable' ? (
                  <Button variant="outline" className="min-h-11 sm:min-h-10" asChild>
                    <Link href={`/admin/surprise-boxes?gonder=1&kupon=${encodeURIComponent(c.code)}`}>
                      <Gift className="h-4 w-4" aria-hidden />
                      Sürpriz kutuyla dağıt
                    </Link>
                  </Button>
                ) : null}
                <CouponActions coupon={c} />
              </div>
            </div>

            <KeyValueList
              layout="grid"
              columns={2}
              items={[
                { label: 'Kod girişi', value: `${fmtNumber(c.usedCount)}${c.maxUses != null ? ` / ${fmtNumber(c.maxUses)} (%${pct(c.usedCount, c.maxUses)})` : ' · sınırsız'}` },
                { label: 'Son kullanım', value: c.expiresAt ? fmtDateTime(c.expiresAt) : 'Süresiz' },
                { label: 'Sürpriz kutuyla dağıtılan', value: `${fmtNumber(d.boxes.total)} kutu · ${fmtNumber(d.boxes.opened)} açıldı` },
                { label: 'Oluşturulma', value: fmtDateTime(c.createdAt) },
              ]}
            />

            <section className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="qx-small font-semibold text-fg"><AdminKutuKuponText k="entries14d" /></h3>
                <span className="qx-caption text-fg-muted">{fmtNumber(total14)} kullanım</span>
              </div>
              {total14 > 0 ? (
                <Sparkline data={d.redemptions14d} label={`Son 14 günde günlük kod girişi; toplam ${fmtNumber(total14)}`} />
              ) : (
                <p className="qx-small text-fg-muted"><AdminKutuKuponText k="noEntries14d" /></p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="qx-small font-semibold text-fg">Kullananlar (son 50)</h3>
              {d.redemptions.length === 0 ? (
                <p className="qx-small text-fg-muted"><AdminKutuKuponText k="unused" /></p>
              ) : (
                <ul className="divide-y divide-border rounded-card border border-subtle">
                  {d.redemptions.map((r) => (
                    <li key={`${r.userId}-${r.at}`} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/users/${encodeURIComponent(r.userId)}`} className="qx-small block truncate font-medium text-fg underline-offset-4 hover:underline">
                          {r.name || 'İsimsiz kullanıcı'}
                        </Link>
                        <span className="qx-caption block truncate text-fg-muted">{r.email ?? '—'}</span>
                      </div>
                      <time dateTime={r.at} className="qx-caption shrink-0 text-fg-muted">
                        {fmtDateTime(r.at)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="qx-small font-semibold text-fg"><AdminKutuKuponText k="changeHistory" /></h3>
              {events.length ? <Timeline events={events} timeStyle="datetime" dense /> : <p className="qx-small text-fg-muted"><AdminKutuKuponText k="noAudit" /></p>}
            </section>
          </div>
        );
      }}
    </QueryState>
  );
}

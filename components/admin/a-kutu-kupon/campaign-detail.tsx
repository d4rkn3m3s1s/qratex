'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { KeyValueList, StatusBadge, statusBadgeProps, Timeline, type TimelineEvent } from '@/components/ds/data';
import { RarityBadge } from '@/components/ds/play';
import { ConfirmAction, QueryState } from '@/components/states';
import { AUDIT_ACTION_LABEL, TIER_LABEL, type CampaignDetail } from '@/lib/admin-surprise-boxes/contract';
import { boxKeys, fetchCampaign, revokeCampaign } from './api';
import { CAMPAIGN_STATE_MAP, fmtDateTime, fmtNumber, pct } from './format';
import { AdminKutuKuponText } from './copy';

const RECIPIENT_PREVIEW = 50;

export function CampaignDetailBody({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: boxKeys.detail(id), queryFn: () => fetchCampaign(id), staleTime: 10_000 });
  const [reason, setReason] = useState('');
  const [showAll, setShowAll] = useState(false);
  const rid = useId();

  return (
    <QueryState query={q} skeleton="detail">
      {(d: CampaignDetail) => {
        const c = d.campaign;
        const pending = c.recipients - c.opened;
        const events: TimelineEvent[] = d.audit.map((a) => ({
          id: a.id,
          title: AUDIT_ACTION_LABEL[a.action] ?? a.action,
          description: a.summary ?? undefined,
          at: a.at,
          actor: a.actorName ?? undefined,
          tone: a.action === 'SURPRISE_BOX_REVOKE' ? 'warning' : 'success',
        }));
        const list = showAll ? d.recipients : d.recipients.slice(0, RECIPIENT_PREVIEW);
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="qx-h4 break-words text-fg">{c.title}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge size="sm" {...statusBadgeProps(CAMPAIGN_STATE_MAP, c.state)} />
                  <RarityBadge rarity={c.tier} register="ops" />
                  {c.legacy ? <span className="qx-caption text-fg-muted"><AdminKutuKuponText k="legacyBox" /></span> : null}
                </div>
              </div>
              {pending > 0 ? (
                <ConfirmAction
                  tone="warning"
                  trigger={
                    <Button variant="outline" className="min-h-11 sm:min-h-10">
                      <Undo2 className="h-4 w-4" aria-hidden />
                      Açılmamışları geri çek
                    </Button>
                  }
                  title="Açılmamış kutular geri çekilsin mi?"
                  description={
                    <span className="block space-y-2">
                      <span className="block"><AdminKutuKuponText k="recallNote" /></span>
                      <span className="block space-y-1">
                        <Label htmlFor={`${rid}-reason`}><AdminKutuKuponText k="reason" /></Label>
                        <Textarea id={`${rid}-reason`} rows={2} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Örn. yanlış puan girildi" />
                      </span>
                    </span>
                  }
                  impact={[
                    { label: 'Geri çekilecek kutu', value: fmtNumber(pending), emphasis: true },
                    { label: 'Serbest kalacak puan yükümlülüğü', value: `${fmtNumber(c.pendingPoints)} puan` },
                  ]}
                  irreversibleNote="Geri çekme geri alınamaz; gerekirse yeni gönderim yapın."
                  confirmLabel="Geri çek"
                  onConfirm={async () => {
                    if (reason.trim().length < 3) throw new Error('Gerekçe en az 3 karakter olmalı.');
                    const r = await revokeCampaign(c.id, reason.trim());
                    toast.success(`${fmtNumber(r.revoked)} kutu geri çekildi · ${fmtNumber(r.pointsReleased)} puan yükümlülüğü kalktı.`);
                    setReason('');
                    await qc.invalidateQueries({ queryKey: boxKeys.all });
                  }}
                />
              ) : null}
            </div>

            <KeyValueList
              layout="grid"
              columns={2}
              items={[
                { label: 'Gönderim', value: fmtDateTime(c.createdAt) },
                { label: 'Gönderen', value: c.sender?.name ?? 'Bilinmiyor' },
                { label: 'Alıcı', value: fmtNumber(c.recipients) },
                { label: 'Açılan', value: `${fmtNumber(c.opened)} (%${pct(c.opened, c.recipients)})` },
                { label: 'Kutu başına', value: `${fmtNumber(c.pointsPerBox)} puan` },
                { label: 'Bekleyen yükümlülük', value: `${fmtNumber(c.pendingPoints)} puan` },
                { label: 'Kupon', value: c.couponCode ?? '—', mono: !!c.couponCode, copyValue: c.couponCode ?? undefined },
                { label: 'Açılış süresi (medyan)', value: d.medianOpenHours == null ? '—' : `${fmtNumber(d.medianOpenHours)} saat` },
                { label: 'Kademe', value: TIER_LABEL[c.tier] },
                { label: 'Kampanya kimliği', value: c.id, mono: true, copyValue: c.id },
              ]}
            />

            {d.campaign.message ? (
              <section className="space-y-1">
                <h3 className="qx-small font-semibold text-fg">Mesaj</h3>
                <p className="qx-small whitespace-pre-line break-words text-fg-muted">{d.campaign.message}</p>
              </section>
            ) : null}

            <section className="space-y-2" aria-labelledby={`${rid}-rcp`}>
              <h3 id={`${rid}-rcp`} className="qx-small font-semibold text-fg">
                Alıcılar ({fmtNumber(d.recipients.length)})
              </h3>
              {d.recipients.length === 0 ? (
                <p className="qx-small text-fg-muted"><AdminKutuKuponText k="allRecalled" /></p>
              ) : (
                <ul className="divide-y divide-border rounded-card border border-subtle">
                  {list.map((r) => (
                    <li key={r.boxId} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/users/${encodeURIComponent(r.userId)}`} className="qx-small block truncate font-medium text-fg underline-offset-4 hover:underline">
                          {r.name || 'İsimsiz müşteri'}
                        </Link>
                        <span className="qx-caption block truncate text-fg-muted">{r.email}</span>
                      </div>
                      {r.openedAt ? (
                        <span className="qx-caption inline-flex shrink-0 items-center gap-1 text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {fmtDateTime(r.openedAt)}
                        </span>
                      ) : (
                        <span className="qx-caption inline-flex shrink-0 items-center gap-1 text-fg-muted">
                          <Clock className="h-3.5 w-3.5" aria-hidden /> Açılmadı
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {d.recipients.length > RECIPIENT_PREVIEW ? (
                <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Daha az göster' : `Tümünü göster (${fmtNumber(d.recipients.length)})`}
                </Button>
              ) : null}
            </section>

            <section className="space-y-2">
              <h3 className="qx-small font-semibold text-fg"><AdminKutuKuponText k="auditHistory" /></h3>
              {events.length ? <Timeline events={events} timeStyle="datetime" dense /> : <p className="qx-small text-fg-muted"><AdminKutuKuponText k="noAuditP019" /></p>}
            </section>
          </div>
        );
      }}
    </QueryState>
  );
}

'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Pencil, Power, PowerOff, Scale, Star, StarOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { KeyValueList, Sparkline, StatusBadge, statusBadgeProps, Timeline, useDetailSheet } from '@/components/ds/data';
import { ConfirmAction, QueryState } from '@/components/states';
import { CATEGORY_LABEL, ratioText, type ProjectAction, type ProjectDetail } from '@/lib/admin-donations/contract';
import { donationKeys, errorText, fetchProject, projectAction } from '../api';
import { fmtAgo, fmtDate, fmtDateTime, fmtNumber, PROJECT_STATUS } from '../format';
import { ProgressBar } from './parts';
import { AdminKesifBagisText } from '../copy';

function ReasonConfirm({
  trigger,
  title,
  description,
  confirmLabel,
  tone,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'warning' | 'danger' | 'brand';
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmAction
      tone={tone}
      title={title}
      irreversibleNote={false}
      confirmLabel={confirmLabel}
      trigger={trigger}
      description={
        <span className="block space-y-2">
          <span className="block">{description}</span>
          <span className="block space-y-1">
            <Label htmlFor="reason-input"><AdminKesifBagisText k="reasonMin5" /></Label>
            <Textarea id="reason-input" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </span>
        </span>
      }
      disabled={false}
      onConfirm={async () => {
        if (reason.trim().length < 5) throw new Error('Gerekçe en az 5 karakter olmalı.');
        await onConfirm(reason.trim());
        setReason('');
      }}
    />
  );
}

/** Kampanya ayrıntısı — şeffaf toplam, 30 gün serisi, en çok bağışlayanlar, son bağışlar (makbuzlu), geçmiş. */
export function ProjectDetailBody({ id, onEdit }: { id: string; onEdit: (p: ProjectDetail) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: donationKeys.detail(id), queryFn: () => fetchProject(id), staleTime: 15_000 });
  const receipt = useDetailSheet('makbuz');

  const act = async (action: ProjectAction, extra: { reason?: string; expectedTotal?: number } = {}) => {
    try {
      await projectAction(id, { action, ...extra });
      const msg: Record<ProjectAction, string> = {
        activate: 'Kampanya bağışa açıldı.',
        deactivate: 'Kampanya bağışa kapatıldı.',
        feature: 'Öne çıkarıldı.',
        unfeature: 'Öne çıkarma kaldırıldı.',
        archive: 'Arşivlendi; bağış geçmişi korunuyor.',
        restore: 'Arşivden çıkarıldı (kapalı durumda).',
        reconcile: 'İlerleme gerçek toplamla eşitlendi.',
      };
      toast.success(msg[action]);
      await qc.invalidateQueries({ queryKey: donationKeys.all });
    } catch (e) {
      toast.error(errorText(e));
      throw e;
    }
  };

  return (
    <QueryState query={q} skeleton="detail">
      {(p: ProjectDetail) => {
        const mismatch = p.current !== p.raised;
        const archived = p.status === 'archived';
        return (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <span className="text-4xl" aria-hidden>
                {p.icon}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-lg font-semibold text-fg">{p.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge size="sm" {...statusBadgeProps(PROJECT_STATUS, p.status)} />
                  {p.completed ? <StatusBadge size="sm" tone="success" label="Hedefe ulaştı" /> : null}
                  {p.featured ? <StatusBadge size="sm" tone="brand" label="Öne çıkan" /> : null}
                  <span className="text-sm text-fg-muted">{p.category === 'other' ? `Bilinmeyen kategori (“${p.rawCategory}”)` : CATEGORY_LABEL[p.category]}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {!archived ? (
                <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => onEdit(p)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Düzenle
                </Button>
              ) : null}
              {!archived && (p.isActive ? (
                <ConfirmAction
                  tone="warning"
                  title="Kampanya bağışa kapatılsın mı?"
                  description="Müşteri listesinden kalkar; bağış geçmişi ve kişisel etkiler korunur. İstediğiniz an yeniden açabilirsiniz."
                  irreversibleNote={false}
                  confirmLabel="Kapat"
                  trigger={
                    <Button variant="outline" className="min-h-11 sm:min-h-9">
                      <PowerOff className="h-4 w-4" aria-hidden />
                      Bağışa kapat
                    </Button>
                  }
                  onConfirm={() => act('deactivate')}
                />
              ) : (
                <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => act('activate').catch(() => undefined)}>
                  <Power className="h-4 w-4" aria-hidden />
                  Bağışa aç
                </Button>
              ))}
              {!archived ? (
                <Button variant="outline" className="min-h-11 sm:min-h-9" aria-pressed={p.featured} onClick={() => act(p.featured ? 'unfeature' : 'feature').catch(() => undefined)}>
                  {p.featured ? <StarOff className="h-4 w-4" aria-hidden /> : <Star className="h-4 w-4" aria-hidden />}
                  {p.featured ? 'Öne çıkarmayı kaldır' : 'Öne çıkar'}
                </Button>
              ) : null}
              {archived ? (
                <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => act('restore').catch(() => undefined)}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden />
                  Arşivden çıkar
                </Button>
              ) : (
                <ReasonConfirm
                  tone="warning"
                  title="Kampanya arşivlensin mi?"
                  description={`Müşteriden kalkar ve bağış almaz. ${fmtNumber(p.donations)} bağış kaydı, makbuzlar ve kişisel etkiler korunur; silme yapılmaz.`}
                  confirmLabel="Arşivle"
                  trigger={
                    <Button variant="outline" className="min-h-11 sm:min-h-9">
                      <Archive className="h-4 w-4" aria-hidden />
                      Arşivle
                    </Button>
                  }
                  onConfirm={(reason) => act('archive', { reason })}
                />
              )}
            </div>

            <section aria-labelledby={`tot-${p.id}`} className="space-y-3 rounded-lg border border-border p-4">
              <h3 id={`tot-${p.id}`} className="text-sm font-semibold text-fg">
                Şeffaf toplam
              </h3>
              <ProgressBar percent={p.percent} label="Hedefe ilerleme" done={p.completed} />
              <KeyValueList
                items={[
                  { label: 'Müşteriye gösterilen ilerleme', value: `${fmtNumber(p.current)} / ${fmtNumber(p.goal)} puan${p.percent != null ? ` (%${p.percent})` : ''}` },
                  { label: 'Bağış kayıtlarının gerçek toplamı', value: `${fmtNumber(p.raised)} puan · ${fmtNumber(p.donations)} bağış · ${fmtNumber(p.donors)} bağışçı` },
                  { label: 'Oran', value: ratioText(p.impact) },
                  { label: 'Yayın aralığı', value: `${fmtDate(p.startDate)} → ${p.endDate ? fmtDate(p.endDate) : 'süresiz'}` },
                  { label: 'Son bağış', value: p.lastDonationAt ? fmtAgo(p.lastDonationAt) : 'Henüz yok' },
                ]}
              />
              {mismatch ? (
                <div className="space-y-2 rounded-md border border-warning-border bg-warning-subtle p-3 text-sm text-warning">
                  <p>
                    Kayıtlı ilerleme gerçek toplamdan {p.current > p.raised ? `${fmtNumber(p.current - p.raised)} puan fazla` : `${fmtNumber(p.raised - p.current)} puan eksik`}. Bu genelde bağış kaydı
                    olmadan elle/tohum verisiyle yazılmış ilerlemeden kaynaklanır.
                  </p>
                  <ReasonConfirm
                    tone="brand"
                    title="İlerleme gerçek toplamla eşitlensin mi?"
                    description={`Müşteriye gösterilen ilerleme ${fmtNumber(p.current)} → ${fmtNumber(p.raised)} puan olur. Kimseye puan basılmaz ya da düşülmez; işlem denetim kaydına yazılır.`}
                    confirmLabel="Uzlaştır"
                    trigger={
                      <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                        <Scale className="h-4 w-4" aria-hidden />
                        Gerçek toplamla uzlaştır
                      </Button>
                    }
                    onConfirm={(reason) => act('reconcile', { reason, expectedTotal: p.raised })}
                  />
                </div>
              ) : null}
            </section>

            <section aria-labelledby={`ser-${p.id}`} className="space-y-2">
              <h3 id={`ser-${p.id}`} className="text-sm font-semibold text-fg">
                Son 30 gün
              </h3>
              <Sparkline data={p.series.map((s) => s.points)} zeroBased area height={48} label={`Son 30 günde günlük bağış puanı; toplam ${fmtNumber(p.series.reduce((a, s) => a + s.points, 0))}`} />
            </section>

            <section aria-labelledby={`top-${p.id}`} className="space-y-2">
              <h3 id={`top-${p.id}`} className="text-sm font-semibold text-fg">
                En çok bağışlayanlar
              </h3>
              {p.topDonors.length === 0 ? (
                <p className="text-sm text-fg-muted"><AdminKesifBagisText k="noDonations" /></p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {p.topDonors.map((d, i) => (
                    <li key={d.userId} className="flex justify-between gap-2">
                      <span className="truncate">
                        {i + 1}. {d.name} <span className="text-fg-muted">{d.email ?? ''}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{fmtNumber(d.points)} puan</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-labelledby={`rec-${p.id}`} className="space-y-2">
              <h3 id={`rec-${p.id}`} className="text-sm font-semibold text-fg">
                Son bağışlar
              </h3>
              {p.recent.length === 0 ? (
                <p className="text-sm text-fg-muted"><AdminKesifBagisText k="noDonations" /></p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {p.recent.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 py-2 text-left hover:bg-surface-2" onClick={() => receipt.open(t.id)}>
                        <span className="min-w-0 truncate">
                          {t.user.name ?? t.user.email ?? 'Kullanıcı'} <span className="text-fg-muted">· {fmtDateTime(t.at)}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">{fmtNumber(t.points)} puan</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby={`his-${p.id}`} className="space-y-2">
              <h3 id={`his-${p.id}`} className="text-sm font-semibold text-fg">
                Değişiklik geçmişi
              </h3>
              {p.history.length === 0 ? (
                <p className="text-sm text-fg-muted"><AdminKesifBagisText k="noPanelChanges" /></p>
              ) : (
                <Timeline events={p.history.map((h) => ({ id: h.id, title: h.summary, at: h.at, actor: h.actor ?? 'Bilinmeyen yönetici' }))} />
              )}
            </section>
          </div>
        );
      }}
    </QueryState>
  );
}

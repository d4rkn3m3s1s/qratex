'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, ArchiveRestore, Copy, Info, Pause, Pencil, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KeyValueList, Timeline } from '@/components/ds/data';
import { ConfirmAction, QueryState, TONE_CALLOUT } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CAMPAIGN_TYPE_HINT,
  CHALLENGE_TYPE_LABEL,
  backgroundLabel,
  formatIstanbul,
  formatSpan,
  themeLabel,
  type CalendarKind,
  type CampaignDetail,
  type CampaignView,
  type ConceptDetail,
  type ConceptView,
  type Conflict,
  type HistoryEntry,
} from '@/lib/campaigns-calendar/contract';
import * as api from './api';
import { ItemStatus, STATUS_HINT, campaignAudience, campaignEffect, fmtInt, fmtMult } from './parts';
import { AdminKampanyaTakvimiText } from './copy';

const SOURCE_LABEL: Record<string, string> = {
  feedback: 'Geri bildirim',
  dealer_passive: 'Tüketim pasif puanı',
  review: 'Yorum',
};

function ConflictList({ items }: { items: Conflict[] }) {
  if (items.length === 0) return <p className="qx-small text-fg-muted"><AdminKampanyaTakvimiText k="noOverlap" /></p>;
  return (
    <ul className="space-y-1.5">
      {items.map((c) => (
        <li key={c.id} className={cn('flex items-start gap-1.5 rounded-md border p-2 qx-small', TONE_CALLOUT[c.severity === 'warning' ? 'warning' : 'info'])}>
          {c.severity === 'warning' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span>
            {c.message}
            <span className="block qx-caption text-fg-muted">
              {formatIstanbul(c.start)} – {formatIstanbul(c.end)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function HistoryList({ items }: { items: HistoryEntry[] }) {
  if (items.length === 0) return <p className="qx-small text-fg-muted"><AdminKampanyaTakvimiText k="noChanges" /></p>;
  return (
    <Timeline
      events={items.map((h) => ({
        id: h.id,
        title: h.label,
        at: h.at,
        actor: h.actor ?? undefined,
        description: [h.changedFields.length ? `Değişen: ${h.changedFields.join(', ')}` : null, h.reason ? `Gerekçe: ${h.reason}` : null]
          .filter(Boolean)
          .join(' · ') || undefined,
      }))}
    />
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="qx-small font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

function windowRows(item: CampaignView | ConceptView) {
  const now = Date.now();
  const s = new Date(item.startDate).getTime();
  const e = new Date(item.endDate).getTime();
  const rel = now < s ? `${formatSpan(s - now)} sonra başlıyor` : now <= e ? `${formatSpan(e - now)} kaldı` : 'bitti';
  return [
    { id: 'start', label: 'Başlangıç', value: formatIstanbul(item.startDate) },
    { id: 'end', label: 'Bitiş', value: formatIstanbul(item.endDate), hint: rel },
  ];
}

function CampaignBody({ d }: { d: CampaignDetail }) {
  const c = d.item;
  const budgetPct = c.budgetPoints && c.budgetSpent !== null ? Math.min(100, Math.round((c.budgetSpent / c.budgetPoints) * 100)) : null;
  return (
    <div className="space-y-5">
      <p className="qx-small text-fg-muted">{STATUS_HINT[c.status]}.</p>
      {(c.conditionsInvalid || c.challengeInvalid || c.multiplier !== c.effectiveMultiplier || c.bonusPoints !== c.effectiveBonus) && (
        <ul className={cn('space-y-1 rounded-md border p-2 qx-small', TONE_CALLOUT.warning)}>
          {c.conditionsInvalid && <li><AdminKampanyaTakvimiText k="badConditions" /></li>}
          {c.challengeInvalid && <li><AdminKampanyaTakvimiText k="badQuest" /></li>}
          {(c.multiplier !== c.effectiveMultiplier || c.bonusPoints !== c.effectiveBonus) && (
            <li>
              Eski kayıt tavan üstü: kayıtta {fmtMult(c.multiplier)} / +{fmtInt(c.bonusPoints)}, uygulanan {fmtMult(c.effectiveMultiplier)} / +
              {fmtInt(c.effectiveBonus)}.
            </li>
          )}
        </ul>
      )}
      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          { id: 'effect', label: 'Etki', value: campaignEffect(c) },
          { id: 'aud', label: 'Hedef kitle', value: campaignAudience(c), hint: CAMPAIGN_TYPE_HINT[c.type] },
          ...windowRows(c),
          {
            id: 'budget',
            label: 'Puan bütçesi',
            value: c.budgetPoints ? `${fmtInt(c.budgetSpent ?? 0)} / ${fmtInt(c.budgetPoints)}` : 'Bütçesiz',
            hint: budgetPct !== null ? `%${budgetPct} kullanıldı` : undefined,
          },
          {
            id: 'ch',
            label: 'Görev',
            value: c.challenge
              ? `${CHALLENGE_TYPE_LABEL[c.challenge.type]} × ${c.challenge.goal} → ${fmtInt(c.challenge.rewardPoints)} puan${d.badge ? ` + ${d.badge.icon} ${d.badge.name}` : ''}`
              : 'Yok',
          },
        ]}
      />
      {budgetPct !== null && (
        <div
          role="progressbar"
          aria-label="Bütçe kullanımı"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={budgetPct}
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className={cn('h-full', budgetPct >= 90 ? 'bg-warning' : 'bg-brand')} style={{ width: `${budgetPct}%` }} />
        </div>
      )}
      <Block title="Gerçek etki (puan defteri)">
        <KeyValueList
          layout="grid"
          columns={2}
          items={[
            { id: 'pts', label: 'Kampanyalı kazanımlarda basılan', value: `${fmtInt(d.impact.points)} puan`, hint: 'Taban puan dahil' },
            { id: 'users', label: 'Etkilenen müşteri', value: fmtInt(d.impact.users) },
            { id: 'ev', label: 'Kampanyalı kazanım', value: fmtInt(d.impact.events) },
            ...(d.impact.challenge
              ? [{ id: 'claims', label: 'Görev ödülü alan', value: `${fmtInt(d.impact.challenge.claims)} kişi · ${fmtInt(d.impact.challenge.points)} puan` }]
              : []),
          ]}
        />
        {d.impact.bySource.length > 0 && (
          <ul className="qx-caption text-fg-muted">
            {d.impact.bySource.map((s) => (
              <li key={s.source}>
                {SOURCE_LABEL[s.source] ?? s.source}: {fmtInt(s.points)} puan · {fmtInt(s.events)} kazanım
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title="Çakışmalar">
        <ConflictList items={d.conflicts} />
      </Block>
      <Block title="Değişiklik geçmişi">
        <HistoryList items={d.history} />
      </Block>
    </div>
  );
}

function ConceptBody({ d }: { d: ConceptDetail }) {
  const k = d.item;
  return (
    <div className="space-y-5">
      <p className="qx-small text-fg-muted">{STATUS_HINT[k.status]}.</p>
      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          ...windowRows(k),
          { id: 'pri', label: 'Öncelik', value: String(k.priority) },
          { id: 'theme', label: 'Palet', value: themeLabel(k.themePresetId) ?? 'Değişmez' },
          { id: 'bg', label: 'Arka plan', value: backgroundLabel(k.backgroundEffect) ?? 'Değişmez' },
          { id: 'banner', label: 'Banner', value: k.bannerText ? `${k.bannerEmoji ? `${k.bannerEmoji} ` : ''}${k.bannerText}` : 'Yok', span: 2 },
          ...(k.description ? [{ id: 'note', label: 'İç not', value: k.description, span: 2 as const }] : []),
        ]}
      />
      <Block title="Çakışmalar">
        <ConflictList items={d.conflicts} />
      </Block>
      <Block title="Değişiklik geçmişi">
        <HistoryList items={d.history} />
      </Block>
    </div>
  );
}

/**
 * Kayıt detayı: durum, etki (gerçek defter), çakışmalar, denetim geçmişi ve aksiyonlar
 * (Düzenle · Kopyala · Yayına al/Duraklat · Arşivle/Geri al). Aksiyonlar sürüm taşır (409).
 */
export function DetailContent({
  kind,
  id,
  onEdit,
  onCopy,
  onDone,
}: {
  kind: CalendarKind;
  id: string;
  onEdit: (item: CampaignView | ConceptView) => void;
  onCopy: (item: CampaignView | ConceptView) => void;
  onDone: (message: string) => void;
}) {
  const qc = useQueryClient();
  const query = useQuery<CampaignDetail | ConceptDetail>({
    queryKey: api.qk.detail(kind, id),
    queryFn: ({ signal }) => (kind === 'campaign' ? api.getCampaignDetail(id, signal) : api.getConceptDetail(id, signal)),
  });
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [toggleOpen, setToggleOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const item = query.data?.item;

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: api.qk.all });
      onDone(message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'İşlem tamamlanamadı.';
      setActionError(msg);
      await qc.invalidateQueries({ queryKey: api.qk.detail(kind, id) });
      throw e;
    } finally {
      setBusy(false);
    }
  }

  const live = item && (item.status === 'live' || item.status === 'shadowed' || item.status === 'exhausted');
  const word = kind === 'campaign' ? 'Kampanya' : 'Konsept';

  return (
    <QueryState query={query} skeleton="detail" error={{ title: `${word} yüklenemedi` }}>
      {(d) => (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <ItemStatus status={d.item.status} targeted={d.item.kind === 'campaign' ? d.item.targeted : false} size="md" />
            {d.item.archived && (
              <span className="qx-caption text-fg-muted">
                {formatIstanbul(d.item.archived.at)} · {d.item.archived.reason}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!d.item.archived && (
              <Button size="sm" variant="outline" onClick={() => onEdit(d.item)} className="min-h-11 sm:min-h-9">
                <Pencil className="h-4 w-4" aria-hidden /> Düzenle
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onCopy(d.item)} className="min-h-11 sm:min-h-9">
              <Copy className="h-4 w-4" aria-hidden /> Kopyala
            </Button>
            {!d.item.archived && new Date(d.item.endDate).getTime() >= Date.now() && (
              <Button size="sm" variant="outline" onClick={() => setToggleOpen(true)} disabled={busy} className="min-h-11 sm:min-h-9">
                {d.item.isActive ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                {d.item.isActive ? 'Duraklat' : 'Yayına al'}
              </Button>
            )}
            {d.item.archived ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                className="min-h-11 sm:min-h-9"
                onClick={() => void run(() => api.restoreItem(kind, id, d.item.version), `${word} arşivden çıkarıldı (duraklatılmış).`).catch(() => undefined)}
              >
                <ArchiveRestore className="h-4 w-4" aria-hidden /> Arşivden çıkar
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setArchiveOpen(true)} disabled={busy} className="min-h-11 sm:min-h-9">
                <Archive className="h-4 w-4" aria-hidden /> Arşivle
              </Button>
            )}
          </div>
          {actionError && (
            <p className={cn('rounded-md border p-2 qx-small', TONE_CALLOUT.danger)} role="alert">
              {actionError}
            </p>
          )}
          {d.item.kind === 'campaign' ? <CampaignBody d={d as CampaignDetail} /> : <ConceptBody d={d as ConceptDetail} />}

          <ConfirmAction
            open={toggleOpen}
            onOpenChange={setToggleOpen}
            tone="warning"
            title={d.item.isActive ? `${word} duraklatılsın mı?` : `${word} yayına alınsın mı?`}
            description={
              kind === 'campaign'
                ? d.item.isActive
                  ? 'Duraklatılınca bu kampanya puan kazanımlarına uygulanmaz; penceresi açık kalır.'
                  : 'Penceresi açıksa kampanya hemen puan kazanımlarına uygulanmaya başlar.'
                : d.item.isActive
                  ? 'Duraklatılınca bu konsept kullanıcılara görünmez.'
                  : 'Penceresi açıksa ve kazanan olursa konsept hemen tüm kullanıcılara görünür.'
            }
            impact={live && kind === 'campaign' && d.item.kind === 'campaign' ? [{ label: 'Şu anki etki', value: campaignEffect(d.item), emphasis: true }] : undefined}
            confirmLabel={d.item.isActive ? 'Duraklat' : 'Yayına al'}
            irreversibleNote={false}
            onConfirm={() =>
              run(() => api.setActive(kind, id, !d.item.isActive, d.item.version), d.item.isActive ? `${word} duraklatıldı.` : `${word} yayına alındı.`)
            }
          />

          <ConfirmAction
            open={archiveOpen}
            onOpenChange={(o) => {
              setArchiveOpen(o);
              if (!o) setReason('');
            }}
            tone="warning"
            title={`${word} arşivlensin mi?`}
            description={
              <span className="block space-y-2">
                <span className="block">
                  Arşivlenen kayıt hiçbir yerde uygulanmaz ve listeden çıkar. Silinmez: geçmişi ve puan defteri izi korunur, istenirse geri alınır.
                </span>
                <span className="block">
                  <Label htmlFor="cc-archive-reason" className="qx-small font-medium text-fg">
                    Gerekçe
                  </Label>
                  <Textarea id="cc-archive-reason" className="mt-1" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                </span>
              </span>
            }
            impact={live ? [{ label: 'Durum', value: 'Şu an penceresi açık; arşivle hemen durur', emphasis: true }] : undefined}
            confirmLabel="Arşivle"
            disabled={reason.trim().length < 3}
            irreversibleNote={false}
            onConfirm={() => run(() => api.archiveItem(kind, id, reason.trim(), d.item.version), `${word} arşivlendi.`)}
          />
        </div>
      )}
    </QueryState>
  );
}

export function detailTitle(kind: CalendarKind, item: CampaignView | ConceptView | undefined): string {
  if (!item) return kind === 'campaign' ? 'Kampanya' : 'Konsept';
  return item.kind === 'concept' && item.bannerEmoji ? `${item.bannerEmoji} ${item.name}` : item.name;
}

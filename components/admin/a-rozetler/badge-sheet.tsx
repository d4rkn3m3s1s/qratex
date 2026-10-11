'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Copy, Gift, Pencil, Sparkles, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, MetricGrid, MetricTile, Sparkline, StatusBadge, Timeline, statusBadgeProps, type TimelineEvent } from '@/components/ds/data';
import { BadgeGlyph, RarityBadge } from '@/components/ds/play';
import { ConfirmAction, EmptyState, QueryState } from '@/components/states';
import { CATEGORY_LABEL, TRACKABILITY_LABEL, requirementLabel, type ArchiveImpact, type BadgeDetail } from '@/lib/admin-badges/contract';
import { badgeAction, badgeKeys, errorText, fetchBadge } from './api';
import { BADGE_STATUS, TRACKABILITY_TONE, fmtAgo, fmtDateTime, fmtNumber } from './format';
import { GrantDialog, glyphSource } from './parts';
import { useSourceT } from '@/components/ds/page/source-dict';
import { BADGES_DICT, useBadgesAdminCopy } from './copy';

export function BadgeDetailBody({ id, onEdit, onOpenOther }: { id: string; onEdit: (b: BadgeDetail) => void; onOpenOther: (id: string) => void }) {
  const q = useQuery({ queryKey: badgeKeys.detail(id), queryFn: () => fetchBadge(id), staleTime: 15_000 });
  return (
    <QueryState query={q} skeleton="detail">
      {(b) => <DetailContent b={b} onEdit={onEdit} onOpenOther={onOpenOther} />}
    </QueryState>
  );
}

function DetailContent({ b, onEdit, onOpenOther }: { b: BadgeDetail; onEdit: (b: BadgeDetail) => void; onOpenOther: (id: string) => void }) {
  const fz = useBadgesAdminCopy().fx;
  const L = useSourceT(BADGES_DICT);
  const uy = useBadgesAdminCopy().ui2;
  const ux = useBadgesAdminCopy().ui;
  const qc = useQueryClient();
  const [grantOpen, setGrantOpen] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: badgeKeys.all });
  const archived = b.status === 'archived';
  const total30 = b.series30.reduce((s, d) => s + d.count, 0);
  const first = b.series30[0]?.count ?? 0;
  const last = b.series30[b.series30.length - 1]?.count ?? 0;

  const events: TimelineEvent[] = b.audit.map((a) => ({ id: a.id, title: a.action, description: a.summary ?? undefined, at: a.at, actor: a.actor ?? 'Sistem' }));

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-4">
        <BadgeGlyph label={b.name} {...glyphSource(b.icon)} rarity={b.rarity} color={b.color ?? undefined} size="lg" />
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-lg font-semibold text-fg">{b.name}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <RarityBadge rarity={b.rarity} />
            <StatusBadge size="sm" {...statusBadgeProps(BADGE_STATUS, b.status)} label={L(statusBadgeProps(BADGE_STATUS, b.status).label)} />
            <StatusBadge size="sm" tone={TRACKABILITY_TONE[b.trackability]} label={L(TRACKABILITY_LABEL[b.trackability])} />
          </div>
          {b.description ? <p className="text-sm text-fg-muted">{b.description}</p> : null}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {!archived ? (
          <Button className="min-h-11 sm:min-h-10" onClick={() => onEdit(b)}>
            <Pencil className="h-4 w-4" aria-hidden />
            {ux.duzenle}
          </Button>
        ) : null}
        {!b.isCharacter && !archived ? (
          <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setGrantOpen(true)} disabled={b.status !== 'active'} title={b.status !== 'active' ? 'Pasif rozet verilemez' : undefined}>
            <Gift className="h-4 w-4" aria-hidden />
            {ux.kullaniciyaVer}
          </Button>
        ) : null}
        {!b.isCharacter ? (
          <Button
            variant="outline"
            className="min-h-11 sm:min-h-10"
            onClick={async () => {
              try {
                const r = await badgeAction<{ action: 'duplicate'; id: string }>(b.id, { action: 'duplicate' });
                toast.success(ux.kopyaOlusturulduPasifGozden);
                await refresh();
                onOpenOther(r.id);
              } catch (e) {
                toast.error(errorText(e));
              }
            }}
          >
            <Copy className="h-4 w-4" aria-hidden />
            {ux.cogalt}
          </Button>
        ) : null}
        <Button asChild variant="outline" className="min-h-11 sm:min-h-10">
          <Link href={b.isCharacter ? `?tab=test&reveal=${encodeURIComponent(b.id)}` : `?tab=test&scene=${encodeURIComponent(b.id)}`}>
            <Sparkles className="h-4 w-4" aria-hidden />
            {b.isCharacter ? ux.acilisiOnizle : ux.t3bSahneyiOnizle}
          </Link>
        </Button>
        {archived ? (
          <ConfirmAction
            tone="brand"
            title={ux.rozetArsivdenGeriAlinsin}
            description={ux.rozetPasifOlarakGeri}
            confirmLabel={ux.geriAl}
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10">
                <ArchiveRestore className="h-4 w-4" aria-hidden />
                {ux.arsivdenGeriAl}
              </Button>
            }
            onConfirm={async () => {
              await badgeAction(b.id, { action: 'restore' });
              toast.success(ux.rozetArsivdenGeriAlindi);
              await refresh();
            }}
          />
        ) : !b.isCharacter ? (
          <ConfirmAction
            tone="warning"
            title={fz.archiveTitle(b.name)}
            description={ux.arsivlenenRozetYeniKazanilamaz}
            irreversibleNote={false}
            confirmLabel={ux.arsivle}
            confirmPhrase={b.earnedCount > 0 ? b.name : undefined}
            loadImpact={async () => {
              const r = await badgeAction<{ action: 'archive'; dryRun: true; impact: ArchiveImpact }>(b.id, { action: 'archive', dryRun: true });
              return {
                items: [{ label: ux.rozetiKazanmisKullaniciKorunur, value: fmtNumber(r.impact.earnedBy), emphasis: r.impact.earnedBy > 0 }],
                warning: r.impact.blockers[0],
              };
            }}
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10">
                <Archive className="h-4 w-4" aria-hidden />
                {ux.arsivle}
              </Button>
            }
            onConfirm={async () => {
              await badgeAction(b.id, { action: 'archive', confirm: true });
              toast.success(ux.rozetArsivlendiKazanimlarKorundu);
              await refresh();
            }}
          />
        ) : null}
      </div>

      <MetricGrid cols={3}>
        <MetricTile size="compact" label={ux.toplamKazanim} metric={{ value: b.earnedCount }} />
        <MetricTile size="compact" label={ux.son30Gun} metric={{ value: total30 }} hint={b.lastEarnedAt ? `Son: ${fmtAgo(b.lastEarnedAt)}` : ux.hicKazanilmadi} />
        <MetricTile size="compact" label={ux.odulPuani} metric={{ value: b.rewardPoints }} hint={b.rewardPoints > 0 ? ux.kazanincaYatar : ux.odulTablosundaYok} />
      </MetricGrid>

      <section aria-labelledby={`spark-${b.id}`} className="space-y-2">
        <h4 id={`spark-${b.id}`} className="text-sm font-medium text-fg">
          {ux.son30GundeKazanim}
        </h4>
        <Sparkline
          data={b.series30.map((d) => d.count)}
          area
          zeroBased
          height={56}
          label={fz.trend30(first ?? 0, last ?? 0, total30)}
        />
      </section>

      <KeyValueList
        items={[
          { id: 'id', label: ux.kimlik, value: b.id, mono: true, copyValue: b.id },
          { id: 'cat', label: ux.kategori, value: b.isCharacter ? fz.series(b.seriesName ?? '—') : L(CATEGORY_LABEL[b.category] ?? b.category) },
          {
            id: 'req',
            label: ux.kazanmaKosulu,
            value: b.isCharacter ? ux.karakterMotoruKategoriEsigi : `${requirementLabel(b.requirementType)} ≥ ${fmtNumber(b.targetValue)}`,
            hint: b.requirementPeriod ? fz.periodIs(b.requirementPeriod) : undefined,
          },
          {
            id: 'reward',
            label: ux.odulPuani,
            value: b.rewardPoints > 0 ? `+${fmtNumber(b.rewardPoints)} puan` : 'Yok',
            hint: ux.kodIcindekiOdulTablosundan,
          },
          {
            id: 'vis',
            label: ux.musterideGorunurluk,
            value: ux.kazanilanaKadarGorunmez,
            hint: ux.tamSurprizPolitikasiPuanla,
          },
          { id: 'cost', label: ux.eskiSatinAlmaMaliyeti, value: b.pointCost != null ? fz.legacyCost(fmtNumber(b.pointCost)) : null, hidden: b.pointCost == null },
          { id: 'reveal', label: ux.acilisMetni, value: b.hasRevealText ? 'Var' : ux.yokAcilistaKatalogAciklamasi, hidden: b.hasRevealText == null },
          { id: 'upd', label: ux.sonGuncelleme, value: fmtDateTime(b.updatedAt) },
          { id: 'arc', label: ux.arsivTarihi, value: fmtDateTime(b.archivedAt), hidden: !b.archivedAt },
        ]}
      />

      <section aria-labelledby={`earners-${b.id}`} className="space-y-2">
        <h4 id={`earners-${b.id}`} className="text-sm font-medium text-fg">
          {uy.sonKazananlar}
        </h4>
        {b.recentEarners.length === 0 ? (
          <EmptyState title={ux.henuzKazananYok} description={ux.buRozetiKimseKazanmadi} compact headingLevel="p" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {b.recentEarners.map((e) => (
              <li key={e.userId}>
                <Link
                  href={`/admin/users/${encodeURIComponent(e.userId)}`}
                  className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserRound className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-fg">{e.name || ux.adsizKullanici}</span>
                    {e.email ? <span className="ml-2 text-fg-muted">{e.email}</span> : null}
                  </span>
                  <time dateTime={e.earnedAt} className="shrink-0 text-xs text-fg-muted">
                    {fmtAgo(e.earnedAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`audit-${b.id}`} className="space-y-2">
        <h4 id={`audit-${b.id}`} className="text-sm font-medium text-fg">
          {ux.degisiklikGecmisi}
        </h4>
        <Timeline events={events} timeStyle="datetime" dense ariaLabel={ux.rozetDegisiklikGecmisi} emptyLabel={ux.kayitliDegisiklikYok} />
      </section>

      <GrantDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        badgeName={b.name}
        onConfirm={async (email, reason) => {
          const r = await badgeAction<{ action: 'grant'; userId: string; awarded: boolean; reason?: string }>(b.id, { action: 'grant', email, reason });
          if (r.awarded) toast.success('Rozet verildi.');
          else toast.message(r.reason ?? ux.kullaniciBuRozeteZaten);
          await refresh();
        }}
      />
    </div>
  );
}

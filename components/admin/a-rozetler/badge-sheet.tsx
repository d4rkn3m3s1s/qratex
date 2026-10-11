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

export function BadgeDetailBody({ id, onEdit, onOpenOther }: { id: string; onEdit: (b: BadgeDetail) => void; onOpenOther: (id: string) => void }) {
  const q = useQuery({ queryKey: badgeKeys.detail(id), queryFn: () => fetchBadge(id), staleTime: 15_000 });
  return (
    <QueryState query={q} skeleton="detail">
      {(b) => <DetailContent b={b} onEdit={onEdit} onOpenOther={onOpenOther} />}
    </QueryState>
  );
}

function DetailContent({ b, onEdit, onOpenOther }: { b: BadgeDetail; onEdit: (b: BadgeDetail) => void; onOpenOther: (id: string) => void }) {
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
            <StatusBadge size="sm" {...statusBadgeProps(BADGE_STATUS, b.status)} />
            <StatusBadge size="sm" tone={TRACKABILITY_TONE[b.trackability]} label={TRACKABILITY_LABEL[b.trackability]} />
          </div>
          {b.description ? <p className="text-sm text-fg-muted">{b.description}</p> : null}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {!archived ? (
          <Button className="min-h-11 sm:min-h-10" onClick={() => onEdit(b)}>
            <Pencil className="h-4 w-4" aria-hidden />
            Düzenle
          </Button>
        ) : null}
        {!b.isCharacter && !archived ? (
          <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setGrantOpen(true)} disabled={b.status !== 'active'} title={b.status !== 'active' ? 'Pasif rozet verilemez' : undefined}>
            <Gift className="h-4 w-4" aria-hidden />
            Kullanıcıya ver
          </Button>
        ) : null}
        {!b.isCharacter ? (
          <Button
            variant="outline"
            className="min-h-11 sm:min-h-10"
            onClick={async () => {
              try {
                const r = await badgeAction<{ action: 'duplicate'; id: string }>(b.id, { action: 'duplicate' });
                toast.success('Kopya oluşturuldu (pasif). Gözden geçirip etkinleştirin.');
                await refresh();
                onOpenOther(r.id);
              } catch (e) {
                toast.error(errorText(e));
              }
            }}
          >
            <Copy className="h-4 w-4" aria-hidden />
            Çoğalt
          </Button>
        ) : null}
        <Button asChild variant="outline" className="min-h-11 sm:min-h-10">
          <Link href={b.isCharacter ? `?tab=test&reveal=${encodeURIComponent(b.id)}` : `?tab=test&scene=${encodeURIComponent(b.id)}`}>
            <Sparkles className="h-4 w-4" aria-hidden />
            {b.isCharacter ? 'Açılışı önizle' : '3B sahneyi önizle'}
          </Link>
        </Button>
        {archived ? (
          <ConfirmAction
            tone="brand"
            title="Rozet arşivden geri alınsın mı?"
            description="Rozet PASİF olarak geri gelir; gözden geçirip etkinleştirdiğinizde yeniden kazanılabilir."
            confirmLabel="Geri al"
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10">
                <ArchiveRestore className="h-4 w-4" aria-hidden />
                Arşivden geri al
              </Button>
            }
            onConfirm={async () => {
              await badgeAction(b.id, { action: 'restore' });
              toast.success('Rozet arşivden geri alındı (pasif).');
              await refresh();
            }}
          />
        ) : !b.isCharacter ? (
          <ConfirmAction
            tone="warning"
            title={`“${b.name}” arşivlensin mi?`}
            description="Arşivlenen rozet yeni kazanılamaz ve katalogda gizlenir. Kullanıcıların kazandığı rozetler ve geçmiş korunur; istediğinizde geri alabilirsiniz."
            irreversibleNote={false}
            confirmLabel="Arşivle"
            confirmPhrase={b.earnedCount > 0 ? b.name : undefined}
            loadImpact={async () => {
              const r = await badgeAction<{ action: 'archive'; dryRun: true; impact: ArchiveImpact }>(b.id, { action: 'archive', dryRun: true });
              return {
                items: [{ label: 'Rozeti kazanmış kullanıcı (korunur)', value: fmtNumber(r.impact.earnedBy), emphasis: r.impact.earnedBy > 0 }],
                warning: r.impact.blockers[0],
              };
            }}
            trigger={
              <Button variant="outline" className="min-h-11 sm:min-h-10">
                <Archive className="h-4 w-4" aria-hidden />
                Arşivle
              </Button>
            }
            onConfirm={async () => {
              await badgeAction(b.id, { action: 'archive', confirm: true });
              toast.success('Rozet arşivlendi; kazanımlar korundu.');
              await refresh();
            }}
          />
        ) : null}
      </div>

      <MetricGrid cols={3}>
        <MetricTile size="compact" label="Toplam kazanım" metric={{ value: b.earnedCount }} />
        <MetricTile size="compact" label="Son 30 gün" metric={{ value: total30 }} hint={b.lastEarnedAt ? `Son: ${fmtAgo(b.lastEarnedAt)}` : 'Hiç kazanılmadı'} />
        <MetricTile size="compact" label="Ödül puanı" metric={{ value: b.rewardPoints }} hint={b.rewardPoints > 0 ? 'Kazanınca yatar' : 'Ödül tablosunda yok'} />
      </MetricGrid>

      <section aria-labelledby={`spark-${b.id}`} className="space-y-2">
        <h4 id={`spark-${b.id}`} className="text-sm font-medium text-fg">
          Son 30 günde kazanım (İstanbul günü)
        </h4>
        <Sparkline
          data={b.series30.map((d) => d.count)}
          area
          zeroBased
          height={56}
          label={`Son 30 gün: ilk gün ${first}, son gün ${last}, toplam ${total30} kazanım`}
        />
      </section>

      <KeyValueList
        items={[
          { id: 'id', label: 'Kimlik', value: b.id, mono: true, copyValue: b.id },
          { id: 'cat', label: 'Kategori', value: b.isCharacter ? `Dizi · ${b.seriesName ?? '—'}` : CATEGORY_LABEL[b.category] ?? b.category },
          {
            id: 'req',
            label: 'Kazanma koşulu',
            value: b.isCharacter ? 'Karakter motoru (kategori eşiği)' : `${requirementLabel(b.requirementType)} ≥ ${fmtNumber(b.targetValue)}`,
            hint: b.requirementPeriod ? `Dönem: ${b.requirementPeriod}` : undefined,
          },
          {
            id: 'reward',
            label: 'Ödül puanı',
            value: b.rewardPoints > 0 ? `+${fmtNumber(b.rewardPoints)} puan` : 'Yok',
            hint: 'Kod içindeki ödül tablosundan gelir; panelden değiştirilemez.',
          },
          {
            id: 'vis',
            label: 'Müşteride görünürlük',
            value: 'Kazanılana kadar görünmez',
            hint: 'Tam sürpriz politikası; puanla satın alma kapalı.',
          },
          { id: 'cost', label: 'Eski satın alma maliyeti', value: b.pointCost != null ? `${fmtNumber(b.pointCost)} puan (kullanılmıyor)` : null, hidden: b.pointCost == null },
          { id: 'reveal', label: 'Açılış metni', value: b.hasRevealText ? 'Var' : 'Yok — açılışta katalog açıklaması görünür', hidden: b.hasRevealText == null },
          { id: 'upd', label: 'Son güncelleme', value: fmtDateTime(b.updatedAt) },
          { id: 'arc', label: 'Arşiv tarihi', value: fmtDateTime(b.archivedAt), hidden: !b.archivedAt },
        ]}
      />

      <section aria-labelledby={`earners-${b.id}`} className="space-y-2">
        <h4 id={`earners-${b.id}`} className="text-sm font-medium text-fg">
          Son kazananlar
        </h4>
        {b.recentEarners.length === 0 ? (
          <EmptyState title="Henüz kazanan yok" description="Bu rozeti kimse kazanmadı." compact headingLevel="p" />
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
                    <span className="font-medium text-fg">{e.name || 'Adsız kullanıcı'}</span>
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
          Değişiklik geçmişi
        </h4>
        <Timeline events={events} timeStyle="datetime" dense ariaLabel="Rozet değişiklik geçmişi" emptyLabel="Kayıtlı değişiklik yok." />
      </section>

      <GrantDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        badgeName={b.name}
        onConfirm={async (email, reason) => {
          const r = await badgeAction<{ action: 'grant'; userId: string; awarded: boolean; reason?: string }>(b.id, { action: 'grant', email, reason });
          if (r.awarded) toast.success('Rozet verildi.');
          else toast.message(r.reason ?? 'Kullanıcı bu rozete zaten sahip.');
          await refresh();
        }}
      />
    </div>
  );
}

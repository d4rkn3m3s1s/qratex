'use client';

import { AlertTriangle, CalendarDays, CheckCircle2, Coins, PackageOpen } from 'lucide-react';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { RarityBadge } from '@/components/ds/play';
import { TIER_LABEL, type SurpriseStats } from '@/lib/admin-surprise-boxes/contract';
import { fmtDayKey, fmtNumber, pct } from './format';

/**
 * Günlük giriş kutuları — salt okunur. Müşteri Ödüllerim'de "Aç" dediğinde üretilir (İstanbul günü,
 * kişi başı bir). Olasılık tablosu kurallardan türetilir ve son 30 günün gerçek dağılımıyla
 * ki-kare testiyle karşılaştırılır.
 */
export function DailyTab({ stats, loading }: { stats: SurpriseStats | undefined; loading: boolean }) {
  const d = stats?.daily;
  const maxDay = Math.max(1, ...(d?.series14d.map((s) => s.generated) ?? [0]));
  return (
    <div className="space-y-6">
      <MetricGrid cols={3}>
        <MetricTile label="Üretilen kutu (30 gün)" metric={{ value: d?.generated30d ?? null }} icon={<CalendarDays />} loading={loading} hint="Müşteri kutuyu açmak istediğinde üretilir" />
        <MetricTile
          label="Açılma oranı (30 gün)"
          metric={{ value: d?.openRate30d ?? null, format: 'percent' }}
          icon={<PackageOpen />}
          tone="info"
          loading={loading}
          hint={d ? `${fmtNumber(d.opened30d)} açıldı` : undefined}
        />
        <MetricTile label="Basılan puan (30 gün)" metric={{ value: d?.points30d ?? null, unit: 'puan' }} icon={<Coins />} tone="brand" loading={loading} hint={d ? `Kutu başına ${d.pointsRange.min}–${d.pointsRange.max} puan` : undefined} />
      </MetricGrid>

      <SectionCard title="Son 14 gün" description="Gün başına üretilen ve açılan günlük kutu (İstanbul günü).">
        {d ? (
          <>
            <ol className="flex h-36 items-end gap-1" aria-hidden>
              {d.series14d.map((s) => (
                <li key={s.day} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-0.5" title={`${fmtDayKey(s.day)}: ${s.generated} üretildi, ${s.opened} açıldı`}>
                  <div className="relative w-full rounded-t bg-surface-3" style={{ height: `${(s.generated / maxDay) * 100}%` }}>
                    <div className="absolute inset-x-0 bottom-0 rounded-t bg-brand" style={{ height: `${pct(s.opened, s.generated)}%` }} />
                  </div>
                  <span className="qx-caption truncate text-center text-[10px] text-fg-muted">{fmtDayKey(s.day).split(' ')[0]}</span>
                </li>
              ))}
            </ol>
            <p className="qx-caption mt-2 flex flex-wrap gap-3 text-fg-muted">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" aria-hidden /> Açılan
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-surface-3 ring-1 ring-inset ring-border" aria-hidden /> Üretilen
              </span>
            </p>
            <table className="sr-only">
              <caption>Son 14 günün günlük kutu sayıları</caption>
              <thead>
                <tr>
                  <th scope="col">Gün</th>
                  <th scope="col">Üretilen</th>
                  <th scope="col">Açılan</th>
                </tr>
              </thead>
              <tbody>
                {d.series14d.map((s) => (
                  <tr key={s.day}>
                    <th scope="row">{fmtDayKey(s.day)}</th>
                    <td>{s.generated}</td>
                    <td>{s.opened}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="h-36 rounded-card bg-surface-2" aria-hidden />
        )}
      </SectionCard>

      <SectionCard
        title="Olasılık tablosu doğrulaması"
        description={`Beklenen: puan ${d?.pointsRange.min ?? '—'}–${d?.pointsRange.max ?? '—'} arasında düzgün dağılır, kademe puandan türer. Gözlenen: son 30 günde üretilen günlük kutular.`}
      >
        {d ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b border-subtle text-left text-fg-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Kademe
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Beklenen
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Gözlenen
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Kutu
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.tiers.map((t) => (
                    <tr key={t.tier} className="border-b border-subtle last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        <span className="sr-only">{TIER_LABEL[t.tier]}</span>
                        <RarityBadge rarity={t.tier} register="ops" aria-hidden />
                      </th>
                      <td className="qx-num py-2 pr-3 text-right">%{t.expectedPct.toLocaleString('tr-TR')}</td>
                      <td className="qx-num py-2 pr-3 text-right">{t.observedPct == null ? '—' : `%${t.observedPct.toLocaleString('tr-TR')}`}</td>
                      <td className="qx-num py-2 text-right">{fmtNumber(t.observed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.drift == null ? (
              <p className="qx-small text-fg-muted">Karşılaştırma için en az 50 kutu gerekir; son 30 günde {fmtNumber(d.tiers.reduce((a, t) => a + t.observed, 0))} kutu var.</p>
            ) : d.drift.significant ? (
              <p role="status" className="qx-small flex gap-2 rounded-card border border-warning-border bg-warning-subtle px-3 py-2 text-fg">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                Gözlenen dağılım beklenenden anlamlı biçimde sapıyor (χ² = {d.drift.chiSquare.toLocaleString('tr-TR')}, {fmtNumber(d.drift.sample)} kutu, p &lt; 0,01). Puan üretimini kontrol edin.
              </p>
            ) : (
              <p role="status" className="qx-small flex gap-2 rounded-card border border-success-border bg-success-subtle px-3 py-2 text-fg">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                Dağılım beklenenle uyumlu (χ² = {d.drift.chiSquare.toLocaleString('tr-TR')}, {fmtNumber(d.drift.sample)} kutu).
              </p>
            )}
          </div>
        ) : (
          <div className="h-40 rounded-card bg-surface-2" aria-hidden />
        )}
      </SectionCard>
    </div>
  );
}

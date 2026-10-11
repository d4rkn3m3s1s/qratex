'use client';

import Link from 'next/link';
import { Award, Coins, Flame, Gift, MessageSquareText, Sparkles } from 'lucide-react';
import { KeyValueList, MetricGrid, MetricTile } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import type { User360 } from '@/lib/admin-users/contract';
import { fmtDateTime, fmtNumber } from '../format';

/** Genel bakış: bakiye, seviye (kanonik geometrik formül), aktivite sayaçları ve bağlam. */
export function OverviewTab({ user: u, onGoTab }: { user: User360; onGoTab: (tab: string) => void }) {
  const g = u.gamification;
  const levelMismatch = g.level !== g.derivedLevel;
  return (
    <div className="space-y-6">
      <MetricGrid cols={3}>
        <MetricTile label="Puan bakiyesi" metric={{ value: g.points }} icon={<Coins />} tone="brand" animate hint="Ekonomi sekmesinde defter ve düzeltme" />
        <MetricTile label="Toplam XP" metric={{ value: g.xp }} icon={<Sparkles />} animate hint={`Sonraki seviyeye ${fmtNumber(g.xpToNextLevel)} XP`} />
        <MetricTile label="Giriş serisi" metric={{ value: g.loginStreak }} icon={<Flame />} hint={`En uzun: ${fmtNumber(g.loginStreakLongest)} gün`} />
        <MetricTile label="Geri bildirim" metric={{ value: u.counts.feedbacks }} icon={<MessageSquareText />} />
        <MetricTile label="Rozet" metric={{ value: u.counts.badges }} icon={<Award />} />
        <MetricTile label="Ödül" metric={{ value: u.counts.rewards }} icon={<Gift />} hint={u.counts.consumptions ? `${fmtNumber(u.counts.consumptions)} tüketim kaydı` : undefined} />
      </MetricGrid>

      <SectionCard title="Seviye" description="Seviye XP'den kanonik formülle türer (1.000 · 1,5ⁿ artan eşikler).">
        <div className="flex items-baseline justify-between gap-3">
          <p className="qx-h3 text-fg">Seviye {fmtNumber(g.derivedLevel)}</p>
          <p className="text-sm tabular-nums text-fg-muted">%{g.levelProgress}</p>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-label={`Seviye ${g.derivedLevel} ilerlemesi`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={g.levelProgress}
        >
          <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${g.levelProgress}%` }} />
        </div>
        <p className="mt-2 text-sm text-fg-muted">
          Seviye {fmtNumber(g.derivedLevel + 1)} için {fmtNumber(g.xpToNextLevel)} XP kaldı.
        </p>
        {levelMismatch ? (
          <p className="mt-2 text-sm text-warning">
            Kayıtlı seviye ({g.level}) XP'den türeyen seviyeyle ({g.derivedLevel}) uyuşmuyor; eski "Seviye Ayarla" işleminden kalmış olabilir. Seviye artık
            yalnız XP ile değişir.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Bağlam" density="compact">
        <KeyValueList
          items={[
            { label: 'Hesap güncellendi', value: fmtDateTime(u.identity.updatedAt) },
            { label: 'Dil', value: u.identity.preferredLanguage === 'en' ? 'İngilizce' : 'Türkçe' },
            { label: 'Okunmamış bildirim', value: fmtNumber(u.counts.unreadNotifications) },
            { label: 'Onur listesi', value: g.isHallOfFame ? 'Evet' : 'Hayır' },
            ...(u.team
              ? [
                  {
                    label: 'İç ekip',
                    value: (
                      <Link href="/admin/ekip" className="text-brand underline-offset-4 hover:underline">
                        {u.team.department ? `${u.team.department} · ${u.team.teamRole === 'yonetici' ? 'Yönetici' : 'Üye'}` : 'Departman atanmamış'}
                      </Link>
                    ),
                  },
                ]
              : []),
            ...(u.dealer
              ? [
                  {
                    label: 'İşletme',
                    value: (
                      <button type="button" className="text-brand underline-offset-4 hover:underline" onClick={() => onGoTab('isletme')}>
                        {u.dealer.businessName || 'Adsız işletme'} · {fmtNumber(u.dealer.activeQrCodes)} QR · {fmtNumber(u.dealer.staffCount)} personel
                      </button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </SectionCard>

    </div>
  );
}

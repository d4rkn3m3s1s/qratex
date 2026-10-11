'use client';

import Link from 'next/link';
import { Gauge, ShieldCheck } from 'lucide-react';
import { SectionCard, TONE_CHIP } from '@/components/states';
import { cn } from '@/lib/utils';
import { MULTIPLIER_LIMITS, MULTIPLIER_SCOPE, sourceLabel, type CapsSnapshot, type Multipliers } from '@/lib/admin-economy/contract';
import { Callout, HistoryPanel, NumField, fmtInt, fmtMult } from './parts';
import type { EditableResource } from './use-editable-resource';

export type MultipliersMeta = { isDefault: boolean; caps: CapsSnapshot };

const LABELS: Record<string, string> = { pointMultiplier: 'Puan çarpanı', xpMultiplier: 'XP çarpanı' };
export const multipliersPathLabel = (p: string) => LABELS[p] ?? p;

export function MultipliersTab({ resource }: { resource: EditableResource<Multipliers, MultipliersMeta> }) {
  const d = resource.draft!;
  const b = resource.baseline!;
  const { caps, isDefault } = resource.meta!;
  const set = resource.setDraft;
  const high = (v: number) => Number.isFinite(v) && v > MULTIPLIER_LIMITS.warnAbove;

  return (
    <div className="space-y-6">
      <SectionCard
        icon={<Gauge className="h-4 w-4" />}
        title="Platform çarpanları"
        description={
          <>
            Çarpanlar yalnız aşağıdaki kaynaklarda uygulanır. Zaman pencereli (ör. hafta sonu 2×) çarpanlar için{' '}
            <Link className="underline underline-offset-2" href="/admin/campaigns-calendar">Sezonluk Kampanyalar</Link> kullanılır.
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2" aria-label="Uygulandığı kaynaklar">
            <span className="qx-caption text-fg-muted">Uygulandığı kaynaklar:</span>
            {MULTIPLIER_SCOPE.map((s) => (
              <span key={s} className={cn('qx-caption rounded-chip border px-2 py-0.5', TONE_CHIP.brand)}>
                {sourceLabel(s)}
              </span>
            ))}
            <span className="qx-caption text-fg-muted">· oyun, çark, görev, seri, davet ve iade/emanet yolları çarpandan muaftır.</span>
          </div>
          {isDefault && <Callout tone="info">Henüz kayıtlı ayar yok: varsayılan 1× uygulanıyor. İlk kayıtla oluşturulur.</Callout>}
          <div className="grid gap-4 sm:grid-cols-2">
            <NumField
              label="Puan çarpanı"
              decimal
              unit="×"
              min={MULTIPLIER_LIMITS.min}
              max={MULTIPLIER_LIMITS.max}
              value={d.pointMultiplier}
              baseline={b.pointMultiplier}
              description={`${MULTIPLIER_LIMITS.min.toLocaleString('tr-TR')}–${MULTIPLIER_LIMITS.max}×, varsayılan 1×. Geri bildirim ödülü (VIP ve kampanyadan sonra) bununla çarpılır.`}
              onChange={(v) => set((p) => ({ ...p, pointMultiplier: v }))}
            />
            <NumField
              label="XP çarpanı"
              decimal
              unit="×"
              min={MULTIPLIER_LIMITS.min}
              max={MULTIPLIER_LIMITS.max}
              value={d.xpMultiplier}
              baseline={b.xpMultiplier}
              description={`${MULTIPLIER_LIMITS.min.toLocaleString('tr-TR')}–${MULTIPLIER_LIMITS.max}×, varsayılan 1×. Geri bildirim XP'sine uygulanır.`}
              onChange={(v) => set((p) => ({ ...p, xpMultiplier: v }))}
            />
          </div>
          {(high(d.pointMultiplier) || high(d.xpMultiplier)) && (
            <Callout tone="warning">
              {fmtMult(MULTIPLIER_LIMITS.warnAbove)} üstü çarpan geri bildirim enflasyonu yaratır; günlük tavan ({fmtInt(caps.rows.find((r) => r.category === 'feedback')?.daily ?? null)} puan) yine
              uygulanır. Kaydetmeden önce Simülasyon sekmesinde etkisini görün.
            </Callout>
          )}
          <p className="qx-caption text-fg-muted">
            Değişiklik birkaç saniye ile 1 dakika içinde tüm sunuculara yayılır. Günlük XP tavanı, seviye atlama ödülü ve sezon alanları hiçbir puan motoru tarafından
            okunmadığı için bu ekrandan kaldırıldı.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Tavanlar"
        description="Kategori tavanları kodda tek kaynaktan (lib/economy/caps) gelir ve her kredide sunucuda uygulanır. Buradan değiştirilemez; değişiklik kod incelemesiyle yapılır."
        density="flush"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left">
            <caption className="sr-only">Kategori tavanları ve son 7 günde tavana takılan kredi sayısı</caption>
            <thead>
              <tr className="qx-caption border-b border-subtle text-fg-muted">
                <th scope="col" className="px-4 py-2 font-medium">Kategori</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Günlük</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Haftalık</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Bayi başına / gün</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Tavana takılan (7 gün)</th>
              </tr>
            </thead>
            <tbody>
              {caps.rows.map((r) => (
                <tr key={r.category} className="qx-small border-b border-subtle last:border-0">
                  <th scope="row" className="px-4 py-2.5 font-medium">
                    {r.label}
                    {r.requiresActor && <span className="qx-caption block font-normal text-fg-muted">bayi atfı zorunlu</span>}
                  </th>
                  <td className="qx-num px-4 py-2.5 text-right">{fmtInt(r.daily)}</td>
                  <td className="qx-num px-4 py-2.5 text-right">{fmtInt(r.weekly)}</td>
                  <td className="qx-num px-4 py-2.5 text-right">{fmtInt(r.perActorDaily)}</td>
                  <td className="qx-num px-4 py-2.5 text-right">{fmtInt(r.hits7d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="qx-caption space-y-1 border-t border-subtle px-4 py-3 text-fg-muted">
          <p>
            Tek seferlik kredi üst sınırı: <span className="qx-num">{fmtInt(caps.maxSingleMint)}</span> puan / <span className="qx-num">{fmtInt(caps.maxSingleXp)}</span> XP (aşan yapılandırma
            kredide reddedilir).
          </p>
          <p>
            Admin düzeltmesi: işlem başı <span className="qx-num">{fmtInt(caps.adminAdjust.perOperation)}</span>, kullanıcı başına günlük{' '}
            <span className="qx-num">{fmtInt(caps.adminAdjust.dailyPerUser)}</span>; <span className="qx-num">{fmtInt(caps.adminAdjust.secondApprovalAbove)}</span> üstü ikinci admin onayı ister.
          </p>
          <p>&quot;Tavana takılan&quot; = tavan dolu olduğu için 0 puanla deftere yazılan kredi (yalnız tek-kez anahtarlı yollar).</p>
        </div>
      </SectionCard>

      <HistoryPanel
        kind="multipliers"
        labelOf={multipliersPathLabel}
        refreshKey={resource.version}
        onLoadSnapshot={(e) => {
          const s = e.snapshot as Partial<Multipliers> | null;
          if (s && typeof s.pointMultiplier === 'number' && typeof s.xpMultiplier === 'number') {
            resource.loadIntoDraft({ pointMultiplier: s.pointMultiplier, xpMultiplier: s.xpMultiplier });
          }
        }}
      />
    </div>
  );
}

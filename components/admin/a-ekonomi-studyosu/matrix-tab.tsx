'use client';

import * as React from 'react';
import Link from 'next/link';
import { Cake, Disc3, Flame, MessageSquare, Plus, RotateCcw, Target, Trash2, UserPlus, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/states';
import { Field } from '@/components/ds/form';
import { IconButton } from '@/components/ds/a11y';
import { cn } from '@/lib/utils';
import type { PointsMatrix, SpinPrizeType } from '@/lib/points-rules';
import { POINTS_MATRIX_LIMITS as L } from '@/lib/points-matrix-schema';
import { ECONOMY_CAPS } from '@/lib/economy/caps';
import { spinExpectedPoints, spinExpectedXp } from '@/lib/admin-economy/simulate';
import { Callout, HistoryPanel, NumField, fmtInt, fmtMult, fmtPct } from './parts';
import type { EditableResource } from './use-editable-resource';

export type MatrixMeta = { defaults: PointsMatrix };

const PATH_LABELS: Array<[RegExp, string]> = [
  [/^feedback\.longTextThreshold$/, 'Geri bildirim · detay eşiği'],
  [/^feedback\.base\.points$/, 'Geri bildirim · temel puan'],
  [/^feedback\.base\.xp$/, 'Geri bildirim · temel XP'],
  [/^feedback\.detailed\.points$/, 'Geri bildirim · detaylı puan'],
  [/^feedback\.detailed\.xp$/, 'Geri bildirim · detaylı XP'],
  [/^consumptionReview\.longTextThreshold$/, 'Tüketim yorumu · detay eşiği'],
  [/^consumptionReview\.base\.points$/, 'Tüketim yorumu · temel puan'],
  [/^consumptionReview\.base\.xp$/, 'Tüketim yorumu · temel XP'],
  [/^consumptionReview\.detailed\.points$/, 'Tüketim yorumu · detaylı puan'],
  [/^consumptionReview\.detailed\.xp$/, 'Tüketim yorumu · detaylı XP'],
  [/^referral\.referredPoints$/, 'Davet · kodu giren'],
  [/^referral\.referrerPoints$/, 'Davet · kod sahibi'],
  [/^birthday\.points$/, 'Doğum günü bonusu'],
  [/^quest\.default\.points$/, 'Görev varsayılanı · puan'],
  [/^quest\.default\.xp$/, 'Görev varsayılanı · XP'],
  [/^spin\.enabled$/, 'Çark · açık/kapalı'],
  [/^spin\.dailyLimit$/, 'Çark · günlük limit'],
];

// Satır kimliği sayacı (yalnız React anahtarı; DOM'a yazılmaz → hidrasyon etkisi yok). Modül
// düzeyinde tutulur: render sırasında ref okumak/yazmak yasak (react-hooks/refs).
let uidSeq = 0;
const nextUid = () => `r${++uidSeq}`;

export function matrixPathLabel(path: string): string {
  for (const [re, label] of PATH_LABELS) if (re.test(path)) return label;
  const streak = path.match(/^streak\.milestones\[(\d+)\](?:\.(days|points))?$/);
  if (streak) return `Seri · ${streak[1]}. gün${streak[2] === 'points' ? ' bonusu' : ''}`;
  const spin = path.match(/^spin\.prizes\[([^\]]+)\](?:\.(\w+))?$/);
  if (spin) {
    const f: Record<string, string> = { label: 'etiket', type: 'tip', value: 'değer', weight: 'ağırlık' };
    return `Çark ödülü ${spin[1]}${spin[2] ? ` · ${f[spin[2]] ?? spin[2]}` : ''}`;
  }
  return path;
}

const TYPE_LABEL: Record<SpinPrizeType, string> = { points: 'Puan', xp: 'XP', nothing: 'Boş' };

function newPrizeId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.floor(Date.now()).toString(36);
  return `spin_${rand}`;
}

/** Etikette geçen sayı değerle çelişiyor mu ("100 Puan" + değer 10). */
function labelMismatch(label: string, type: SpinPrizeType, value: number): string | null {
  const m = label.replace(/\./g, '').match(/\d+/);
  if (!m || type === 'nothing') return null;
  const n = Number(m[0]);
  return n !== value ? `Etiket ${fmtInt(n)} diyor, verilen ${fmtInt(value)} ${type === 'xp' ? 'XP' : 'puan'}` : null;
}

type Res = EditableResource<PointsMatrix, MatrixMeta>;

export function MatrixTab({ resource, pointMultiplier }: { resource: Res; pointMultiplier: number | null }) {
  const m = resource.draft!;
  const base = resource.baseline!;
  const meta = resource.meta!;
  const set = resource.setDraft;

  // Satır kimlikleri yalnız istemci durumu (React anahtarı) — gün yazarken odak kaybolmaz.
  const [streakUids, setStreakUids] = React.useState<string[]>(() => m.streak.milestones.map(() => nextUid()));
  if (streakUids.length !== m.streak.milestones.length) {
    // Dışarıdan değişti (yeniden yükleme / geçmişten yükleme / kaydetme sonrası sıralama).
    setStreakUids(m.streak.milestones.map(() => nextUid()));
  }

  const setMilestone = (i: number, patch: Partial<{ days: number; points: number }>) =>
    set((p) => ({ ...p, streak: { milestones: p.streak.milestones.map((x, j) => (j === i ? { ...x, ...patch } : x)) } }));
  const sortMilestones = () => {
    const order = m.streak.milestones.map((x, i) => ({ x, uid: streakUids[i] })).sort((a, b) => (a.x.days || 0) - (b.x.days || 0));
    setStreakUids(order.map((o) => o.uid));
    set((p) => ({ ...p, streak: { milestones: order.map((o) => o.x) } }));
  };
  const addMilestone = () => {
    const last = m.streak.milestones.reduce((mx, x) => Math.max(mx, Number.isFinite(x.days) ? x.days : 0), 0);
    const days = Math.min(L.streakDays.max, Math.max(L.streakDays.min, last > 0 ? last * 2 : 7));
    setStreakUids((u) => [...u, nextUid()]);
    set((p) => ({ ...p, streak: { milestones: [...p.streak.milestones, { days, points: 0 }] } }));
  };
  const removeMilestone = (i: number) => {
    setStreakUids((u) => u.filter((_, j) => j !== i));
    set((p) => ({ ...p, streak: { milestones: p.streak.milestones.filter((_, j) => j !== i) } }));
  };

  const setPrize = (i: number, patch: Partial<PointsMatrix['spin']['prizes'][number]>) =>
    set((p) => ({
      ...p,
      spin: {
        ...p.spin,
        prizes: p.spin.prizes.map((x, j) => {
          if (j !== i) return x;
          const next = { ...x, ...patch };
          if (next.type === 'nothing') next.value = 0;
          return next;
        }),
      },
    }));

  const totalWeight = m.spin.prizes.reduce((s, x) => s + (Number.isFinite(x.weight) ? Math.max(0, x.weight) : 0), 0);
  const ev = spinExpectedPoints(m.spin);
  const evXp = spinExpectedXp(m.spin);
  const evBase = spinExpectedPoints(base.spin);
  const duplicateDays = new Set(
    m.streak.milestones.map((x) => x.days).filter((d, i, arr) => arr.indexOf(d) !== i)
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Callout tone="info">
          Değişiklikler kaydedilene kadar canlı değildir. Kayıttan sonra sunucu önbelleği nedeniyle en geç ~60 sn içinde tüm sunuculara yayılır.
          Gerçek kazanç, çarpan ve tavanlarla birlikte hesaplanır (bkz. <em>Çarpan ve tavanlar</em> sekmesi).
        </Callout>

        <ReviewSection
          id="feedback"
          icon={<MessageSquare className="h-4 w-4" />}
          title="Geri bildirim"
          description={
            <>
              QR geri bildirimi. Platform puan çarpanı {pointMultiplier ? <strong>{fmtMult(pointMultiplier)}</strong> : 'bilinmiyor'} ve
              tavan (günde {fmtInt(ECONOMY_CAPS.feedback.daily)}, haftada {fmtInt(ECONOMY_CAPS.feedback.weekly)}) uygulanır.
            </>
          }
          value={m.feedback}
          baseline={base.feedback}
          onChange={(v) => set((p) => ({ ...p, feedback: v }))}
        />
        <ReviewSection
          id="review"
          icon={<Utensils className="h-4 w-4" />}
          title="Tüketim yorumu"
          description="Tüketim sonrası yorum. Geri bildirimle aynı tavan kovasını paylaşır; platform çarpanı uygulanmaz. Karakter rozeti yalnız bu yolu sayar."
          value={m.consumptionReview}
          baseline={base.consumptionReview}
          onChange={(v) => set((p) => ({ ...p, consumptionReview: v }))}
        />

        <div className="grid gap-6 md:grid-cols-2">
          <SectionCard
            icon={<UserPlus className="h-4 w-4" />}
            title="Davet"
            description={
              <>
                Kayıtta tek seferlik. Kademe ödülleri ve aylık limit <Link className="underline underline-offset-2" href="/admin/referrals">Davet Programı</Link>&apos;nda.
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
              <NumField label="Kodu giren" unit="puan" min={0} max={L.referral.max} value={m.referral.referredPoints} baseline={base.referral.referredPoints} onChange={(v) => set((p) => ({ ...p, referral: { ...p.referral, referredPoints: v } }))} />
              <NumField label="Kod sahibi" unit="puan" min={0} max={L.referral.max} value={m.referral.referrerPoints} baseline={base.referral.referrerPoints} onChange={(v) => set((p) => ({ ...p, referral: { ...p.referral, referrerPoints: v } }))} />
            </div>
          </SectionCard>
          <SectionCard icon={<Cake className="h-4 w-4" />} title="Doğum günü" description="Yılda bir kez, doğum günü haftasında talep edilir.">
            <NumField label="Bonus" unit="puan" min={0} max={L.birthday.max} value={m.birthday.points} baseline={base.birthday.points} onChange={(v) => set((p) => ({ ...p, birthday: { points: v } }))} />
          </SectionCard>
        </div>

        <SectionCard
          icon={<Target className="h-4 w-4" />}
          title="Görev varsayılanı"
          description={
            <>
              Yalnız ödülü tanımsız görevlerde kullanılır; görevlerin kendi ödülü <Link className="underline underline-offset-2" href="/admin/quests">Görevler</Link> sayfasında. Ödül nesnesinde XP yoksa XP = puan ÷ 2.
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <NumField label="Puan" unit="puan" min={0} max={L.questReward.max} value={m.quest.default.points} baseline={base.quest.default.points} onChange={(v) => set((p) => ({ ...p, quest: { default: { ...p.quest.default, points: v } } }))} />
            <NumField label="XP" unit="XP" min={0} max={L.questReward.max} value={m.quest.default.xp} baseline={base.quest.default.xp} onChange={(v) => set((p) => ({ ...p, quest: { default: { ...p.quest.default, xp: v } } }))} />
          </div>
        </SectionCard>

        <SectionCard
          icon={<Flame className="h-4 w-4" />}
          title="Giriş serisi kilometre taşları"
          description="Müşterinin Ana Sayfa'daki günlük giriş serisi bu taşları öder. Bonus yalnız TAM gün eşleşmesinde ve her taş için ömür boyu bir kez verilir (14. günde, 15. günde değil). Gün en az 2 olmalı."
          actions={
            <Button type="button" size="sm" variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" onClick={addMilestone} disabled={m.streak.milestones.length >= L.streakMilestones.max}>
              <Plus className="h-4 w-4" aria-hidden /> Taş ekle
            </Button>
          }
        >
          <ul className="space-y-3">
            {m.streak.milestones.map((x, i) => (
              <li key={streakUids[i] ?? i} role="group" aria-label={`${Number.isFinite(x.days) ? x.days : '?'}. gün kilometre taşı`} className="grid grid-cols-[1fr_1fr_auto] items-start gap-3">
                <div onBlur={sortMilestones}>
                  <NumField label="Gün" min={L.streakDays.min} max={L.streakDays.max} value={x.days} onChange={(v) => setMilestone(i, { days: v })} description={duplicateDays.has(x.days) ? 'Bu gün iki kez tanımlı' : undefined} />
                </div>
                <NumField label="Bonus" unit="puan" min={0} max={L.streakPoints.max} value={x.points} onChange={(v) => setMilestone(i, { points: v })} />
                <IconButton
                  aria-label={`${Number.isFinite(x.days) ? x.days : ''}. gün kilometre taşını sil`}
                  icon={<Trash2 className="h-4 w-4" />}
                  variant="ghost"
                  className="mt-6"
                  disabled={m.streak.milestones.length <= L.streakMilestones.min}
                  onClick={() => removeMilestone(i)}
                />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          icon={<Disc3 className="h-4 w-4" />}
          title="Günlük çark"
          description="Sunucu ağırlıklı seçim yapar; kullanıcıya gösterilen ve kredilenen ödül aynı kimlikten gelir (kimlikler benzersiz)."
          actions={
            <Button type="button" size="sm" variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => set((p) => ({ ...p, spin: { ...meta.defaults.spin } }))}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Çarkı varsayılana al
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Çark açık" description={m.spin.enabled ? 'Müşteriler günlük çarkı çevirebilir.' : 'Çark kapalı: çevirme isteği reddedilir.'}>
                {(a11y) => <Switch {...a11y} checked={m.spin.enabled} onCheckedChange={(v) => set((p) => ({ ...p, spin: { ...p.spin, enabled: v } }))} />}
              </Field>
              <NumField label="Günlük çevirme limiti" unit="kez" min={L.spinDailyLimit.min} max={L.spinDailyLimit.max} value={m.spin.dailyLimit} baseline={base.spin.dailyLimit} onChange={(v) => set((p) => ({ ...p, spin: { ...p.spin, dailyLimit: v } }))} />
            </div>

            <ul className="space-y-3">
              {m.spin.prizes.map((x, i) => {
                const pct = totalWeight > 0 && Number.isFinite(x.weight) ? (x.weight / totalWeight) * 100 : 0;
                const mismatch = labelMismatch(x.label, x.type, x.value);
                return (
                  <li key={x.id} role="group" aria-label={`Çark ödülü: ${x.label || 'adsız'}`} className="rounded-control border border-subtle p-3">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
                      <Field label="Etiket" error={x.label.trim() ? undefined : 'Etiket gerekli'} description={mismatch ?? undefined}>
                        {(a11y) => <Input {...a11y} value={x.label} maxLength={L.spinLabel.max} onChange={(e) => setPrize(i, { label: e.target.value })} />}
                      </Field>
                      <Field label="Tip">
                        {(a11y) => (
                          <select
                            {...a11y}
                            value={x.type}
                            onChange={(e) => setPrize(i, { type: e.target.value as SpinPrizeType })}
                            className="h-11 w-full rounded-control border border-input bg-background px-3 text-sm sm:h-10"
                          >
                            {(Object.keys(TYPE_LABEL) as SpinPrizeType[]).map((t) => (
                              <option key={t} value={t}>
                                {TYPE_LABEL[t]}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                      <NumField label="Değer" min={x.type === 'nothing' ? 0 : 1} max={L.spinPrizeValue.max} value={x.value} disabled={x.type === 'nothing'} onChange={(v) => setPrize(i, { value: v })} />
                      <NumField label="Ağırlık" min={L.spinPrizeWeight.min} max={L.spinPrizeWeight.max} value={x.weight} onChange={(v) => setPrize(i, { weight: v })} description={`olasılık ${fmtPct(pct)}`} />
                      <IconButton
                        aria-label={`${x.label || 'Adsız'} ödülünü sil`}
                        icon={<Trash2 className="h-4 w-4" />}
                        variant="ghost"
                        className="sm:mt-6"
                        disabled={m.spin.prizes.length <= L.spinPrizes.min}
                        onClick={() => set((p) => ({ ...p, spin: { ...p.spin, prizes: p.spin.prizes.filter((_, j) => j !== i) } }))}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 gap-1.5 sm:min-h-9"
              disabled={m.spin.prizes.length >= L.spinPrizes.max}
              onClick={() =>
                set((p) => ({
                  ...p,
                  spin: { ...p.spin, prizes: [...p.spin.prizes, { id: newPrizeId(), label: '10 Puan', type: 'points', value: 10, weight: 1 }] },
                }))
              }
            >
              <Plus className="h-4 w-4" aria-hidden /> Ödül ekle
            </Button>
          </div>
        </SectionCard>

        <HistoryPanel
          kind="matrix"
          labelOf={matrixPathLabel}
          refreshKey={resource.version}
          onLoadSnapshot={(e) => {
            if (e.snapshot && typeof e.snapshot === 'object') resource.loadIntoDraft(e.snapshot as PointsMatrix);
          }}
        />
      </div>

      <aside aria-label="Canlı önizleme" className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
        <FeedbackPreview matrix={m} pointMultiplier={pointMultiplier} />
        <SpinPreview prizes={m.spin.prizes} enabled={m.spin.enabled} ev={ev} evXp={evXp} evBase={evBase} totalWeight={totalWeight} />
        <StreakPreview milestones={m.streak.milestones} />
      </aside>
    </div>
  );
}

function ReviewSection({
  id,
  icon,
  title,
  description,
  value,
  baseline,
  onChange,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  value: PointsMatrix['feedback'];
  baseline: PointsMatrix['feedback'];
  onChange: (v: PointsMatrix['feedback']) => void;
}) {
  const warn = Number.isFinite(value.detailed.points) && Number.isFinite(value.base.points) && value.detailed.points < value.base.points;
  return (
    <SectionCard icon={icon} title={title} description={description}>
      <div className="space-y-4" id={`sec-${id}`}>
        <NumField
          label="Detaylı yorum eşiği"
          unit="karakter"
          description="Kullanıcının kendi yazdığı metin bu uzunluğa ulaşırsa detaylı ödül verilir (hızlı etiketler sayılmaz)."
          min={L.longTextThreshold.min}
          max={L.longTextThreshold.max}
          value={value.longTextThreshold}
          baseline={baseline.longTextThreshold}
          onChange={(v) => onChange({ ...value, longTextThreshold: v })}
          className="max-w-xs"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-3 rounded-control border border-subtle p-3">
            <legend className="qx-small px-1 font-medium">Temel</legend>
            <NumField label="Puan" unit="puan" min={0} max={L.reviewReward.max} value={value.base.points} baseline={baseline.base.points} onChange={(v) => onChange({ ...value, base: { ...value.base, points: v } })} />
            <NumField label="XP" unit="XP" min={0} max={L.reviewReward.max} value={value.base.xp} baseline={baseline.base.xp} onChange={(v) => onChange({ ...value, base: { ...value.base, xp: v } })} />
          </fieldset>
          <fieldset className="space-y-3 rounded-control border border-subtle p-3">
            <legend className="qx-small px-1 font-medium">Detaylı</legend>
            <NumField label="Puan" unit="puan" min={0} max={L.reviewReward.max} value={value.detailed.points} baseline={baseline.detailed.points} onChange={(v) => onChange({ ...value, detailed: { ...value.detailed, points: v } })} />
            <NumField label="XP" unit="XP" min={0} max={L.reviewReward.max} value={value.detailed.xp} baseline={baseline.detailed.xp} onChange={(v) => onChange({ ...value, detailed: { ...value.detailed, xp: v } })} />
          </fieldset>
        </div>
        {warn && <Callout tone="warning">Detaylı ödül temel ödülden düşük: uzun yorum yazmak cezalandırılmış olur.</Callout>}
      </div>
    </SectionCard>
  );
}

function FeedbackPreview({ matrix, pointMultiplier }: { matrix: PointsMatrix; pointMultiplier: number | null }) {
  const [len, setLen] = React.useState(80);
  const detailed = len >= matrix.feedback.longTextThreshold;
  const grant = detailed ? matrix.feedback.detailed : matrix.feedback.base;
  const mult = pointMultiplier ?? 1;
  const pts = Math.floor((Number.isFinite(grant.points) ? grant.points : 0) * mult);
  return (
    <SectionCard title="Geri bildirim önizlemesi" headingLevel="h3" density="compact">
      <NumField label="Örnek yorum uzunluğu" unit="karakter" min={0} max={5000} value={len} onChange={(v) => setLen(Number.isFinite(v) ? v : 0)} />
      <p className="qx-small mt-3" aria-live="polite">
        {detailed ? 'Detaylı' : 'Temel'} ödül: <strong className="qx-num">{fmtInt(pts)} puan</strong> + {fmtInt(grant.xp)} XP
        {pointMultiplier && pointMultiplier !== 1 ? <span className="text-fg-muted"> (çarpan {fmtMult(pointMultiplier)} dahil)</span> : null}
      </p>
      <p className="qx-caption mt-1 text-fg-muted">VIP ve sezonsal kampanya çarpanı kullanıcıya göre ayrıca uygulanır; günlük tavan dolduysa kredi kısalır.</p>
    </SectionCard>
  );
}

function SpinPreview({
  prizes,
  enabled,
  ev,
  evXp,
  evBase,
  totalWeight,
}: {
  prizes: PointsMatrix['spin']['prizes'];
  enabled: boolean;
  ev: number;
  evXp: number;
  evBase: number;
  totalWeight: number;
}) {
  return (
    <SectionCard title="Çark dağılımı" headingLevel="h3" density="compact">
      {!enabled ? (
        <p className="qx-small text-fg-muted">Çark kapalı — kimse çeviremez.</p>
      ) : (
        <>
          <p className="qx-small">
            Çevirme başına beklenen: <strong className="qx-num">{ev.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan</strong>
            {evXp > 0 && <> + {evXp.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} XP</>}
            {Math.abs(ev - evBase) > 0.05 && (
              <span className="text-fg-muted"> (kayıtlı: {evBase.toLocaleString('tr-TR', { maximumFractionDigits: 1 })})</span>
            )}
          </p>
          <ul className="mt-3 space-y-1.5" aria-label="Ödül olasılıkları">
            {prizes.map((p) => {
              const pct = totalWeight > 0 && Number.isFinite(p.weight) ? (p.weight / totalWeight) * 100 : 0;
              return (
                <li key={p.id} className="qx-caption">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{p.label || 'Adsız'}</span>
                    <span className="qx-num text-fg-muted">{fmtPct(pct)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-surface-muted" aria-hidden>
                    <div
                      className={cn('h-full rounded-full transition-[width] duration-base ease-standard motion-reduce:transition-none', p.type === 'nothing' ? 'bg-fg-subtle' : 'bg-brand')}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

function StreakPreview({ milestones }: { milestones: PointsMatrix['streak']['milestones'] }) {
  const valid = milestones.filter((x) => Number.isFinite(x.days) && Number.isFinite(x.points)).sort((a, b) => a.days - b.days);
  let cum = 0;
  return (
    <SectionCard title="Seri zaman çizelgesi" headingLevel="h3" density="compact" description="Kesintisiz seride hangi gün kaç bonus kazanılır.">
      {valid.length === 0 ? (
        <p className="qx-small text-fg-muted">Geçerli kilometre taşı yok.</p>
      ) : (
        <ol className="space-y-1">
          {valid.map((x) => {
            cum += x.points;
            return (
              <li key={`${x.days}-${x.points}`} className="qx-caption flex justify-between gap-2">
                <span>{fmtInt(x.days)}. gün</span>
                <span className="qx-num">
                  +{fmtInt(x.points)} <span className="text-fg-muted">(toplam {fmtInt(cum)})</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}

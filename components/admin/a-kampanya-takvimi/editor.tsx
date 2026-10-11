'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, Loader2, Sparkles, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DetailSheet } from '@/components/ds/data';
import { ConfirmAction, TONE_CALLOUT } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { THEME_COLOR_PRESETS } from '@/lib/theme-presets';
import { SEASONAL_BACKGROUND_OPTIONS, SEASONAL_TEMPLATES, SEASONAL_THEME_OPTIONS } from '@/lib/seasonal-concept-options';
import {
  CAMPAIGN_CAPS,
  CAMPAIGN_TYPE_HINT,
  CAMPAIGN_TYPE_LABEL,
  CHALLENGE_TYPE_LABEL,
  CHALLENGE_TYPES,
  bannerPromisesPoints,
  campaignInputSchema,
  conceptInputSchema,
  formatSpan,
  isoToIstanbulLocal,
  istanbulLocalToIso,
  type CalendarKind,
  type CampaignView,
  type ConceptView,
  type PreviewResult,
} from '@/lib/campaigns-calendar/contract';
import { SEASONAL_CAMPAIGN_TYPES } from '@/lib/seasonal-campaign-constants';
import * as api from './api';
import { FieldError, fmtInt, fmtMult } from './parts';

export type EditorTarget =
  | { kind: CalendarKind; mode: 'create'; source?: CampaignView | ConceptView | null }
  | { kind: CalendarKind; mode: 'edit'; source: CampaignView | ConceptView };

// ───────────────────────────── Taslak modeli ─────────────────────────────

type CampaignDraft = {
  name: string;
  description: string;
  type: string;
  multiplier: string;
  bonusPoints: string;
  imageUrl: string;
  minLevel: string;
  budgetPoints: string;
  challengeOn: boolean;
  challengeType: string;
  challengeGoal: string;
  challengeReward: string;
  challengeBadge: string;
  isActive: boolean;
  start: string;
  end: string;
};

type ConceptDraft = {
  name: string;
  description: string;
  priority: string;
  backgroundEffect: string;
  themePresetId: string;
  bannerText: string;
  bannerEmoji: string;
  isActive: boolean;
  start: string;
  end: string;
};

const NONE = '__none__';

function defaultWindow(): { start: string; end: string } {
  const now = Date.now();
  const start = new Date(Math.ceil(now / 3600_000) * 3600_000);
  return { start: isoToIstanbulLocal(start), end: isoToIstanbulLocal(new Date(start.getTime() + 14 * 86_400_000)) };
}

function shiftYear(local: string, years: number): string {
  if (!local) return local;
  const y = Number(local.slice(0, 4));
  return `${y + years}${local.slice(4)}`;
}

function campaignDraftFrom(src: CampaignView | null, copy: boolean): CampaignDraft {
  const w = defaultWindow();
  if (!src) {
    return {
      name: '',
      description: '',
      type: 'SEASONAL',
      multiplier: '1,5',
      bonusPoints: '0',
      imageUrl: '',
      minLevel: '',
      budgetPoints: '',
      challengeOn: false,
      challengeType: 'games_played',
      challengeGoal: '5',
      challengeReward: '100',
      challengeBadge: NONE,
      isActive: true,
      ...w,
    };
  }
  // Kopya: bitmiş kampanyanın penceresi bir sonraki yıla taşınır, geleceğe dönük olanınki korunur.
  const ended = new Date(src.endDate).getTime() < Date.now();
  const start = isoToIstanbulLocal(src.startDate);
  const end = isoToIstanbulLocal(src.endDate);
  return {
    name: copy ? `${src.name} (kopya)`.slice(0, 120) : src.name,
    description: src.description,
    type: src.type,
    multiplier: String(src.multiplier).replace('.', ','),
    bonusPoints: String(src.bonusPoints),
    imageUrl: src.imageUrl ?? '',
    minLevel: src.minLevel ? String(src.minLevel) : '',
    budgetPoints: src.budgetPoints ? String(src.budgetPoints) : '',
    challengeOn: !!src.challenge,
    challengeType: src.challenge?.type ?? 'games_played',
    challengeGoal: String(src.challenge?.goal ?? 5),
    challengeReward: String(src.challenge?.rewardPoints ?? 100),
    challengeBadge: src.challenge?.rewardBadgeId ?? NONE,
    isActive: copy ? false : src.isActive,
    start: copy && ended ? shiftYear(start, 1) : start,
    end: copy && ended ? shiftYear(end, 1) : end,
  };
}

function conceptDraftFrom(src: ConceptView | null, copy: boolean): ConceptDraft {
  const w = defaultWindow();
  if (!src) {
    return { name: '', description: '', priority: '0', backgroundEffect: NONE, themePresetId: NONE, bannerText: '', bannerEmoji: '', isActive: true, ...w };
  }
  const ended = new Date(src.endDate).getTime() < Date.now();
  const start = isoToIstanbulLocal(src.startDate);
  const end = isoToIstanbulLocal(src.endDate);
  return {
    name: copy ? `${src.name} (kopya)`.slice(0, 120) : src.name,
    description: src.description ?? '',
    priority: String(src.priority),
    backgroundEffect: src.backgroundEffect ?? NONE,
    themePresetId: src.themePresetId ?? NONE,
    bannerText: src.bannerText ?? '',
    bannerEmoji: src.bannerEmoji ?? '',
    isActive: copy ? false : src.isActive,
    start: copy && ended ? shiftYear(start, 1) : start,
    end: copy && ended ? shiftYear(end, 1) : end,
  };
}

/** "1,5" ve "1.5" kabul; boş/geçersiz → NaN (şema anlamlı mesajla reddeder, sessiz varsayılan YOK). */
function num(v: string): number {
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  return t === '' ? Number.NaN : Number(t);
}
const optNum = (v: string) => (v.trim() === '' ? null : num(v));

function campaignPayload(d: CampaignDraft) {
  return {
    name: d.name,
    description: d.description,
    type: d.type,
    multiplier: num(d.multiplier),
    bonusPoints: num(d.bonusPoints),
    imageUrl: d.imageUrl.trim() || null,
    minLevel: optNum(d.minLevel),
    budgetPoints: optNum(d.budgetPoints),
    challenge: d.challengeOn
      ? {
          type: d.challengeType,
          goal: num(d.challengeGoal),
          rewardPoints: num(d.challengeReward),
          rewardBadgeId: d.challengeBadge === NONE ? null : d.challengeBadge,
        }
      : null,
    isActive: d.isActive,
    startDate: istanbulLocalToIso(d.start) ?? '',
    endDate: istanbulLocalToIso(d.end) ?? '',
  };
}

function conceptPayload(d: ConceptDraft) {
  return {
    name: d.name,
    description: d.description.trim() || null,
    priority: num(d.priority),
    backgroundEffect: d.backgroundEffect === NONE ? null : d.backgroundEffect,
    themePresetId: d.themePresetId === NONE ? null : d.themePresetId,
    bannerText: d.bannerText.trim() || null,
    bannerEmoji: d.bannerEmoji.trim() || null,
    isActive: d.isActive,
    startDate: istanbulLocalToIso(d.start) ?? '',
    endDate: istanbulLocalToIso(d.end) ?? '',
  };
}

function zodFields(result: { success: boolean; error?: { issues: Array<{ path: (string | number)[]; message: string }> } }) {
  const out: Record<string, string> = {};
  if (result.success || !result.error) return out;
  for (const i of result.error.issues) {
    const k = i.path.join('.') || '_';
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

// ───────────────────────────── Küçük alan yardımcıları ─────────────────────────────

function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="qx-small font-medium text-fg">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
      {hint && !error && (
        <p id={`${id}-hint`} className="qx-caption mt-1 text-fg-muted">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: boolean) =>
  [error ? `${id}-err` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-subtle p-3 sm:p-4">
      <legend className="flex items-center gap-1.5 px-1 qx-small font-semibold text-fg">
        {icon}
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function WindowFields({
  idp,
  start,
  end,
  onStart,
  onEnd,
  errors,
}: {
  idp: string;
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  errors: Record<string, string>;
}) {
  const s = istanbulLocalToIso(start);
  const e = istanbulLocalToIso(end);
  const span = s && e ? new Date(e).getTime() - new Date(s).getTime() : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id={`${idp}-start`} label="Başlangıç" error={errors.startDate}>
        <Input
          id={`${idp}-start`}
          type="datetime-local"
          value={start}
          onChange={(ev) => onStart(ev.target.value)}
          aria-invalid={!!errors.startDate}
          aria-describedby={describedBy(`${idp}-start`, errors.startDate)}
        />
      </Field>
      <Field
        id={`${idp}-end`}
        label="Bitiş"
        error={errors.endDate}
        hint={span !== null && span > 0 ? `Süre: ${formatSpan(span)} · saatler İstanbul saatidir (UTC+3)` : 'Saatler İstanbul saatidir (UTC+3)'}
      >
        <Input
          id={`${idp}-end`}
          type="datetime-local"
          value={end}
          min={start || undefined}
          onChange={(ev) => onEnd(ev.target.value)}
          aria-invalid={!!errors.endDate}
          aria-describedby={describedBy(`${idp}-end`, errors.endDate, true)}
        />
      </Field>
    </div>
  );
}

// ───────────────────────────── Önizleme paneli ─────────────────────────────

function useDraftPreview(kind: CalendarKind, payload: unknown, valid: boolean, excludeId: string | null) {
  const [state, setState] = React.useState<{ data: PreviewResult | null; loading: boolean; error: string | null }>({
    data: null,
    loading: false,
    error: null,
  });
  const key = JSON.stringify(payload);
  React.useEffect(() => {
    if (!valid) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    const t = window.setTimeout(() => {
      api
        .previewDraft(kind, JSON.parse(key), excludeId, ctrl.signal)
        .then((data) => setState({ data, loading: false, error: null }))
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === 'AbortError') return;
          setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Önizleme alınamadı' });
        });
    }, 450);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [kind, key, valid, excludeId]);
  return state;
}

function ImpactPanel({ kind, preview, valid }: { kind: CalendarKind; preview: ReturnType<typeof useDraftPreview>; valid: boolean }) {
  return (
    <section aria-labelledby="cc-impact-h" aria-busy={preview.loading} className="space-y-2">
      <h3 id="cc-impact-h" className="qx-small font-semibold text-fg">
        Çakışma ve etki
      </h3>
      {!valid ? (
        <p className="qx-caption text-fg-muted">Formdaki hatalar giderilince çakışma ve etki burada hesaplanır.</p>
      ) : preview.error ? (
        <p className={cn('rounded-md border p-2 qx-caption', TONE_CALLOUT.danger)} role="alert">
          Önizleme alınamadı: {preview.error}
        </p>
      ) : !preview.data ? (
        <p className="qx-caption flex items-center gap-1.5 text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Hesaplanıyor…
        </p>
      ) : (
        <div className="space-y-2" aria-live="polite">
          {preview.data.wouldWinNow === true && (
            <p className={cn('flex items-start gap-1.5 rounded-md border p-2 qx-caption', TONE_CALLOUT.success)}>
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Kaydedince hemen yayına girer ve şu an kazanan olur.
            </p>
          )}
          {preview.data.wouldWinNow === false && (
            <p className={cn('flex items-start gap-1.5 rounded-md border p-2 qx-caption', TONE_CALLOUT.warning)}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Penceresi açık ama şu an başka bir kayıt kazanıyor; kaydedilince gölgede kalır.
            </p>
          )}
          {preview.data.conflicts.length === 0 ? (
            <p className="qx-caption flex items-center gap-1.5 text-fg-muted">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> Çakışma yok.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {preview.data.conflicts.map((c) => (
                <li
                  key={c.id}
                  className={cn('flex items-start gap-1.5 rounded-md border p-2 qx-caption', TONE_CALLOUT[c.severity === 'warning' ? 'warning' : 'info'])}
                >
                  {c.severity === 'warning' ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  {c.message.replace(/__draft__|Bu taslak/g, 'bu taslak')}
                </li>
              ))}
            </ul>
          )}
          {kind === 'campaign' && preview.data.estimate && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-subtle p-2 qx-caption">
              <dt className="text-fg-muted">Taban (son 7 gün, günlük)</dt>
              <dd className="text-right tabular-nums">
                {fmtInt(preview.data.estimate.baselineDailyPoints)} puan · {fmtInt(preview.data.estimate.baselineDailyEvents)} kazanım
              </dd>
              <dt className="text-fg-muted">Tahmini ek puan / gün</dt>
              <dd className="text-right font-medium tabular-nums">+{fmtInt(preview.data.estimate.extraPerDay)}</dd>
              <dt className="text-fg-muted">Kalan pencere boyunca</dt>
              <dd className="text-right font-medium tabular-nums">
                +{fmtInt(preview.data.estimate.extraTotal)} ({preview.data.estimate.windowDays} gün)
              </dd>
              {preview.data.estimate.budgetDays !== null && (
                <>
                  <dt className="text-fg-muted">Bütçe tahmini dolma süresi</dt>
                  <dd className="text-right tabular-nums">~{preview.data.estimate.budgetDays} gün</dd>
                </>
              )}
              <dd className="col-span-2 text-fg-muted">{preview.data.estimate.note}</dd>
            </dl>
          )}
        </div>
      )}
    </section>
  );
}

// ───────────────────────────── Canlı önizleme kartları ─────────────────────────────

function CampaignCardPreview({ d }: { d: CampaignDraft }) {
  const m = num(d.multiplier);
  const b = num(d.bonusPoints);
  const s = istanbulLocalToIso(d.start);
  const e = istanbulLocalToIso(d.end);
  const left = e ? new Date(e).getTime() - Math.max(Date.now(), s ? new Date(s).getTime() : Date.now()) : 0;
  return (
    <figure className="space-y-1.5">
      <figcaption className="qx-caption text-fg-muted">Müşterinin Fırsatlar sekmesinde göreceği kart (önizleme)</figcaption>
      <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-subtle p-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="qx-small font-semibold text-fg break-words">{d.name || 'Kampanya adı'}</p>
            <p className="qx-caption mt-0.5 text-fg-muted break-words">{d.description || 'Müşteriye görünen açıklama'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Number.isFinite(m) && m > 1 && (
                <span className="rounded-chip bg-surface-1 px-1.5 py-0.5 qx-caption font-medium text-brand">{fmtMult(m)} puan</span>
              )}
              {Number.isFinite(b) && b > 0 && (
                <span className="rounded-chip bg-surface-1 px-1.5 py-0.5 qx-caption font-medium text-brand">+{fmtInt(b)} bonus</span>
              )}
              {left > 0 && <span className="rounded-chip bg-surface-1 px-1.5 py-0.5 qx-caption text-fg-muted">{formatSpan(left)} kaldı</span>}
            </div>
            {d.challengeOn && (
              <div className="mt-2.5">
                <p className="qx-caption text-fg">
                  Görev: {CHALLENGE_TYPE_LABEL[d.challengeType as keyof typeof CHALLENGE_TYPE_LABEL] ?? '—'} · 0/{d.challengeGoal || '?'}
                  {num(d.challengeReward) > 0 ? ` · ödül ${fmtInt(num(d.challengeReward))} puan` : ''}
                  {d.challengeBadge !== NONE ? ' + rozet' : ''}
                </p>
                <div className="mt-1 h-1.5 rounded-full bg-surface-1" aria-hidden />
              </div>
            )}
          </div>
        </div>
      </div>
      {d.type !== 'SEASONAL' && d.type !== 'SPECIAL' && (
        <p className="qx-caption text-fg-muted">Bu kart yalnız hedef kitledeki müşterilere görünür.</p>
      )}
    </figure>
  );
}

function ConceptPreview({ d }: { d: ConceptDraft }) {
  const preset = d.themePresetId !== NONE ? THEME_COLOR_PRESETS[d.themePresetId as keyof typeof THEME_COLOR_PRESETS] : null;
  const bg = SEASONAL_BACKGROUND_OPTIONS.find((o) => o.value === d.backgroundEffect)?.label;
  return (
    <figure className="space-y-1.5">
      <figcaption className="qx-caption text-fg-muted">Kullanıcıların göreceği üst banner ve palet (önizleme)</figcaption>
      <div className="overflow-hidden rounded-lg border border-subtle">
        <div
          className="flex items-center justify-center gap-2 border-b px-3 py-2 qx-small font-medium"
          style={
            preset
              ? { backgroundImage: `linear-gradient(90deg, ${preset.primary}26, ${preset.accent}1a, ${preset.primary}26)`, borderColor: `${preset.primary}33` }
              : undefined
          }
        >
          <Sparkles className="h-4 w-4 shrink-0" style={preset ? { color: preset.primary } : undefined} aria-hidden />
          <span className="text-center text-fg break-words">
            {d.bannerText ? `${d.bannerEmoji ? `${d.bannerEmoji} ` : ''}${d.bannerText}` : 'Banner yok'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-surface-1 p-3">
          {preset ? (
            <div className="flex items-center gap-1" aria-label="Palet renkleri">
              {[preset.primary, preset.secondary, preset.accent].map((c) => (
                <span key={c} className="h-6 w-6 rounded-full border border-subtle" style={{ background: c }} title={c} />
              ))}
            </div>
          ) : (
            <span className="qx-caption text-fg-muted">Palet değişmez</span>
          )}
          <span className="qx-caption text-fg-muted">Arka plan: {bg && d.backgroundEffect !== NONE ? bg : 'değişmez'}</span>
        </div>
      </div>
    </figure>
  );
}

// ───────────────────────────── Formlar ─────────────────────────────

function CampaignForm({ d, set, errors }: { d: CampaignDraft; set: (p: Partial<CampaignDraft>) => void; errors: Record<string, string> }) {
  const badges = useQuery({ queryKey: api.qk.badges, queryFn: ({ signal }) => api.getBadges(signal), enabled: d.challengeOn, staleTime: 5 * 60_000 });
  const bonus = num(d.bonusPoints);
  return (
    <div className="space-y-4">
      <Section title="Temel bilgiler">
        <Field id="cf-name" label="Ad" error={errors.name}>
          <Input id="cf-name" value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!errors.name} aria-describedby={describedBy('cf-name', errors.name)} />
        </Field>
        <Field id="cf-desc" label="Müşteriye görünen açıklama" error={errors.description} hint="Fırsatlar sekmesindeki etkinlik kartında gösterilir.">
          <Textarea id="cf-desc" rows={2} value={d.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} aria-invalid={!!errors.description} aria-describedby={describedBy('cf-desc', errors.description, true)} />
        </Field>
        <Field id="cf-img" label="Görsel adresi (isteğe bağlı)" error={errors.imageUrl} hint="https:// ile başlayan herkese açık görsel.">
          <Input id="cf-img" inputMode="url" value={d.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} aria-invalid={!!errors.imageUrl} aria-describedby={describedBy('cf-img', errors.imageUrl, true)} />
        </Field>
        <WindowFields idp="cf" start={d.start} end={d.end} onStart={(v) => set({ start: v })} onEnd={(v) => set({ end: v })} errors={errors} />
      </Section>

      <Section title="Ekonomi kuralı ve tavanlar" icon={<Target className="h-4 w-4" aria-hidden />}>
        <Field id="cf-type" label="Hedef kitle" error={errors.type} hint={CAMPAIGN_TYPE_HINT[d.type]}>
          <Select value={d.type} onValueChange={(v) => set({ type: v })}>
            <SelectTrigger id="cf-type" aria-describedby={describedBy('cf-type', errors.type, true)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEASONAL_CAMPAIGN_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {CAMPAIGN_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="cf-mult" label="Puan çarpanı" error={errors.multiplier} hint={`${CAMPAIGN_CAPS.multiplierMin}–${CAMPAIGN_CAPS.multiplierMax} arası. 1 = çarpan yok.`}>
            <Input id="cf-mult" inputMode="decimal" value={d.multiplier} onChange={(e) => set({ multiplier: e.target.value })} aria-invalid={!!errors.multiplier} aria-describedby={describedBy('cf-mult', errors.multiplier, true)} />
          </Field>
          <Field id="cf-bonus" label="Kazanım başına bonus" error={errors.bonusPoints} hint={`En fazla ${CAMPAIGN_CAPS.bonusMax} puan; her kampanyalı kazanıma eklenir.`}>
            <Input id="cf-bonus" inputMode="numeric" value={d.bonusPoints} onChange={(e) => set({ bonusPoints: e.target.value })} aria-invalid={!!errors.bonusPoints} aria-describedby={describedBy('cf-bonus', errors.bonusPoints, true)} />
          </Field>
          <Field id="cf-lvl" label="Minimum seviye (isteğe bağlı)" error={errors.minLevel} hint="Boş = tüm seviyeler.">
            <Input id="cf-lvl" inputMode="numeric" value={d.minLevel} onChange={(e) => set({ minLevel: e.target.value })} aria-invalid={!!errors.minLevel} aria-describedby={describedBy('cf-lvl', errors.minLevel, true)} />
          </Field>
          <Field
            id="cf-budget"
            label="Puan bütçesi (isteğe bağlı)"
            error={errors.budgetPoints}
            hint="Kampanyalı kazanımlarda basılan toplam puan bu sınıra ulaşınca kampanya kendiliğinden durur."
          >
            <Input id="cf-budget" inputMode="numeric" value={d.budgetPoints} onChange={(e) => set({ budgetPoints: e.target.value })} aria-invalid={!!errors.budgetPoints} aria-describedby={describedBy('cf-budget', errors.budgetPoints, true)} />
          </Field>
        </div>
        <ul className={cn('space-y-1 rounded-md border p-2 qx-caption', TONE_CALLOUT.info)}>
          <li>Uygulandığı yollar: geri bildirim ödülü ve tüketim pasif puanı. İkisi de günlük tavana tabidir.</li>
          <li>Aynı anda tek kampanya uygulanır: çarpanı büyük olan kazanır, eşitse bonusu büyük olan. Zincir tavanı 4×.</li>
          {Number.isFinite(bonus) && bonus >= 100 && <li>Bonus her kazanıma eklenir; yüksek bonus günlük tavanı hızla doldurabilir.</li>}
        </ul>
      </Section>

      <Section title="Görev (isteğe bağlı)">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="cf-ch" className="qx-small text-fg">
            Pencere içinde tamamlanacak bir görev ekle
          </Label>
          <Switch id="cf-ch" checked={d.challengeOn} onCheckedChange={(v) => set({ challengeOn: v })} />
        </div>
        {d.challengeOn && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="cf-cht" label="Görev türü" error={errors['challenge.type']}>
              <Select value={d.challengeType} onValueChange={(v) => set({ challengeType: v })}>
                <SelectTrigger id="cf-cht">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHALLENGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CHALLENGE_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="cf-chg" label="Hedef adet" error={errors['challenge.goal']}>
              <Input id="cf-chg" inputMode="numeric" value={d.challengeGoal} onChange={(e) => set({ challengeGoal: e.target.value })} aria-invalid={!!errors['challenge.goal']} aria-describedby={describedBy('cf-chg', errors['challenge.goal'])} />
            </Field>
            <Field id="cf-chr" label="Ödül puanı" error={errors['challenge.rewardPoints']} hint={`En fazla ${CAMPAIGN_CAPS.challengeRewardMax}; kullanıcı başına tek kez.`}>
              <Input id="cf-chr" inputMode="numeric" value={d.challengeReward} onChange={(e) => set({ challengeReward: e.target.value })} aria-invalid={!!errors['challenge.rewardPoints']} aria-describedby={describedBy('cf-chr', errors['challenge.rewardPoints'], true)} />
            </Field>
            <Field id="cf-chb" label="Ödül rozeti (isteğe bağlı)" error={errors['challenge.rewardBadgeId']} hint={badges.isError ? 'Rozet listesi alınamadı.' : undefined}>
              <Select value={d.challengeBadge} onValueChange={(v) => set({ challengeBadge: v })} disabled={badges.isLoading}>
                <SelectTrigger id="cf-chb">
                  <SelectValue placeholder={badges.isLoading ? 'Yükleniyor…' : 'Rozet yok'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Rozet yok</SelectItem>
                  {(badges.data?.badges ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.icon} {b.name}
                    </SelectItem>
                  ))}
                  {d.challengeBadge !== NONE && !(badges.data?.badges ?? []).some((b) => b.id === d.challengeBadge) && (
                    <SelectItem value={d.challengeBadge}>Seçili rozet (pasif/bulunamadı)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}
      </Section>
    </div>
  );
}

function ConceptForm({
  d,
  set,
  errors,
  onTemplate,
}: {
  d: ConceptDraft;
  set: (p: Partial<ConceptDraft>) => void;
  errors: Record<string, string>;
  onTemplate: (key: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Section title="Hazır şablon">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Konsept şablonları">
          {SEASONAL_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTemplate(t.key)}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 qx-small hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span aria-hidden>{t.emoji}</span>
              {t.name}
            </button>
          ))}
        </div>
        <p className="qx-caption text-fg-muted">Şablon ad, banner, palet ve arka planı doldurur; tarihleri korur.</p>
      </Section>
      <Section title="Temel bilgiler">
        <Field id="kf-name" label="Ad" error={errors.name}>
          <Input id="kf-name" value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!errors.name} aria-describedby={describedBy('kf-name', errors.name)} />
        </Field>
        <Field id="kf-desc" label="İç not (isteğe bağlı)" error={errors.description} hint="Yalnız yöneticiler görür.">
          <Textarea id="kf-desc" rows={2} value={d.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} aria-describedby={describedBy('kf-desc', errors.description, true)} />
        </Field>
        <WindowFields idp="kf" start={d.start} end={d.end} onStart={(v) => set({ start: v })} onEnd={(v) => set({ end: v })} errors={errors} />
        <Field id="kf-pri" label="Öncelik" error={errors.priority} hint="Örtüşmede büyük öncelik görünür; eşitse daha geç başlayan.">
          <Input id="kf-pri" inputMode="numeric" value={d.priority} onChange={(e) => set({ priority: e.target.value })} aria-invalid={!!errors.priority} aria-describedby={describedBy('kf-pri', errors.priority, true)} />
        </Field>
      </Section>
      <Section title="Görünüm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="kf-theme" label="Palet" error={errors.themePresetId}>
            <Select value={d.themePresetId} onValueChange={(v) => set({ themePresetId: v })}>
              <SelectTrigger id="kf-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEASONAL_THEME_OPTIONS.map((o) => (
                  <SelectItem key={o.value || NONE} value={o.value || NONE}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="kf-bg" label="Arka plan efekti" error={errors.backgroundEffect}>
            <Select value={d.backgroundEffect} onValueChange={(v) => set({ backgroundEffect: v })}>
              <SelectTrigger id="kf-bg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEASONAL_BACKGROUND_OPTIONS.map((o) => (
                  <SelectItem key={o.value || NONE} value={o.value || NONE}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="kf-emoji" label="Banner emojisi" error={errors.bannerEmoji}>
            <Input id="kf-emoji" value={d.bannerEmoji} maxLength={8} onChange={(e) => set({ bannerEmoji: e.target.value })} aria-describedby={describedBy('kf-emoji', errors.bannerEmoji)} />
          </Field>
          <Field id="kf-banner" label="Banner metni" error={errors.bannerText} className="sm:col-span-2">
            <Input id="kf-banner" value={d.bannerText} maxLength={200} onChange={(e) => set({ bannerText: e.target.value })} aria-invalid={!!errors.bannerText} aria-describedby={describedBy('kf-banner', errors.bannerText)} />
          </Field>
        </div>
        {bannerPromisesPoints(d.bannerText) && (
          <p className={cn('flex items-start gap-1.5 rounded-md border p-2 qx-caption', TONE_CALLOUT.warning)}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Banner puan vaat ediyor. Konseptler puan vermez; aynı pencerede bir ekonomi kampanyası olduğundan emin olun.
          </p>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────────── Düzenleyici çekmecesi ─────────────────────────────

/**
 * Oluştur / düzenle / kopyala çekmecesi. Paylaşılan zod şeması istemcide anında alan
 * hatası verir; sunucu aynı şemayla otoriterdir (409 sürüm çakışması, rozet doğrulaması).
 * Canlı ekonomiyi değiştiren kayıt, gerçek defter verisiyle etki onayı ister.
 */
export default function CalendarEditor({
  target,
  onClose,
  onSaved,
}: {
  target: EditorTarget | null;
  onClose: () => void;
  onSaved: (kind: CalendarKind, id: string, message: string) => void;
}) {
  const open = target !== null;
  const kind = target?.kind ?? 'campaign';
  const editing = target?.mode === 'edit' ? target.source : null;
  const copySource = target?.mode === 'create' ? target.source ?? null : null;

  const initial = React.useMemo(() => {
    if (!target) return null;
    const src = target.mode === 'edit' ? target.source : target.source ?? null;
    return target.kind === 'campaign'
      ? { kind: 'campaign' as const, d: campaignDraftFrom(src as CampaignView | null, target.mode === 'create' && !!src) }
      : { kind: 'concept' as const, d: conceptDraftFrom(src as ConceptView | null, target.mode === 'create' && !!src) };
  }, [target]);

  const [cDraft, setC] = React.useState<CampaignDraft | null>(null);
  const [kDraft, setK] = React.useState<ConceptDraft | null>(null);
  const [touched, setTouched] = React.useState(false);
  const [serverFields, setServerFields] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const idemKey = React.useRef<string>('');

  React.useEffect(() => {
    if (!initial) return;
    if (initial.kind === 'campaign') {
      setC(initial.d);
      setK(null);
    } else {
      setK(initial.d);
      setC(null);
    }
    setTouched(false);
    setServerFields({});
    setServerError(null);
    idemKey.current = `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }, [initial]);

  const payload = kind === 'campaign' ? (cDraft ? campaignPayload(cDraft) : null) : kDraft ? conceptPayload(kDraft) : null;
  const parsed = payload
    ? kind === 'campaign'
      ? campaignInputSchema.safeParse(payload)
      : conceptInputSchema.safeParse(payload)
    : null;
  const clientErrors = parsed ? zodFields(parsed) : {};
  const valid = !!parsed?.success;
  const errors = touched ? { ...clientErrors, ...serverFields } : serverFields;
  const preview = useDraftPreview(kind, payload, valid && open, editing?.id ?? null);
  const dirty = !!initial && JSON.stringify(initial.d) !== JSON.stringify(kind === 'campaign' ? cDraft : kDraft);
  const qc = useQueryClient();

  const setCampaign = (p: Partial<CampaignDraft>) => {
    setC((d) => (d ? { ...d, ...p } : d));
    setServerFields({});
  };
  const setConcept = (p: Partial<ConceptDraft>) => {
    setK((d) => (d ? { ...d, ...p } : d));
    setServerFields({});
  };
  const applyTemplate = (key: string) => {
    const t = SEASONAL_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setConcept({ name: t.name, bannerEmoji: t.emoji, bannerText: t.bannerText, backgroundEffect: t.backgroundEffect, themePresetId: t.themePresetId });
  };

  /** Kayıt canlı ekonomiyi şimdi değiştiriyor mu? (etkin + penceresi şimdiyi kapsıyor, ya da önceden canlıydı) */
  const touchesLiveEconomy = (() => {
    if (kind !== 'campaign' || !payload || !valid) return false;
    const p = payload as ReturnType<typeof campaignPayload>;
    const t = Date.now();
    const coversNow = p.isActive && new Date(p.startDate).getTime() <= t && t <= new Date(p.endDate).getTime();
    const wasLive = editing?.kind === 'campaign' && (editing.status === 'live' || editing.status === 'shadowed');
    return coversNow || wasLive;
  })();

  async function doSave() {
    if (!payload) return;
    setSaving(true);
    setServerError(null);
    try {
      const r = await api.saveItem(kind, editing?.id ?? null, payload, editing?.version ?? null, idemKey.current);
      await qc.invalidateQueries({ queryKey: api.qk.all });
      const what = kind === 'campaign' ? 'Kampanya' : 'Konsept';
      const msg = editing ? `${what} güncellendi.` : `${what} oluşturuldu.`;
      onSaved(kind, r.id, r.synced === false ? `${msg} Görünüm önbelleği birazdan tazelenecek.` : msg);
    } catch (e) {
      const err = e as api.CalendarApiError;
      setServerFields(err.fields ?? {});
      setTouched(true);
      setServerError(
        err.status === 409
          ? `${err.message} Çekmeceyi kapatıp kaydı yeniden açın.`
          : err.message || 'Kaydedilemedi.'
      );
      throw e;
    } finally {
      setSaving(false);
    }
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setTouched(true);
    if (!valid) return;
    if (touchesLiveEconomy) {
      setConfirmOpen(true);
      return;
    }
    void doSave().catch(() => undefined);
  }

  const title = !target
    ? ''
    : target.mode === 'edit'
      ? `${kind === 'campaign' ? 'Kampanyayı' : 'Konsepti'} düzenle`
      : copySource
        ? `${kind === 'campaign' ? 'Kampanyayı' : 'Konsepti'} kopyala`
        : kind === 'campaign'
          ? 'Yeni ekonomi kampanyası'
          : 'Yeni görünüm konsepti';

  const requestClose = () => {
    if (dirty && !saving) setDiscardOpen(true);
    else onClose();
  };

  const est = preview.data?.estimate;

  return (
    <>
      <DetailSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        id={editing?.id ?? 'new'}
        size="xl"
        title={title}
        description={kind === 'campaign' ? 'Ekonomi katmanı: çarpan, bonus, hedef kitle, bütçe ve görev.' : 'Görünüm katmanı: palet, arka plan ve banner. Puan vermez.'}
        footer={
          <>
            {serverError && (
              <p className="mr-auto qx-small text-danger" role="alert">
                {serverError}
              </p>
            )}
            <Button type="button" variant="ghost" onClick={requestClose} disabled={saving}>
              Vazgeç
            </Button>
            <Button type="submit" form="cc-editor-form" loading={saving} disabled={saving || (!!editing && !dirty)}>
              {editing ? 'Değişiklikleri kaydet' : 'Kaydet'}
            </Button>
          </>
        }
      >
        <form id="cc-editor-form" onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 space-y-4">
            {kind === 'campaign' && cDraft && <CampaignForm d={cDraft} set={setCampaign} errors={errors} />}
            {kind === 'concept' && kDraft && <ConceptForm d={kDraft} set={setConcept} errors={errors} onTemplate={applyTemplate} />}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-subtle p-3">
              <Label htmlFor="cc-active" className="qx-small text-fg">
                Etkin (penceresi açılınca uygulanır)
              </Label>
              <Switch
                id="cc-active"
                checked={(kind === 'campaign' ? cDraft?.isActive : kDraft?.isActive) ?? false}
                disabled={!!editing?.archived}
                onCheckedChange={(v) => (kind === 'campaign' ? setCampaign({ isActive: v }) : setConcept({ isActive: v }))}
              />
            </div>
            {editing?.archived && <p className="qx-caption text-fg-muted">Arşivdeki kayıt etkinleştirilemez; önce arşivden çıkarın.</p>}
          </div>
          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start" aria-label="Önizleme">
            {kind === 'campaign' && cDraft && <CampaignCardPreview d={cDraft} />}
            {kind === 'concept' && kDraft && <ConceptPreview d={kDraft} />}
            <ImpactPanel kind={kind} preview={preview} valid={valid} />
          </aside>
        </form>
      </DetailSheet>

      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="warning"
        title="Canlı ekonomi değişsin mi?"
        description="Bu kayıt şu an puan kazanımlarını etkiliyor ya da kaydedilince hemen etkilemeye başlayacak. Değişiklik anında uygulanır."
        impact={{
          items: [
            { label: 'Tahmini ek puan / gün', value: est ? `+${fmtInt(est.extraPerDay)}` : 'Hesaplanamadı', emphasis: true },
            { label: 'Kalan pencere boyunca', value: est ? `+${fmtInt(est.extraTotal)}` : '—' },
            { label: 'Çakışma', value: preview.data ? String(preview.data.conflicts.length) : '—' },
          ],
          warning: preview.data?.conflicts.some((c) => c.severity === 'warning') ? 'Örtüşen kayıtlar var; kaybeden kampanyanın etkisi o aralıkta uygulanmaz.' : undefined,
        }}
        confirmLabel="Onayla ve kaydet"
        irreversibleNote={false}
        onConfirm={() => doSave()}
      />

      <ConfirmAction
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        tone="warning"
        title="Kaydedilmemiş değişiklikler silinsin mi?"
        description="Çekmeceyi kapatırsanız bu formdaki değişiklikler kaybolur."
        confirmLabel="Değişiklikleri at"
        cancelLabel="Düzenlemeye dön"
        irreversibleNote={false}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
      />
    </>
  );
}

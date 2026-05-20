'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Wand2, RefreshCw, Save, Sparkles } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { toast } from '@/lib/admin-toast';
import { cn } from '@/lib/utils';
import { PREMIUM_PANEL_CARD_BASE, premiumPanelCardAccentClass } from '@/lib/panel-surface';
import {
  getDefaultExperiencePulsePayload,
  type ExperiencePulsePayload,
  type PulseFace,
  type PulseMood,
} from '@/lib/experience-pulse-settings';

const MOODS: PulseMood[] = ['aurora', 'sunset', 'noir', 'mint'];

type FaceKey = 'customer' | 'dealer';

function PerkFields({
  face,
  faceKey,
  onChange,
  t,
}: {
  face: PulseFace;
  faceKey: FaceKey;
  onChange: (next: PulseFace) => void;
  t: ReturnType<typeof useAppT>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('adminExperiencePulse.perksHeading')}</p>
      {face.perks.map((perk, idx) => (
        <div key={idx} className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-perk-${idx}-tr`}>{t('adminExperiencePulse.fieldPerkTr').replace('{n}', String(idx + 1))}</Label>
            <Input
              id={`${faceKey}-perk-${idx}-tr`}
              value={perk.tr}
              onChange={(e) => {
                const perks = [...face.perks];
                perks[idx] = { ...perks[idx], tr: e.target.value };
                onChange({ ...face, perks });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-perk-${idx}-en`}>{t('adminExperiencePulse.fieldPerkEn').replace('{n}', String(idx + 1))}</Label>
            <Input
              id={`${faceKey}-perk-${idx}-en`}
              value={perk.en}
              onChange={(e) => {
                const perks = [...face.perks];
                perks[idx] = { ...perks[idx], en: e.target.value };
                onChange({ ...face, perks });
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function FaceEditor({
  faceKey,
  face,
  onChange,
  accent,
  t,
}: {
  faceKey: FaceKey;
  face: PulseFace;
  onChange: (next: PulseFace) => void;
  accent: 'cyan' | 'emerald' | 'violet' | 'amber';
  t: ReturnType<typeof useAppT>;
}) {
  return (
    <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'border-border/80')}>
      <div className={premiumPanelCardAccentClass(accent)} aria-hidden />
      <CardHeader className="pl-6">
        <CardTitle className="text-lg">
          {faceKey === 'customer' ? t('adminExperiencePulse.sectionCustomer') : t('adminExperiencePulse.sectionDealer')}
        </CardTitle>
        <CardDescription />
      </CardHeader>
      <CardContent className="space-y-4 pl-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-title-tr`}>{t('adminExperiencePulse.fieldTitleTr')}</Label>
            <Input
              id={`${faceKey}-title-tr`}
              value={face.title.tr}
              onChange={(e) => onChange({ ...face, title: { ...face.title, tr: e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-title-en`}>{t('adminExperiencePulse.fieldTitleEn')}</Label>
            <Input
              id={`${faceKey}-title-en`}
              value={face.title.en}
              onChange={(e) => onChange({ ...face, title: { ...face.title, en: e.target.value } })}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-sub-tr`}>{t('adminExperiencePulse.fieldSubtitleTr')}</Label>
            <Input
              id={`${faceKey}-sub-tr`}
              value={face.subtitle.tr}
              onChange={(e) => onChange({ ...face, subtitle: { ...face.subtitle, tr: e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-sub-en`}>{t('adminExperiencePulse.fieldSubtitleEn')}</Label>
            <Input
              id={`${faceKey}-sub-en`}
              value={face.subtitle.en}
              onChange={(e) => onChange({ ...face, subtitle: { ...face.subtitle, en: e.target.value } })}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-badge-tr`}>{t('adminExperiencePulse.fieldBadgeTr')}</Label>
            <Input
              id={`${faceKey}-badge-tr`}
              value={face.badgeLabel.tr}
              onChange={(e) => onChange({ ...face, badgeLabel: { ...face.badgeLabel, tr: e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-badge-en`}>{t('adminExperiencePulse.fieldBadgeEn')}</Label>
            <Input
              id={`${faceKey}-badge-en`}
              value={face.badgeLabel.en}
              onChange={(e) => onChange({ ...face, badgeLabel: { ...face.badgeLabel, en: e.target.value } })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('adminExperiencePulse.fieldMood')}</Label>
          <Select value={face.mood} onValueChange={(v) => onChange({ ...face, mood: v as PulseMood })}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder={face.mood} />
            </SelectTrigger>
            <SelectContent>
              {MOODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`adminExperiencePulse.mood.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PerkFields face={face} faceKey={faceKey} onChange={onChange} t={t} />
        <Separator />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-cta-tr`}>{t('adminExperiencePulse.fieldCtaTr')}</Label>
            <Input
              id={`${faceKey}-cta-tr`}
              value={face.ctaLabel.tr}
              onChange={(e) => onChange({ ...face, ctaLabel: { ...face.ctaLabel, tr: e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${faceKey}-cta-en`}>{t('adminExperiencePulse.fieldCtaEn')}</Label>
            <Input
              id={`${faceKey}-cta-en`}
              value={face.ctaLabel.en}
              onChange={(e) => onChange({ ...face, ctaLabel: { ...face.ctaLabel, en: e.target.value } })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${faceKey}-cta-path`}>{t('adminExperiencePulse.fieldCtaPath')}</Label>
          <Input
            id={`${faceKey}-cta-path`}
            value={face.ctaPath}
            onChange={(e) => onChange({ ...face, ctaPath: e.target.value })}
            placeholder="/customer/rewards"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminExperiencePulsePage() {
  const t = useAppT();
  const [payload, setPayload] = useState<ExperiencePulsePayload>(() => getDefaultExperiencePulsePayload());
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/settings/experience-pulse', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'load');
      setPayload(data.payload);
      setUpdatedAt(data.updatedAt ?? null);
    } catch {
      toast.error(t('adminExperiencePulse.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/admin/settings/experience-pulse', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'save');
      setPayload(data.payload);
      setUpdatedAt(data.updatedAt ?? null);
      toast.success(t('adminExperiencePulse.saveSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('adminExperiencePulse.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 pb-14">
      <AdminPremiumHero
        eyebrow={t('adminExperiencePulse.eyebrow')}
        title={t('adminExperiencePulse.title')}
        description={t('adminExperiencePulse.subtitle')}
        icon={<Wand2 className="size-7" aria-hidden />}
        tone="auto"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('mr-1.5 size-4', loading && 'animate-spin')} aria-hidden />
              {t('adminExperiencePulse.reload')}
            </Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving || loading}>
              <Save className="mr-1.5 size-4" aria-hidden />
              {saving ? t('adminExperiencePulse.saving') : t('adminExperiencePulse.save')}
            </Button>
          </div>
        }
      />

      {updatedAt && (
        <p className="text-xs text-muted-foreground">
          {t('adminExperiencePulse.updatedHint')}: {new Date(updatedAt).toLocaleString()}
        </p>
      )}

      <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'border-dashed border-primary/25 bg-primary/[0.03]')}>
        <CardHeader className="flex flex-row items-start gap-3 pb-2">
          <Sparkles className="mt-0.5 size-5 text-primary" aria-hidden />
          <div>
            <CardTitle className="text-base">API</CardTitle>
            <CardDescription className="text-pretty">{t('adminExperiencePulse.apiHint')}</CardDescription>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('adminExperiencePulse.reload')}…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <FaceEditor
            faceKey="customer"
            face={payload.customer}
            onChange={(customer) => setPayload((p) => ({ ...p, customer }))}
            accent="violet"
            t={t}
          />
          <FaceEditor
            faceKey="dealer"
            face={payload.dealer}
            onChange={(dealer) => setPayload((p) => ({ ...p, dealer }))}
            accent="emerald"
            t={t}
          />
        </div>
      )}
    </div>
  );
}

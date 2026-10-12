'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Contrast, Eye, Globe, Monitor, Moon, Sun, Type, ZapOff } from 'lucide-react';
import { ChoiceChips } from '@/components/ds/a11y';
import { useAppLocale } from '@/lib/app-locale';
import { SoundToggle } from '@/components/settings/sound-toggle';
import { applyAccessibilityPrefs, readAccessibilityPrefs } from '@/lib/accessibility-prefs';
import { prefersReducedMotionOS } from '@/lib/motion';
import type { A11yPreferences, CustomerSettingsSnapshot, TextScale } from '@/lib/customer-settings/contract';
import { TEXT_SCALES } from '@/lib/customer-settings/contract';
import { patchPreferences, SettingsApiError, type PreferencesPatch } from './api';
import { errorText, useSettingsCopy } from './copy';
import { Panel, SaveIndicator, SettingSwitchRow, useSaveState } from './ui';
import { useSettingsCache } from './use-settings';

type BoolKey = 'reduceAnimations' | 'highContrast' | 'colorblindMode';

/**
 * Görünüm ve erişilebilirlik.
 *  - Dil: hesapta (`preferredLanguage`: e-posta + oturum dili) ve bu cihazda anında.
 *  - Tema: GERÇEK tema kaynağı next-themes (cihaz başına). Eski seçici hiçbir şeyi
 *    değiştirmiyor ve "Sistem" seçilince bütün tercih kaydını 400 ile düşürüyordu (B1).
 *  - Erişilebilirlik: anında `<html>` sınıfı + hesaba kayıt; hareket azaltma motion politikasını
 *    (framer, konfeti, canvas, video) da besler; yazı boyutu kök font-size'ı büyütür.
 */
export function AppearanceSection({ data }: { data: CustomerSettingsSnapshot }) {
  return (
    <div className="flex flex-col gap-4">
      <LanguagePanel current={data.preferences.language} />
      <ThemePanel />
      <A11yPanel server={data.preferences.a11y} stored={data.preferences.a11yStored} />
    </div>
  );
}

function LanguagePanel({ current }: { current: 'tr' | 'en' }) {
  const { copy } = useSettingsCopy();
  const { setLocale } = useAppLocale();
  const { update } = useSession();
  const router = useRouter();
  const cache = useSettingsCache();
  const save = useSaveState();

  const onChange = (next: 'tr' | 'en' | null) => {
    if (!next || next === current) return;
    void save.run(async () => {
      try {
        await patchPreferences({ language: next });
      } catch (e) {
        throw new Error(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, copy.saveError));
      }
      cache.patch((prev) => ({ ...prev, preferences: { ...prev.preferences, language: next } }));
      setLocale(next);
      await update({ preferredLanguage: next }).catch(() => undefined);
      router.refresh();
    });
  };

  return (
    <Panel title={copy.languageTitle} description={copy.languageDesc} icon={<Globe />}>
      <ChoiceChips
        aria-label={copy.languageTitle}
        options={[
          { value: 'tr', label: 'Türkçe' },
          { value: 'en', label: 'English' },
        ]}
        value={current}
        onChange={(v) => onChange(v as 'tr' | 'en' | null)}
        disabled={save.state === 'saving'}
      />
      <SaveIndicator state={save.state} error={save.message} />
    </Panel>
  );
}

function ThemePanel() {
  const { copy } = useSettingsCopy();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const value = mounted ? ((theme as 'light' | 'dark' | 'system' | undefined) ?? 'system') : null;

  return (
    <Panel title={copy.themeTitle} description={copy.themeDesc} icon={<Monitor />}>
      <ChoiceChips
        aria-label={copy.themeTitle}
        options={[
          { value: 'light', label: copy.themeOptions.light, icon: <Sun aria-hidden className="h-4 w-4" /> },
          { value: 'dark', label: copy.themeOptions.dark, icon: <Moon aria-hidden className="h-4 w-4" /> },
          { value: 'system', label: copy.themeOptions.system, icon: <Monitor aria-hidden className="h-4 w-4" /> },
        ]}
        value={value}
        onChange={(v) => v && setTheme(v)}
      />
    </Panel>
  );
}

function A11yPanel({ server, stored }: { server: A11yPreferences; stored: boolean }) {
  const { copy } = useSettingsCopy();
  const cache = useSettingsCache();
  // Hesapta kayıt varsa o geçerli (cihazlar arası); yoksa bu cihazdaki değer gösterilir.
  const [prefs, setPrefs] = useState<A11yPreferences>(server);
  const [osReduced, setOsReduced] = useState(false);
  const rows = {
    reduceAnimations: useSaveState(),
    highContrast: useSaveState(),
    colorblindMode: useSaveState(),
    textScale: useSaveState(),
  };

  useEffect(() => {
    setOsReduced(prefersReducedMotionOS());
    if (stored) {
      applyAccessibilityPrefs(server);
      setPrefs(server);
    } else {
      const local = readAccessibilityPrefs();
      setPrefs({ ...local, textScale: local.textScale ?? 'default' });
    }
    // Yalnız ilk açılışta: sonraki değişiklikler bu panelden gelir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (key: keyof A11yPreferences, next: A11yPreferences, prev: A11yPreferences) => {
    setPrefs(next);
    applyAccessibilityPrefs(next);
    void rows[key].run(async () => {
      try {
        await patchPreferences({ [key]: next[key] } as PreferencesPatch);
        cache.patch((p) => ({ ...p, preferences: { ...p.preferences, a11y: next, a11yStored: true } }));
      } catch (e) {
        setPrefs(prev);
        applyAccessibilityPrefs(prev);
        throw new Error(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, copy.saveError));
      }
    });
  };

  const toggle = (key: BoolKey) => (value: boolean) => commit(key, { ...prefs, [key]: value }, prefs);

  const items: Array<{ key: BoolKey; label: string; desc: string; icon: React.ReactNode }> = [
    { key: 'reduceAnimations', label: copy.reduceMotion, desc: copy.reduceMotionDesc, icon: <ZapOff /> },
    { key: 'highContrast', label: copy.highContrast, desc: copy.highContrastDesc, icon: <Contrast /> },
    { key: 'colorblindMode', label: copy.colorblind, desc: copy.colorblindDesc, icon: <Eye /> },
  ];

  return (
    <Panel title={copy.a11yTitle} description={copy.a11yDesc} icon={<Type />}>
      <div className="divide-y divide-[hsl(var(--border-subtle))]">
        {items.map((it) => (
          <SettingSwitchRow
            key={it.key}
            label={it.label}
            description={it.key === 'reduceAnimations' && osReduced ? `${it.desc} ${copy.osMotionNote}` : it.desc}
            checked={prefs[it.key]}
            onCheckedChange={toggle(it.key)}
            state={rows[it.key].state}
            error={rows[it.key].message}
            icon={it.icon}
          />
        ))}
        <SoundToggle compact />
        <div className="py-3">
          <p id="a11y-text-size" className="text-base font-medium text-fg">
            {copy.textSize}
          </p>
          <p className="qx-small mb-2 text-fg-muted">{copy.textSizeDesc}</p>
          <ChoiceChips
            aria-labelledby="a11y-text-size"
            options={TEXT_SCALES.map((s: TextScale) => ({ value: s, label: copy.textScales[s] }))}
            value={prefs.textScale}
            onChange={(v) => v && v !== prefs.textScale && commit('textScale', { ...prefs, textScale: v as TextScale }, prefs)}
          />
          <SaveIndicator state={rows.textScale.state} error={rows.textScale.message} />
          <p className="mt-2 rounded-control bg-surface-muted px-3 py-2 text-base text-fg">{copy.textPreview}</p>
        </div>
      </div>
    </Panel>
  );
}

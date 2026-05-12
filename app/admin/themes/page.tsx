'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  Palette,
  Check,
  Sun,
  Moon,
  Sparkles,
  Save,
  Loader2,
} from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { useAppT } from '@/lib/app-locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/admin-toast';
import { applyRuntimeThemeToRoot } from '@/lib/apply-runtime-theme';
import {
  THEME_SETTINGS_ADMIN_API_BASE,
  THEME_SETTINGS_CATEGORY,
  THEME_SETTINGS_KEYS,
  themeAdminSettingsListUrl,
} from '@/lib/theme-settings-keys';
import { DEFAULT_CUSTOM_THEME_HEX, getAdminThemePresetsBase } from '@/lib/theme-presets';

interface ThemePreset {
  id: string;
  name: string;
  description: string;
  mode: 'light' | 'dark';
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
  };
  isActive: boolean;
}

function getThemeFamilyKey(themeId: string): string {
  return themeId.replace(/Light$/i, '');
}

function getResolvedMode(mode: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

function getRuntimeMode(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function getEffectiveMode(resolvedTheme?: string): 'light' | 'dark' {
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }
  if (resolvedTheme === 'dark') return 'dark';
  if (resolvedTheme === 'light') return 'light';
  return getRuntimeMode();
}

function resolveThemeIdForMode(themeFamilyOrId: string, mode: 'light' | 'dark', themes: ThemePreset[]): string {
  const family = getThemeFamilyKey(themeFamilyOrId);
  const preferred = mode === 'light' ? `${family}Light` : family;
  if (themes.some((t) => t.id === preferred)) return preferred;
  if (themes.some((t) => t.id === themeFamilyOrId)) return themeFamilyOrId;
  return 'purple';
}

export default function AdminThemesPage() {
  const t = useAppT();
  const { resolvedTheme } = useTheme();
  const [themes, setThemes] = useState<ThemePreset[]>(() =>
    getAdminThemePresetsBase().map((t, i) => ({ ...t, isActive: i === 0 }))
  );
  const [customColors, setCustomColors] = useState<{
    primary: string;
    secondary: string;
    accent: string;
  }>({
    primary: DEFAULT_CUSTOM_THEME_HEX.primary,
    secondary: DEFAULT_CUSTOM_THEME_HEX.secondary,
    accent: DEFAULT_CUSTOM_THEME_HEX.accent,
  });
  const [activeThemeId, setActiveThemeId] = useState<string>('purple');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const currentMode: 'light' | 'dark' = getEffectiveMode(resolvedTheme);

  const themeFamilies = useMemo(() => {
    const grouped = new Map<
      string,
      { familyKey: string; dark?: ThemePreset; light?: ThemePreset; displayName: string; description: string }
    >();

    for (const theme of themes) {
      const familyKey = theme.id.replace(/Light$/i, '');
      const existing = grouped.get(familyKey) || {
        familyKey,
        displayName: theme.name.replace(/\s+Gün$/i, ''),
        description: theme.description,
      };
      if (theme.mode === 'dark') existing.dark = theme;
      if (theme.mode === 'light') existing.light = theme;
      if (!existing.description && theme.description) existing.description = theme.description;
      grouped.set(familyKey, existing);
    }

    return Array.from(grouped.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'tr')
    );
  }, [themes]);

  useEffect(() => {
    if (activeThemeId === 'custom') {
      applyRuntimeThemeToRoot({
        primary: customColors.primary,
        secondary: customColors.secondary,
        accent: customColors.accent,
      });
      return;
    }
    const effectiveId = resolveThemeIdForMode(activeThemeId, getEffectiveMode(resolvedTheme), themes);
    const selected = themes.find((t) => t.id === effectiveId);
    if (selected) {
      applyThemeColors(selected.colors);
      window.dispatchEvent(
        new CustomEvent('qratex:theme-palette-preview', {
          detail: {
            activeThemeId: getThemeFamilyKey(activeThemeId),
            mode: getEffectiveMode(resolvedTheme),
            colors: {
              primary: selected.colors.primary,
              secondary: selected.colors.secondary,
              accent: selected.colors.accent,
              background: selected.colors.background,
              foreground: selected.colors.foreground,
            },
          },
        })
      );
    }
  }, [activeThemeId, customColors, resolvedTheme, themes]);

  // Fetch theme settings on mount
  useEffect(() => {
    fetchThemeSettings();
  }, []);

  const fetchThemeSettings = async () => {
    try {
      const res = await fetch(themeAdminSettingsListUrl());
      const data = await res.json();
      
      if (data.raw) {
        let nextActiveTheme = activeThemeId;
        let nextCustomColors = customColors;

        data.raw.forEach((setting: { key: string; value: unknown }) => {
          if (setting.key === THEME_SETTINGS_KEYS.activeTheme && typeof setting.value === 'string') {
            nextActiveTheme = setting.value;
          }
          if (setting.key === THEME_SETTINGS_KEYS.customColors && typeof setting.value === 'object') {
            const raw = setting.value as Record<string, unknown>;
            nextCustomColors = {
              primary: typeof raw.primary === 'string' ? raw.primary : DEFAULT_CUSTOM_THEME_HEX.primary,
              secondary: typeof raw.secondary === 'string' ? raw.secondary : DEFAULT_CUSTOM_THEME_HEX.secondary,
              accent: typeof raw.accent === 'string' ? raw.accent : DEFAULT_CUSTOM_THEME_HEX.accent,
            };
          }
        });

        setActiveThemeId(nextActiveTheme);
        setCustomColors(nextCustomColors);
        const effective = resolveThemeIdForMode(nextActiveTheme, getEffectiveMode(resolvedTheme), themes);
        setThemes((prev) => prev.map((t) => ({ ...t, isActive: t.id === effective })));
      }
    } catch (error) {
      console.error('Failed to fetch theme settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyThemeColors = (colors: ThemePreset['colors']) => {
    applyRuntimeThemeToRoot({
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
      background: colors.background,
      foreground: colors.foreground,
      mode: currentMode,
    });
  };

  const activateTheme = async (id: string) => {
    const resolvedMode = getEffectiveMode(resolvedTheme);
    const family = getThemeFamilyKey(id);
    const effectiveId = resolveThemeIdForMode(family, resolvedMode, themes);
    const selected = themes.find((t) => t.id === effectiveId);
    if (selected) {
      applyThemeColors(selected.colors);
    }
    setActiveThemeId(family);
    setThemes((prev) => prev.map((t) => ({ ...t, isActive: t.id === effectiveId })));
    setSaving(true);
    try {
      const themeRes = await fetch(THEME_SETTINGS_ADMIN_API_BASE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: THEME_SETTINGS_KEYS.activeTheme,
          value: family,
          category: THEME_SETTINGS_CATEGORY,
        }),
      });
      
      if (themeRes.ok) {
        window.dispatchEvent(new CustomEvent('qratex:theme-palette-changed'));
        toast.success('Tema aktifleştirildi ve kaydedildi');
      } else {
        toast.error('Tema kaydedilemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const saveCustomTheme = async () => {
    setSaving(true);
    try {
      const [saveColorsRes, activateCustomRes] = await Promise.all([
        fetch(THEME_SETTINGS_ADMIN_API_BASE, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: THEME_SETTINGS_KEYS.customColors,
            value: customColors,
            category: THEME_SETTINGS_CATEGORY,
          }),
        }),
        fetch(THEME_SETTINGS_ADMIN_API_BASE, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: THEME_SETTINGS_KEYS.activeTheme,
            value: 'custom',
            category: THEME_SETTINGS_CATEGORY,
          }),
        }),
      ]);

      if (saveColorsRes.ok && activateCustomRes.ok) {
        setActiveThemeId('custom');
        setThemes((prev) => prev.map((t) => ({ ...t, isActive: false })));
        applyRuntimeThemeToRoot({ ...customColors, mode: currentMode });
        window.dispatchEvent(
          new CustomEvent('qratex:theme-palette-preview', {
            detail: {
              activeThemeId: 'custom',
              mode: currentMode,
              colors: {
                primary: customColors.primary,
                secondary: customColors.secondary,
                accent: customColors.accent,
              },
            },
          })
        );
        window.dispatchEvent(new CustomEvent('qratex:theme-palette-changed'));
        toast.success('Özel tema kaydedildi ve uygulandı');
      } else {
        toast.error('Tema kaydedilemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const activeTheme = themes.find((t) => t.isActive);

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminPremiumHero
          title="Tema Yönetimi"
          description="Platform görünümünü özelleştirin"
          icon={<Sparkles className="text-white" />}
        />
        <InlineLoadingStatus className="h-64" spinnerClassName="text-primary" label={t('adminInlineLoading.themes')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Tema Yönetimi"
        description="Platform görünümünü özelleştirin"
        icon={<Sparkles className="text-white" />}
      />

      {/* Current Theme Preview */}
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Aktif Tema: {activeTheme?.name}
            {!activeTheme && activeThemeId === 'custom' ? 'Özel Tema' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {activeThemeId === 'custom'
              ? Object.entries(customColors).map(([key, value]) => (
                <div key={key} className="text-center">
                  <div
                    className="w-16 h-16 rounded-lg border shadow-lg mb-2"
                    style={{ backgroundColor: value }}
                  />
                  <p className="text-xs text-muted-foreground capitalize">{key}</p>
                </div>
              ))
              : activeTheme && Object.entries(activeTheme.colors).map(([key, value]) => (
              <div key={key} className="text-center">
                <div
                  className="w-16 h-16 rounded-lg border shadow-lg mb-2"
                  style={{ backgroundColor: value }}
                />
                <p className="text-xs text-muted-foreground capitalize">{key}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Theme Presets */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Hazır Temalar (Açık + Koyu)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {themeFamilies.map((family, index) => (
            <motion.div
              key={family.familyKey}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                glass
                hover
                className={`cursor-pointer relative overflow-hidden ${
                  family.dark?.isActive || family.light?.isActive ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => activateTheme(family.familyKey)}
              >
                {(family.dark?.isActive || family.light?.isActive) && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-primary">
                      <Check className="h-3 w-3 mr-1" />
                      Palette aktif
                    </Badge>
                  </div>
                )}
                <CardContent className="p-6">
                  <div className="mb-2">
                    <h3 className="font-semibold">{family.displayName}</h3>
                    <p className="text-sm text-muted-foreground">{family.description}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {family.dark ? (
                      <div
                        className={`rounded-lg border p-3 text-left transition ${
                          family.dark.isActive ? 'border-primary ring-2 ring-primary/40' : 'border-border/60'
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm">
                          <Moon className="h-4 w-4" />
                          <span>Koyu</span>
                        </div>
                        <div className="flex gap-1.5">
                          {[family.dark.colors.primary, family.dark.colors.secondary, family.dark.colors.accent].map((color) => (
                            <span key={color} className="h-6 w-6 rounded-full border" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {family.light ? (
                      <div
                        className={`rounded-lg border p-3 text-left transition ${
                          family.light.isActive ? 'border-primary ring-2 ring-primary/40' : 'border-border/60'
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm">
                          <Sun className="h-4 w-4" />
                          <span>Açık</span>
                        </div>
                        <div className="flex gap-1.5">
                          {[family.light.colors.primary, family.light.colors.secondary, family.light.colors.accent].map((color) => (
                            <span key={color} className="h-6 w-6 rounded-full border" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Bu karttan sadece palette seçilir. Açık/Koyu geçişini alttaki "Varsayılan Mod" otomatik yönetir.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Custom Theme */}
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Özel Tema Oluştur
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Ana Renk (Primary)</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={customColors.primary}
                  onChange={(e) => setCustomColors({ ...customColors, primary: e.target.value })}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={customColors.primary}
                  onChange={(e) => setCustomColors({ ...customColors, primary: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>İkincil Renk (Secondary)</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={customColors.secondary}
                  onChange={(e) => setCustomColors({ ...customColors, secondary: e.target.value })}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={customColors.secondary}
                  onChange={(e) => setCustomColors({ ...customColors, secondary: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Vurgu Rengi (Accent)</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={customColors.accent}
                  onChange={(e) => setCustomColors({ ...customColors, accent: e.target.value })}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={customColors.accent}
                  onChange={(e) => setCustomColors({ ...customColors, accent: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="p-6 rounded-lg border bg-gradient-to-br from-background to-muted">
            <p className="text-sm text-muted-foreground mb-4">Önizleme</p>
            <div className="flex gap-4">
              <Button style={{ backgroundColor: customColors.primary }}>
                Ana Buton
              </Button>
              <Button variant="outline" style={{ borderColor: customColors.secondary, color: customColors.secondary }}>
                İkincil Buton
              </Button>
              <Badge style={{ backgroundColor: customColors.accent }}>
                Vurgu Badge
              </Badge>
            </div>
          </div>

          <Button onClick={saveCustomTheme} disabled={saving} className="w-full md:w-auto gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Kaydediliyor...' : 'Özel Temayı Kaydet'}
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}





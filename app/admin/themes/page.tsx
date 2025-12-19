'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Palette,
  Check,
  Sun,
  Moon,
  Monitor,
  Sparkles,
  Save,
  Loader2,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface ThemePreset {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
  };
  isActive: boolean;
}

const themePresets: ThemePreset[] = [
  {
    id: 'purple',
    name: 'Mor Gece',
    description: 'Varsayılan koyu tema',
    colors: {
      primary: '#8B5CF6',
      secondary: '#A855F7',
      accent: '#F472B6',
      background: '#0A0A0B',
      foreground: '#FAFAFA',
    },
    isActive: true,
  },
  {
    id: 'blue',
    name: 'Okyanus',
    description: 'Mavi tonları',
    colors: {
      primary: '#3B82F6',
      secondary: '#06B6D4',
      accent: '#22D3EE',
      background: '#0F172A',
      foreground: '#F8FAFC',
    },
    isActive: false,
  },
  {
    id: 'green',
    name: 'Orman',
    description: 'Yeşil tonları',
    colors: {
      primary: '#22C55E',
      secondary: '#10B981',
      accent: '#34D399',
      background: '#0D1117',
      foreground: '#F0FDF4',
    },
    isActive: false,
  },
  {
    id: 'orange',
    name: 'Gün Batımı',
    description: 'Sıcak tonlar',
    colors: {
      primary: '#F97316',
      secondary: '#FB923C',
      accent: '#FBBF24',
      background: '#1C1917',
      foreground: '#FEF3C7',
    },
    isActive: false,
  },
  {
    id: 'pink',
    name: 'Çiçek',
    description: 'Pembe tonları',
    colors: {
      primary: '#EC4899',
      secondary: '#F472B6',
      accent: '#F9A8D4',
      background: '#1A1A2E',
      foreground: '#FDF2F8',
    },
    isActive: false,
  },
  {
    id: 'light',
    name: 'Aydınlık',
    description: 'Açık tema',
    colors: {
      primary: '#7C3AED',
      secondary: '#8B5CF6',
      accent: '#A78BFA',
      background: '#FFFFFF',
      foreground: '#1F2937',
    },
    isActive: false,
  },
];

export default function AdminThemesPage() {
  const [themes, setThemes] = useState(themePresets);
  const [customColors, setCustomColors] = useState({
    primary: '#8B5CF6',
    secondary: '#A855F7',
    accent: '#F472B6',
  });
  const [defaultMode, setDefaultMode] = useState<'light' | 'dark' | 'system'>('dark');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch theme settings on mount
  useEffect(() => {
    fetchThemeSettings();
  }, []);

  const fetchThemeSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings?category=theme');
      const data = await res.json();
      
      if (data.raw) {
        data.raw.forEach((setting: { key: string; value: unknown }) => {
          if (setting.key === 'activeTheme' && typeof setting.value === 'string') {
            setThemes(themes.map(t => ({ ...t, isActive: t.id === setting.value })));
          }
          if (setting.key === 'customColors' && typeof setting.value === 'object') {
            setCustomColors(setting.value as typeof customColors);
          }
          if (setting.key === 'defaultMode' && typeof setting.value === 'string') {
            setDefaultMode(setting.value as 'light' | 'dark' | 'system');
          }
        });
      }
    } catch (error) {
      console.error('Failed to fetch theme settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // HEX to HSL conversion
  const hexToHSL = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '0 0% 0%';
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  const applyThemeColors = (colors: ThemePreset['colors']) => {
    const root = document.documentElement;
    root.style.setProperty('--primary', hexToHSL(colors.primary));
    root.style.setProperty('--ring', hexToHSL(colors.primary));
    root.style.setProperty('--gradient-from', hexToHSL(colors.primary));
    root.style.setProperty('--gradient-to', hexToHSL(colors.secondary));
    root.style.setProperty('--accent', hexToHSL(colors.accent));
  };

  const activateTheme = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'activeTheme', value: id, category: 'theme' }),
      });
      
      if (res.ok) {
        const selectedTheme = themes.find(t => t.id === id);
        if (selectedTheme) {
          applyThemeColors(selectedTheme.colors);
        }
        setThemes(themes.map(t => ({ ...t, isActive: t.id === id })));
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
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'customColors', value: customColors, category: 'theme' }),
      });
      
      if (res.ok) {
        // Apply custom colors immediately
        const root = document.documentElement;
        root.style.setProperty('--primary', hexToHSL(customColors.primary));
        root.style.setProperty('--ring', hexToHSL(customColors.primary));
        root.style.setProperty('--gradient-from', hexToHSL(customColors.primary));
        root.style.setProperty('--gradient-to', hexToHSL(customColors.secondary));
        root.style.setProperty('--accent', hexToHSL(customColors.accent));
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

  const saveDefaultMode = async (mode: 'light' | 'dark' | 'system') => {
    setDefaultMode(mode);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'defaultMode', value: mode, category: 'theme' }),
      });
      
      if (res.ok) {
        toast.success('Varsayılan mod kaydedildi');
      } else {
        toast.error('Mod kaydedilemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const activeTheme = themes.find(t => t.isActive);

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardHeader
          title="Tema Yönetimi"
          description="Platform görünümünü özelleştirin"
        />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Tema Yönetimi"
        description="Platform görünümünü özelleştirin"
      />

      {/* Current Theme Preview */}
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Aktif Tema: {activeTheme?.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {activeTheme && Object.entries(activeTheme.colors).map(([key, value]) => (
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
        <h2 className="text-lg font-semibold mb-4">Hazır Temalar</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map((theme, index) => (
            <motion.div
              key={theme.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                glass
                hover
                className={`cursor-pointer relative overflow-hidden ${
                  theme.isActive ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => activateTheme(theme.id)}
              >
                {theme.isActive && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-primary">
                      <Check className="h-3 w-3 mr-1" />
                      Aktif
                    </Badge>
                  </div>
                )}
                <CardContent className="p-6">
                  {/* Color Preview */}
                  <div className="flex gap-2 mb-4">
                    {Object.values(theme.colors).slice(0, 3).map((color, i) => (
                      <div
                        key={i}
                        className="w-8 h-8 rounded-full shadow-md"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>

                  {/* Theme Info */}
                  <h3 className="font-semibold">{theme.name}</h3>
                  <p className="text-sm text-muted-foreground">{theme.description}</p>

                  {/* Theme Type Icon */}
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    {theme.id === 'light' ? (
                      <>
                        <Sun className="h-4 w-4" />
                        <span>Açık Mod</span>
                      </>
                    ) : (
                      <>
                        <Moon className="h-4 w-4" />
                        <span>Koyu Mod</span>
                      </>
                    )}
                  </div>
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

      {/* Mode Selection */}
      <Card glass>
        <CardHeader>
          <CardTitle>Varsayılan Mod</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button 
              variant={defaultMode === 'light' ? 'default' : 'outline'} 
              className="flex-1 h-24 flex-col gap-2"
              onClick={() => saveDefaultMode('light')}
              disabled={saving}
            >
              <Sun className="h-6 w-6" />
              <span>Açık</span>
            </Button>
            <Button 
              variant={defaultMode === 'dark' ? 'default' : 'outline'} 
              className="flex-1 h-24 flex-col gap-2"
              onClick={() => saveDefaultMode('dark')}
              disabled={saving}
            >
              <Moon className="h-6 w-6" />
              <span>Koyu</span>
            </Button>
            <Button 
              variant={defaultMode === 'system' ? 'default' : 'outline'} 
              className="flex-1 h-24 flex-col gap-2"
              onClick={() => saveDefaultMode('system')}
              disabled={saving}
            >
              <Monitor className="h-6 w-6" />
              <span>Sistem</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}




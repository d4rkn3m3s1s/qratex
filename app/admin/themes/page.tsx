'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Palette,
  Check,
  Sun,
  Moon,
  Monitor,
  Sparkles,
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

  const activateTheme = (id: string) => {
    setThemes(themes.map(t => ({ ...t, isActive: t.id === id })));
    toast.success('Tema aktifleştirildi');
  };

  const saveCustomTheme = () => {
    toast.success('Özel tema kaydedildi');
  };

  const activeTheme = themes.find(t => t.isActive);

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

          <Button onClick={saveCustomTheme} className="w-full md:w-auto">
            Özel Temayı Kaydet
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
            <Button variant="outline" className="flex-1 h-24 flex-col gap-2">
              <Sun className="h-6 w-6" />
              <span>Açık</span>
            </Button>
            <Button variant="default" className="flex-1 h-24 flex-col gap-2">
              <Moon className="h-6 w-6" />
              <span>Koyu</span>
            </Button>
            <Button variant="outline" className="flex-1 h-24 flex-col gap-2">
              <Monitor className="h-6 w-6" />
              <span>Sistem</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



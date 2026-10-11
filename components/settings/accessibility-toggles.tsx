'use client';

import { useEffect, useState } from 'react';
import { Eye, ZapOff, Contrast, Type } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  applyAccessibilityPrefs,
  readAccessibilityPrefs,
  type AccessibilityPrefs,
  type TextScalePref,
} from '@/lib/accessibility-prefs';

/**
 * Erişilebilirlik anahtarları (yüksek kontrast / animasyon azaltma / renk körü).
 * Kendi state'ini localStorage'dan yükler, değişimde anında <html>'e uygular ve
 * localStorage'a yazar (applyAccessibilityPrefs). Tüm rollerde (müşteri/bayi/admin)
 * tekrar kullanılabilir — önceden yalnızca müşteri ayarlarında inline vardı.
 *
 * onChange verilirse, üst bileşen DB'ye kalıcılık için tercihleri alabilir.
 */
export function AccessibilityToggles({
  onChange,
}: {
  onChange?: (prefs: AccessibilityPrefs) => void;
}) {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>({
    highContrast: false,
    reduceAnimations: false,
    colorblindMode: false,
    textScale: 'default',
  });

  // Mount'ta mevcut tercihleri oku (class'lar AccessibilityClassSync ile zaten uygulanmış).
  useEffect(() => {
    setPrefs(readAccessibilityPrefs());
  }, []);

  const update = (patch: Partial<AccessibilityPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyAccessibilityPrefs(next); // anında <html> + localStorage
    onChange?.(next);
  };

  const rows: Array<{
    key: Exclude<keyof AccessibilityPrefs, 'textScale'>;
    icon: React.ReactNode;
    title: string;
    desc: string;
  }> = [
    {
      key: 'highContrast',
      icon: <Contrast className="h-5 w-5 text-muted-foreground" />,
      title: 'Yüksek Kontrast Modu',
      desc: 'Metinler ve arka planlar arasındaki zıtlığı artırır',
    },
    {
      key: 'reduceAnimations',
      icon: <ZapOff className="h-5 w-5 text-muted-foreground" />,
      title: 'Animasyonları Azalt',
      desc: 'Görsel geçişleri ve hareket efektlerini en aza indirir',
    },
    {
      key: 'colorblindMode',
      icon: <Eye className="h-5 w-5 text-muted-foreground" />,
      title: 'Renk Körü Modu',
      desc: 'Kırmızı/yeşil göstergeleri renk körü-güvenli renklere çevirir',
    },
  ];

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-primary">Erişilebilirlik</h4>
      <div className="space-y-4 border-l-2 border-primary/20 pl-4">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between">
            <div className="flex gap-3">
              <div className="mt-1">{r.icon}</div>
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-muted-foreground">{r.desc}</p>
              </div>
            </div>
            <Switch
              checked={prefs[r.key]}
              onCheckedChange={(checked) => update({ [r.key]: checked })}
              aria-label={r.title}
            />
          </div>
        ))}
        {/* Yazı boyutu (html.text-scale-lg/xl) — önceden yalnız müşteri ayarlarında seçilebiliyordu. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3">
            <div className="mt-1">
              <Type className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium" id="a11y-text-scale-label">Yazı Boyutu</p>
              <p className="text-sm text-muted-foreground">Tüm metinleri birlikte büyütür</p>
            </div>
          </div>
          <div role="radiogroup" aria-labelledby="a11y-text-scale-label" className="inline-flex rounded-lg border p-0.5">
            {TEXT_SCALES.map((s) => {
              const active = (prefs.textScale ?? 'default') === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update({ textScale: s.value })}
                  className={
                    'min-h-11 min-w-11 rounded-md px-3 text-sm font-medium transition-colors ' +
                    (active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const TEXT_SCALES: Array<{ value: TextScalePref; label: string }> = [
  { value: 'default', label: 'Normal' },
  { value: 'lg', label: 'Büyük' },
  { value: 'xl', label: 'Çok büyük' },
];

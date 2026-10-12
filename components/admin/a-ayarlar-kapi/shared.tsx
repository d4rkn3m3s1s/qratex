'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { PlatformSettingsState } from '@/lib/platform-settings/server';
import {
  BACKGROUND_EFFECTS,
  PLATFORM_SETTINGS,
  SETTINGS_KEYS,
  type BackgroundEffect,
  type MaintenanceState,
} from '@/lib/platform-settings/registry';
import { errorText, isConflict, saveSettings, settingsKeys, type SettingChange } from './api';

/**
 * Bölüm içi kaydedilmemiş taslak bildirimi. `DirtyBar` yalnız sekme kapanışını (`beforeunload`)
 * yakalar; Ayarlar merkezinde bölüm değiştirmek bileşeni söküp taslağı SESSİZCE atıyordu.
 * Bölümler kirli durumlarını buraya bildirir, merkez bölüm değişiminde onay ister.
 */
export const SettingsDirtyContext = createContext<((section: string, dirty: boolean) => void) | null>(null);

export function useReportDirty(section: string, dirty: boolean) {
  const report = useContext(SettingsDirtyContext);
  useEffect(() => {
    report?.(section, dirty);
    return () => report?.(section, false);
  }, [report, section, dirty]);
}

export const EFFECT_GROUPS: Array<{ title: string; items: Array<{ id: BackgroundEffect; name: string; description: string }> }> = [
  {
    title: 'Temel',
    items: [
      { id: 'original', name: 'Orijinal', description: 'Varsayılan kar ve küre animasyonları' },
      { id: 'aurora', name: 'Aurora', description: 'Kuzey ışıkları efekti' },
      { id: 'sparkles', name: 'Parıltı', description: 'Parlayan yıldızlar' },
      { id: 'beams', name: 'Işınlar', description: 'Hareketli ışın demetleri' },
      { id: 'gradient', name: 'Renk geçişi', description: 'Yavaş akan renk geçişleri' },
      { id: 'meteors', name: 'Meteorlar', description: 'Meteor yağmuru' },
      { id: 'grid', name: 'Izgara', description: 'Izgara deseni' },
      { id: 'dots', name: 'Noktalar', description: 'Nokta deseni' },
      { id: 'none', name: 'Efekt yok', description: 'Düz zemin, animasyon yok' },
    ],
  },
  {
    title: 'Hareketli',
    items: [
      { id: 'matrix', name: 'Matrix', description: 'Karakter yağmuru' },
      { id: 'particles', name: 'Parçacıklar', description: 'Etkileşimli parçacık ağı' },
      { id: 'waves', name: 'Dalgalar', description: 'Akıcı dalga animasyonu' },
      { id: 'starfield', name: 'Uzay yolculuğu', description: 'Yıldızlar arası geçiş' },
      { id: 'cyberpunk', name: 'Siberpunk', description: 'Neon ızgara ve çizgiler' },
      { id: 'geometric', name: 'Geometrik', description: 'Dönen şekiller' },
      { id: 'fireflies', name: 'Ateş böcekleri', description: 'Süzülen ışık noktaları' },
    ],
  },
  {
    title: 'Sinematik ve mevsimsel',
    items: [
      { id: 'nebula', name: 'Nebula', description: 'Kozmik bulutsu ve yıldızlar' },
      { id: 'northern-lights', name: 'Kuzey ışıkları', description: 'Aurora dalgaları' },
      { id: 'holographic', name: 'Holografik', description: 'Gökkuşağı prizma' },
      { id: 'galaxy', name: 'Galaksi', description: 'Dönen sarmal galaksi' },
      { id: 'summer', name: 'Yaz', description: 'Gün batımı ve deniz dalgaları' },
      { id: 'winter', name: 'Kış', description: 'Kar taneleri ve kardan adam' },
      { id: 'autumn', name: 'Sonbahar', description: 'Düşen yapraklar, sıcak tonlar' },
      { id: 'spring', name: 'İlkbahar', description: 'Açan çiçekler ve bahar yağmuru' },
      { id: 'ice-kingdom', name: 'Buzul Krallığı', description: 'Buz kalesi ve aurora' },
    ],
  },
  {
    title: 'Özel gün',
    items: [
      { id: 'christmas', name: 'Yılbaşı', description: 'Kar ve ışıklar' },
      { id: 'valentine', name: 'Sevgililer Günü', description: 'Kalpler ve parıltılar' },
      { id: 'birthday', name: 'Doğum günü', description: 'Balonlar ve konfeti' },
    ],
  },
];

const EFFECT_NAMES = new Map(EFFECT_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.name] as const)));
export function effectName(id: unknown): string {
  return typeof id === 'string' && (BACKGROUND_EFFECTS as readonly string[]).includes(id) ? EFFECT_NAMES.get(id as BackgroundEffect) ?? id : String(id ?? '—');
}

/** Geçmiş/önizleme için insan okunur değer. */
export function formatSettingValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Varsayılan (kayıt yok)';
  if (key === SETTINGS_KEYS.backgroundEffect) return effectName(value);
  if (key === SETTINGS_KEYS.maintenance) {
    const m = value as Partial<MaintenanceState>;
    return m?.enabled ? `Açık${m.message ? ` · “${m.message}”` : ''}` : 'Kapalı';
  }
  if (typeof value === 'boolean') return value ? 'Açık' : 'Kapalı';
  if (value && typeof value === 'object') {
    let off = 0;
    const walk = (v: unknown) => {
      if (v === false) off += 1;
      else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
    };
    walk(value);
    return off === 0 ? 'Tümü açık' : `${off} öğe kapalı`;
  }
  return String(value);
}

/** Ayar kaydetme (yalnız değişen anahtarlar, sürümleriyle). Başarıda önbelleği sunucu yanıtıyla günceller. */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: SettingChange[]) => saveSettings(changes),
    onSuccess: (state) => {
      qc.setQueryData(settingsKeys.state, state);
      void qc.invalidateQueries({ queryKey: settingsKeys.history });
    },
    onError: (e) => {
      if (isConflict(e)) {
        toast.error('Bu ayar siz düzenlerken başka bir yönetici tarafından değiştirildi. Güncel değerler yüklendi; kontrol edip tekrar kaydedin.');
        void qc.invalidateQueries({ queryKey: settingsKeys.state });
      } else {
        toast.error(errorText(e));
      }
    },
  });
}

export function changeFor<K extends keyof PlatformSettingsState['values']>(
  state: PlatformSettingsState,
  key: K,
  value: PlatformSettingsState['values'][K]
): SettingChange {
  return { key, value, baseVersion: state.versions[key] };
}

/** Etiket + etki açıklaması + anahtar satırı (aria bağlantıları otomatik). */
export function SettingSwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  badge,
  dirty,
}: {
  label: ReactNode;
  description: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: ReactNode;
  dirty?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4 py-4', dirty && 'rounded-control bg-brand-subtle/40 px-3 -mx-3')}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="qx-body font-medium text-fg">
            {label}
          </label>
          {badge}
          {dirty ? <span className="qx-caption rounded-chip bg-brand-subtle px-1.5 py-0.5 text-brand">Kaydedilmedi</span> : null}
        </div>
        <p id={`${id}-desc`} className="qx-small text-fg-muted">
          {description}
        </p>
      </div>
      <div className="flex min-h-11 min-w-11 items-center justify-end">
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-describedby={`${id}-desc`} />
      </div>
    </div>
  );
}

export function effectOf(key: keyof typeof PLATFORM_SETTINGS): string {
  return PLATFORM_SETTINGS[key].effect;
}

/** Kaydet düğmesinde kısa "başarılı" tiki: kayıt bitince `flash()` → `saved` ~1.4 sn true (Button success). */
export function useSavedFlash(ms = 1400): [boolean, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), ms);
  }, [ms]);
  return [saved, flash];
}

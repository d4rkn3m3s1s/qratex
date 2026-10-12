'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Volume2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useLocaleSafe } from '@/lib/app-locale';
import {
  DEFAULT_SOUND_PREFS,
  previewSound,
  readSoundPrefs,
  scopeFromPath,
  writeSoundPrefs,
  type SoundPrefs,
} from '@/lib/sound';

/**
 * "Arayüz sesleri" anahtarı + ses seviyesi. Kapsam URL'den (müşteri/bayi/admin);
 * tercih cihazda (localStorage) saklanır. Müşteri varsayılanı AÇIK, bayi/admin KAPALI.
 */
export function SoundToggle({ compact = false }: { compact?: boolean }) {
  const scope = scopeFromPath(usePathname());
  const [prefs, setPrefs] = useState<SoundPrefs>(DEFAULT_SOUND_PREFS[scope]);
  const en = useLocaleSafe() === 'en';

  useEffect(() => {
    setPrefs(readSoundPrefs(scope));
  }, [scope]);

  const update = (next: SoundPrefs, preview = true) => {
    setPrefs(next);
    writeSoundPrefs(scope, next);
    if (preview && next.enabled) previewSound('success', next.volume);
  };

  const title = en ? 'Interface sounds' : 'Arayüz sesleri';
  return (
    <div className={compact ? 'space-y-2 py-3' : 'space-y-2'}>
      <div className={compact ? 'flex items-start justify-between gap-3' : 'flex items-center justify-between gap-3'}>
        <div className="flex gap-3">
          {compact ? (
            // Ayarlar listesindeki SettingSwitchRow ikon karosuyla birebir (32px karo, 16px ikon).
            <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-control bg-surface-muted text-fg-muted">
              <Volume2 className="h-4 w-4" />
            </span>
          ) : (
            <div className="mt-1">
              <Volume2 className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
          )}
          <div>
            <p className={compact ? 'text-base font-medium text-fg' : 'font-medium'}>{title}</p>
            <p className={compact ? 'qx-small mt-0.5 text-fg-muted' : 'text-sm text-muted-foreground'}>
              {en
                ? 'Soft sounds (and vibration) for rewards, points and confirmations. Saved on this device.'
                : 'Ödül, puan ve onay anlarında yumuşak sesler (ve titreşim). Bu cihazda saklanır.'}
            </p>
          </div>
        </div>
        <Switch checked={prefs.enabled} onCheckedChange={(v) => update({ ...prefs, enabled: v })} aria-label={title} />
      </div>
      {prefs.enabled && (
        <label className={`flex items-center gap-3 ${compact ? 'pl-11' : 'pl-8'} text-sm text-muted-foreground`}>
          <span>{en ? 'Volume' : 'Seviye'}</span>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={Math.round(prefs.volume * 100)}
            onChange={(e) => setPrefs({ ...prefs, volume: Number(e.target.value) / 100 })}
            onPointerUp={() => update(prefs)}
            onKeyUp={() => update(prefs)}
            // Yerel iz Chrome'da accent-color'a göre açık griye düşüyor (koyu temada parlak beyaz şerit) →
            // iz ve topuz tema token'larından çizilir; dolu kısım hacmi gösterir.
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${Math.round(prefs.volume * 100)}%, hsl(var(--border-strong)) ${Math.round(prefs.volume * 100)}%)`,
            }}
            className="h-1.5 w-40 cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[hsl(var(--primary))] [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[hsl(var(--primary))] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
            aria-label={en ? 'Interface sound volume' : 'Arayüz sesi seviyesi'}
          />
        </label>
      )}
    </div>
  );
}

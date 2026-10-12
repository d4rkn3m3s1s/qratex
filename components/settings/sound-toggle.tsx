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
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-3">
          <div className="mt-1">
            <Volume2 className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">
              {en
                ? 'Soft sounds (and vibration) for rewards, points and confirmations. Saved on this device.'
                : 'Ödül, puan ve onay anlarında yumuşak sesler (ve titreşim). Bu cihazda saklanır.'}
            </p>
          </div>
        </div>
        <Switch checked={prefs.enabled} onCheckedChange={(v) => update({ ...prefs, enabled: v })} aria-label={title} />
      </div>
      {prefs.enabled && (
        <label className="flex items-center gap-3 pl-8 text-sm text-muted-foreground">
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
            className="w-40 accent-[hsl(var(--primary))]"
            aria-label={en ? 'Interface sound volume' : 'Arayüz sesi seviyesi'}
          />
        </label>
      )}
    </div>
  );
}

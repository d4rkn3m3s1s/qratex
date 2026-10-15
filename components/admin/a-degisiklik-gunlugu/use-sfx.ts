'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SOUND_PREFS_EVENT, playSound, readSoundPrefs, writeSoundPrefs, type SoundName } from '@/lib/sound';

/**
 * Günlük sayfasının ses katmanı. Global "Arayüz sesleri" tercihine (admin kapsamı) uyar;
 * yalnız kullanıcı sayfayla etkileşime geçtikten sonra çalar (otomatik çalma yok).
 */
export function useChangelogSfx() {
  const interacted = useRef(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(readSoundPrefs('admin').enabled);
    sync();
    const mark = () => { interacted.current = true; };
    window.addEventListener('pointerdown', mark, { passive: true });
    window.addEventListener('keydown', mark);
    window.addEventListener(SOUND_PREFS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('keydown', mark);
      window.removeEventListener(SOUND_PREFS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const play = useCallback((name: SoundName, volume = 0.7) => {
    if (!interacted.current) return;
    playSound(name, { volume, haptic: false });
  }, []);

  const toggle = useCallback(() => {
    const prefs = readSoundPrefs('admin');
    const next = !prefs.enabled;
    writeSoundPrefs('admin', { ...prefs, enabled: next });
    setEnabled(next);
    interacted.current = true;
    if (next) playSound('toggle-on', { haptic: false });
  }, []);

  return { play, enabled, toggle };
}

export type ChangelogSfx = ReturnType<typeof useChangelogSfx>;

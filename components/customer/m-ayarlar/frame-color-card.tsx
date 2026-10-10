'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Paintbrush, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/states';
import { saveFrameColor, SettingsApiError } from './api';
import { AvatarView } from './avatar-view';
import { errorText, useSettingsCopy } from './copy';
import { Panel } from './ui';
import { useSettingsCache } from './use-settings';

/**
 * Kuşanılmış avatar çerçevesinin renk tonu. Çerçeve yoksa dürüst boş durum + Ödüller'e bağlantı
 * (eski ekran "dükkandan kuşanın" deyip bağlantı vermiyordu). Kaydırıcı klavyeyle kullanılır,
 * değeri derece olarak okunur.
 */
export function FrameColorCard({
  frame,
  hue,
  image,
  name,
}: {
  frame: string | null;
  hue: number | null;
  image: string | null;
  name: string;
}) {
  const { copy } = useSettingsCopy();
  const { update } = useSession();
  const cache = useSettingsCache();
  const sliderId = useId();
  const [value, setValue] = useState(hue ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== (hue ?? 0);

  const save = async (next: number | null) => {
    setSaving(true);
    setError(null);
    try {
      const out = await saveFrameColor(next);
      const saved = out.customFrameColor ? Number(out.customFrameColor) : null;
      setValue(saved ?? 0);
      cache.patch((prev) => ({ ...prev, frame: { ...prev.frame, hue: saved } }));
      await update({ customFrameColor: out.customFrameColor }).catch(() => undefined);
      toast.success(copy.frameSaved);
    } catch (e) {
      setError(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, e instanceof Error ? e.message : undefined));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={copy.frameTitle} description={copy.frameDesc} icon={<Paintbrush />}>
      {!frame ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="qx-small flex-1 text-fg-muted">{copy.frameNone}</p>
          <Button asChild variant="outline">
            <Link href="/customer/wallet/rewards">{copy.frameNoneCta}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <AvatarView image={image} name={name} frame={frame} hue={value} size={88} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={sliderId} className="text-sm font-medium text-fg">
                {copy.frameHue}
              </label>
              <span className="qx-small qx-num text-fg-muted" aria-hidden>
                {value}°
              </span>
            </div>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={360}
              step={1}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              aria-valuetext={copy.frameHueValue(value)}
              className="h-11 w-full cursor-pointer accent-[hsl(var(--brand))]"
            />
            {error ? <InlineError>{error}</InlineError> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void save(value)} loading={saving} disabled={!dirty || saving}>
                {copy.frameSave}
              </Button>
              <Button type="button" variant="ghost" className="gap-2" onClick={() => void save(null)} disabled={saving || (hue ?? 0) === 0}>
                <RotateCcw aria-hidden className="h-4 w-4" />
                {copy.frameReset}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

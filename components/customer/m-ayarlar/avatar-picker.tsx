'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Camera, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { customerAvatarCategories, isCustomerPresetAvatar } from '@/lib/customer-settings/avatar-policy';
import { resolveAvatarImage } from '@/lib/avatar-options';
import { cn } from '@/lib/utils';
import { patchProfile, SettingsApiError } from './api';
import { errorText, useSettingsCopy } from './copy';
import { InlineError } from '@/components/states';
import { useSettingsCache } from './use-settings';

const CATEGORIES = customerAvatarCategories();

/**
 * Avatar seçici. Izgara bir radyo grubu gibi davranır (seçili `aria-pressed`), görsel adı
 * "Avatar N" — ekran okuyucu 30 kez "Avatar" duymaz. Kaydetme sunucuda izin listesiyle
 * doğrulanır (denetim B3); başarıda oturum başlığı da güncellenir.
 */
export function AvatarPicker({ current, name }: { current: string | null; name: string }) {
  const { copy } = useSettingsCopy();
  const { update } = useSession();
  const cache = useSettingsCache();
  const [open, setOpen] = useState(false);
  const firstCategory = CATEGORIES.find((c) => current && c.items.includes(current))?.category ?? CATEGORIES[0]?.category ?? '';
  const [category, setCategory] = useState(firstCategory);
  const [selected, setSelected] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthImage = current && !isCustomerPresetAvatar(current) ? current : null;
  const items = CATEGORIES.find((c) => c.category === category)?.items ?? [];

  const save = async () => {
    if (!selected || selected === current) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const out = await patchProfile({ image: selected });
      cache.patch((prev) => ({ ...prev, profile: { ...prev.profile, image: out.image } }));
      await update({ image: out.image }).catch(() => undefined);
      toast.success(copy.avatarSaved);
      setOpen(false);
    } catch (e) {
      setError(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, e instanceof Error ? e.message : undefined));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        onClick={() => {
          setSelected(current);
          setError(null);
          setOpen(true);
        }}
      >
        <Camera aria-hidden className="h-4 w-4" />
        {copy.avatarChange}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88dvh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{copy.avatarDialogTitle}</DialogTitle>
            <DialogDescription>{copy.avatarDialogDesc}</DialogDescription>
          </DialogHeader>
          <ChoiceChips
            aria-label={copy.avatarCategories}
            options={CATEGORIES.map((c) => ({ value: c.category, label: c.category }))}
            value={category}
            onChange={(v) => v && setCategory(v)}
            size="sm"
            scroll
          />
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-2">
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {oauthImage && category === firstCategory ? (
                <li>
                  <AvatarOption
                    src={oauthImage}
                    label={copy.avatarCurrentOAuth}
                    selected={selected === oauthImage}
                    onSelect={() => setSelected(oauthImage)}
                  />
                </li>
              ) : null}
              {items.map((src, i) => (
                <li key={src}>
                  <AvatarOption
                    src={src}
                    label={`${category} · ${copy.avatarOption(i + 1)}`}
                    selected={selected === src}
                    onSelect={() => setSelected(src)}
                  />
                </li>
              ))}
            </ul>
          </div>
          {error ? <InlineError>{error}</InlineError> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              {copy.nameDiscard}
            </Button>
            <Button type="button" onClick={() => void save()} loading={saving} disabled={!selected || saving}>
              {copy.avatarSave}
            </Button>
          </DialogFooter>
          <span className="sr-only">{name}</span>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AvatarOption({ src, label, selected, onSelect }: { src: string; label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        'relative grid aspect-square w-full min-h-11 place-items-center rounded-control border-2 p-1.5 transition-colors duration-fast ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-brand bg-brand-subtle' : 'border-subtle hover:border-strong',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- hazır WebP, sabit boyut */}
      <img src={resolveAvatarImage(src) ?? src} alt="" width={64} height={64} loading="lazy" className="h-full w-full rounded-full object-cover" />
      {selected ? (
        <span aria-hidden className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-fg">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}

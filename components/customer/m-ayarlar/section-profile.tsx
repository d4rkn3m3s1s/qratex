'use client';

import Link from 'next/link';
import { ChevronRight, LayoutGrid, UserRound } from 'lucide-react';
import type { CustomerSettingsSnapshot } from '@/lib/customer-settings/contract';
import { AvatarPicker } from './avatar-picker';
import { AvatarView } from './avatar-view';
import { BirthdayCard } from './birthday-card';
import { useSettingsCopy } from './copy';
import { FrameColorCard } from './frame-color-card';
import { NameForm } from './name-form';
import { Panel } from './ui';

/**
 * Profil: kim olarak göründüğün (ad, avatar, çerçeve rengi), doğum günü ve vitrine kısayol.
 * Vitrin düzenleme ayarlardan çıktı (denetim "çakışmalar"): rozetler koleksiyonda, süsler
 * Ödüller'de sabitlenir; burada yalnız doluluk + bağlantı kalır.
 */
export function ProfileSection({ data }: { data: CustomerSettingsSnapshot }) {
  const { copy } = useSettingsCopy();
  return (
    <div className="flex flex-col gap-4">
      <Panel title={copy.profileTitle} description={copy.profileDesc} icon={<UserRound />}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <AvatarView image={data.profile.image} name={data.profile.name} frame={data.frame.equipped} hue={data.frame.hue} size={72} />
            <AvatarPicker current={data.profile.image} name={data.profile.name} />
          </div>
          <NameForm name={data.profile.name} email={data.profile.email} />
        </div>
      </Panel>

      <BirthdayCard birthday={data.birthday} />

      <FrameColorCard frame={data.frame.equipped} hue={data.frame.hue} image={data.profile.image} name={data.profile.name} />

      <Link
        href="/customer/me/badges"
        className="group flex min-h-11 items-center gap-3 rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1 transition-colors duration-fast ease-standard hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
      >
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-brand-subtle text-brand">
          <LayoutGrid className="h-[1.125rem] w-[1.125rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="qx-h3 block text-fg">{copy.showcaseTitle}</span>
          <span className="qx-small block text-fg-muted">{copy.showcaseDesc(data.showcase.pinned, data.showcase.limit)}</span>
          <span className="qx-small mt-1 block font-medium text-brand">{copy.showcaseCta}</span>
        </span>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-fg-muted transition-transform duration-fast group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

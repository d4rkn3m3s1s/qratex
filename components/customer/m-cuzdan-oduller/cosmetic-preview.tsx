'use client';

import Image from 'next/image';
import { Award, User2 } from 'lucide-react';
import { DiamondBadge, RubyBadge, UserAvatarFrame } from '@/components/ui/avatar-frame';
import { cn } from '@/lib/utils';
import type { CosmeticDTO } from '@/lib/wallet-rewards/types';

function isUrl(v: string | null): v is string {
  return !!v && (v.startsWith('/') || /^https?:\/\//i.test(v));
}

function Avatar({ image, name }: { image: string | null; name: string | null }) {
  if (image) {
    return <Image src={image} alt="" fill sizes="8rem" className="object-cover" unoptimized />;
  }
  const initials = (name ?? '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase('tr-TR') ?? '').join('');
  return initials ? (
    <span className="qx-small font-semibold text-fg">{initials}</span>
  ) : (
    <User2 aria-hidden className="size-1/2 text-fg-muted" />
  );
}

/**
 * Kozmetik önizlemesi — kullanıcının KENDİ avatarı ve kendi çerçeve tonuyla (panodaki ile aynı).
 * `animate=false` (ızgara) iken CSS animasyonları duraklatılır; hover/odakta oynar.
 * Bilinmeyen rozet anahtarı ham metin olarak basılmaz (iç tanımlayıcı sızıntısı kapandı).
 */
export function CosmeticPreview({
  item,
  preview,
  size = 'md',
  animate = false,
}: {
  item: Pick<CosmeticDTO, 'type' | 'asset' | 'name'>;
  preview: { image: string | null; name: string | null; frameColor: string | null };
  size?: 'md' | 'lg';
  animate?: boolean;
}) {
  const box = size === 'lg' ? 'size-36' : 'size-20 sm:size-24';
  const pause = !animate && '[&_*]:[animation-play-state:paused] group-hover:[&_*]:[animation-play-state:running] group-focus-visible:[&_*]:[animation-play-state:running]';

  if (item.type === 'avatar_frame') {
    return (
      <div className={cn('relative', box, pause)}>
        <UserAvatarFrame frameId={item.asset} customColor={preview.frameColor}>
          <div className="relative grid h-full w-full place-items-center bg-surface-muted">
            <Avatar image={preview.image} name={preview.name} />
          </div>
        </UserAvatarFrame>
      </div>
    );
  }

  if (item.type === 'profile_background') {
    return (
      <div
        className={cn(
          'relative flex flex-col items-center justify-center overflow-hidden rounded-control border border-subtle qx-elevation-1',
          size === 'lg' ? 'h-36 w-60' : 'h-20 w-32 sm:h-24 sm:w-36',
          !isUrl(item.asset) && item.asset,
          pause
        )}
      >
        {isUrl(item.asset) && <Image src={item.asset} alt="" fill sizes="16rem" className="object-cover" unoptimized />}
        <div className="relative grid size-9 place-items-center overflow-hidden rounded-full bg-surface-muted ring-2 ring-surface-1">
          <Avatar image={preview.image} name={preview.name} />
        </div>
        <span className="relative mt-1.5 h-1.5 w-12 rounded-full bg-surface-1/70" aria-hidden />
      </div>
    );
  }

  return (
    <div className={cn('relative', box, pause)}>
      {item.asset === 'diamond_badge' ? (
        <DiamondBadge />
      ) : item.asset === 'ruby_badge' ? (
        <RubyBadge />
      ) : isUrl(item.asset) ? (
        <Image src={item.asset} alt="" fill sizes="8rem" className="object-contain" unoptimized />
      ) : (
        <span className="grid h-full w-full place-items-center rounded-full bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border">
          <Award aria-hidden className="size-1/2" />
        </span>
      )}
    </div>
  );
}

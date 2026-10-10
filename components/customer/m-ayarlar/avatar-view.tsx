'use client';

import { UserAvatarFrame } from '@/components/ui/avatar-frame';
import { resolveAvatarImage } from '@/lib/avatar-options';
import { cn } from '@/lib/utils';

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toLocaleUpperCase('tr-TR');
}

/**
 * Avatar (+ kuşanılmış çerçeve ve renk tonu). Görsel dekoratiftir (`alt=""`); kimlik metni
 * her zaman yanında yazılıdır. Hazır avatarlar hash'li WebP'ye çözülür (hafif, önbellekli).
 */
export function AvatarView({
  image,
  name,
  frame,
  hue,
  size = 72,
  className,
}: {
  image: string | null;
  name: string;
  frame?: string | null;
  hue?: number | null;
  size?: number;
  className?: string;
}) {
  const src = resolveAvatarImage(image);
  const inner = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- hazır WebP ya da OAuth URL'si, sabit boyut
    <img src={src} alt="" width={size} height={size} className="h-full w-full rounded-full object-cover" />
  ) : (
    <span aria-hidden className="qx-h2 grid h-full w-full place-items-center rounded-full bg-brand-subtle text-brand">
      {initials(name)}
    </span>
  );

  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      {frame ? (
        // Renk tonu burada (yumuşak geçişli, azaltılmış harekette CSS ile anında); çerçeve
        // bileşenine ton verilmez ki filtre iki kez uygulanmasın.
        <span
          className="grid h-full w-full place-items-center transition-[filter] duration-base ease-standard"
          style={hue ? { filter: `hue-rotate(${hue}deg)` } : undefined}
        >
          <UserAvatarFrame frameId={frame}>{inner}</UserAvatarFrame>
        </span>
      ) : (
        <span className="h-full w-full rounded-full border-2 border-brand-border">{inner}</span>
      )}
    </span>
  );
}

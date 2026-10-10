'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/**
 * Oyuncu avatarı. Fotoğraf yoksa baş harfler (nötr zemin, okunurluk her temada); halka rengi
 * KİŞİYE bağlı (opak anahtardan) —
 * eski sayfada satır sırasına bağlıydı ve aynı kişi sekme değişince farklı yüzle görünüyordu.
 * Ad hemen yanında metin olarak durduğu için görsel dekoratiftir (`alt=""`).
 */
const TONES = [
  'ring-category-1',
  'ring-category-2',
  'ring-category-3',
  'ring-category-4',
  'ring-category-5',
  'ring-category-6',
  'ring-category-7',
  'ring-category-8',
] as const;

function toneFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length] as string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.charAt(0) ?? '?';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (a + b).toLocaleUpperCase('tr-TR');
}

export function LigAvatar({
  name,
  image,
  seed,
  size = 40,
  className,
}: {
  name: string;
  image: string | null;
  seed: string;
  size?: number;
  className?: string;
}) {
  return (
    <Avatar className={cn('shrink-0', className)} style={{ width: size, height: size }}>
      {image ? <AvatarImage src={image} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback
        aria-hidden
        className={cn('bg-surface-3 font-semibold text-fg ring-2 ring-inset', toneFor(seed))}
        style={{ fontSize: Math.max(12, Math.round(size * 0.36)) }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

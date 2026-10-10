'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** Klan kimlik rengi: kimlikten kararlı biçimde `--category-1..8` (şema alanı gerekmez). */
export function squadAccent(id: string): `category-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}` {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `category-${((h % 8) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2);
  return s.toLocaleUpperCase('tr-TR');
}

/** Klan amblemi: kimlik rengiyle monogram (3B değil — §4.2 politikası). */
export function SquadEmblem({ id, name, size = 'md', className }: { id: string; name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const accent = squadAccent(id);
  const dim = size === 'lg' ? 'h-16 w-16 text-xl' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm';
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-2xl font-display font-bold text-white shadow-sm', dim, className)}
      style={{
        background: `linear-gradient(135deg, hsl(var(--${accent})), hsl(var(--${accent}) / 0.65))`,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function MemberAvatar({ name, image, size = 40, className }: { name: string; image: string | null; size?: number; className?: string }) {
  return (
    <Avatar className={cn('shrink-0 border border-subtle', className)} style={{ width: size, height: size }}>
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback className="bg-brand-subtle text-xs font-semibold text-brand-text">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** Göreli zaman ("3 sa önce") — Intl.RelativeTimeFormat. */
export function relativeTime(iso: string, tag: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}

export function formatNumber(n: number, tag: string): string {
  return n.toLocaleString(tag);
}

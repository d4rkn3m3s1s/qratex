import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { BadgeGlyph, GlowCard, PointsChip, StreakFlame, XpRing } from '@/components/ds/play';
import { cn } from '@/lib/utils';
import { formatDate, getMeCopy, type MeLocale } from '../copy';
import type { MeProfile } from '../server/profile';
import { SOFT_BUTTON } from './styles';

function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toLocaleUpperCase('tr-TR');
}

/** Ben kabuğunun profil kartı: kim, ne zamandan beri, seviye, bakiye, seri, vitrin karakteri. */
export function MeProfileCard({ profile, settingsHref, locale }: { profile: MeProfile; settingsHref: string | null; locale: MeLocale }) {
  const c = getMeCopy(locale).me;
  const since = formatDate(profile.memberSince, locale, { month: 'long', year: 'numeric' });

  return (
    <GlowCard aria-labelledby="me-profile-name">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {profile.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar: hazır WebP ya da OAuth/R2 URL'si, sabit boyut
            <img
              src={profile.image}
              alt=""
              width={72}
              height={72}
              className="size-[72px] shrink-0 rounded-full border-2 border-brand-border object-cover"
            />
          ) : (
            <span aria-hidden className="qx-h2 grid size-[72px] shrink-0 place-items-center rounded-full bg-brand-subtle font-display text-brand-text">
              {initials(profile.name)}
            </span>
          )}
          <div className="min-w-0">
            <h2 id="me-profile-name" className="qx-h2 truncate text-fg">
              {profile.name ?? c.title}
            </h2>
            <p className="qx-small text-fg-muted">{c.memberSince(since)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PointsChip value={profile.points} size="sm" locale={locale} tone="gold" />
              <StreakFlame days={profile.streak} size="sm" locale={locale} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:flex-col sm:items-end">
          <XpRing level={profile.level} percent={profile.levelPercent} size={64} locale={locale} />
          {profile.featured && (
            <div className="flex items-center gap-2">
              <BadgeGlyph
                label={profile.featured.name}
                imageSrc={profile.featured.imageSrc}
                emoji={profile.featured.emoji ?? undefined}
                rarity={profile.featured.rarity}
                color={profile.featured.color ?? undefined}
                size="sm"
                locale={locale}
              />
              <span className="min-w-0">
                <span className="qx-caption block text-fg-muted">{c.featured}</span>
                <span className="qx-small block max-w-[10rem] truncate font-medium text-fg">{profile.featured.name}</span>
              </span>
            </div>
          )}
        </div>
      </div>
      {settingsHref && (
        <div className="mt-4 border-t border-subtle pt-4">
          <Link href={settingsHref} className={cn(SOFT_BUTTON, 'w-full sm:w-auto')}>
            <Pencil aria-hidden className="size-4" />
            {c.editProfile}
          </Link>
        </div>
      )}
    </GlowCard>
  );
}

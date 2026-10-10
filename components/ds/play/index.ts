/**
 * QDL play kaydı bileşenleri — müşteri ödül/oyun yüzeyleri (ifadeli ama ölçülü).
 * Kılavuz: components/ds/play/README.md
 *
 *   import { PointsChip, XpRing, StreakFlame, GlowCard } from '@/components/ds/play';
 */
export { PointsChip, MOMENT_PULSE_EVENT, type PointsChipProps, type PointsChipTone } from './points-chip';
export { XpRing, type XpRingProps } from './xp-ring';
export { StreakFlame, type StreakFlameProps } from './streak-flame';
export { RewardProgress, type RewardProgressProps, type RewardMilestone } from './reward-progress';
export { BadgeGlyph, type BadgeGlyphProps, type BadgeGlyphSize } from './badge-glyph';
export { RarityBadge, RARITY_ICONS, type RarityBadgeProps } from './rarity-badge';
export { GlowCard, type GlowCardProps, type GlowAccent } from './glow-card';
export { LeagueEmblem, type LeagueEmblemProps, type LeagueEmblemSize } from './league-emblem';
export { CountdownChip, type CountdownChipProps, type CountdownMode } from './countdown-chip';
export { Ambient, type AmbientProps } from './ambient';

export { RegisterProvider, useRegister, useRegisterContext, type Register } from './register';
export { RARITIES, RARITY_STYLES, normalizeRarity, type Rarity, type RarityStyle } from './rarity';
export {
  LEAGUE_EMBLEM_COLORS,
  LEAGUE_FALLBACK_COLORS,
  LEAGUE_ORDER,
  getLeagueColors,
  isLeagueKey,
  type LeagueColors,
} from './league-colors';
export {
  ISTANBUL_TZ,
  nextIstanbulMidnight,
  nextIstanbulWeekStart,
  istanbulOffsetMinutes,
  splitDuration,
  type CountdownParts,
} from './istanbul-time';
export { TOUCH_TARGET, FOCUS_RING, type PlaySize, type PlayLocale } from './shared';

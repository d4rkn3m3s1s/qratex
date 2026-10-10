/**
 * QDL durum ve sayfa bileşenleri. Canlı örnekler: /admin/design-language
 *
 *   import { QueryState, PageHeader, SectionCard, StatTile, ConfirmAction } from '@/components/states';
 */
export { QueryState, type QueryStateProps } from './query-state';
export { EmptyState, type EmptyStateProps, type EmptyVariant } from './empty-state';
export { ErrorState, type ErrorStateProps } from './error-state';
export { InlineError, type InlineErrorProps } from './inline-error';
export { PageHeader, type PageHeaderProps } from './page-header';
export { SectionCard, type SectionCardProps } from './section-card';
export { StatTile, type StatTileProps, type StatDelta } from './stat-tile';
export { ConfirmAction, type ConfirmActionProps, type ImpactItem, type ImpactPreview } from './confirm-action';
export {
  SkeletonList,
  SkeletonCards,
  SkeletonStats,
  SkeletonTable,
  SkeletonDetail,
  SkeletonForm,
  SkeletonBlock,
  SkeletonForPreset,
  type SkeletonPreset,
} from './skeletons';
export { classifyError, resolveQueryView, defaultIsEmpty, type ErrorKind, type QueryView, type QueryLike } from './query-state-logic';
export { matchesConfirmPhrase, normalizeConfirmPhrase } from './confirm-phrase';
export { useStateCopy, getStateCopy, type StateCopy } from './copy';
export { TONE_CHIP, TONE_TEXT, TONE_STRIPE, TONE_CALLOUT, type Tone } from './tone';

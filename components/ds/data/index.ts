/**
 * QDL veri katmanı — `components/ds/data`. Kılavuz: ./README.md
 *
 *   import { MetricTile, DataTable, DetailSheet, StatusBadge } from '@/components/ds/data';
 *
 * Not: recharts bu barrel'dan YÜKLENMEZ — grafikler `lazyChart(() => import(…))` ile.
 */
export { MetricTile, MetricGrid, type MetricTileProps, type MetricGridProps } from './metric-tile';
export { AnimatedNumber, type AnimatedNumberProps } from './animated-number';
export { DeltaBadge, type DeltaBadgeProps } from './delta-badge';
export { Sparkline, type SparklineProps } from './sparkline';
export { sparklineGeometry, type SparklineGeometry, type SparklineOptions } from './sparkline-geometry';
export {
  formatMetricValue,
  formatDuration,
  formatDelta,
  deltaDirection,
  deltaSentiment,
  isLowSample,
  toSeconds,
  type MetricValue,
  type MetricDelta,
  type MetricFormat,
  type DeltaKind,
  type GoodDirection,
  type DeltaDirection,
  type DeltaSentiment,
  type DurationUnit,
} from './metric-format';
export {
  DataTable,
  getColumnMeta,
  getColumnLabel,
  SELECT_COLUMN_ID,
  type DataTableProps,
  type DataTableColumnMeta,
  type BulkActionContext,
} from './data-table';
export { DataTablePagination, type DataTablePaginationProps } from './data-table-pagination';
export { SelectionCheckbox, type SelectionCheckboxProps } from './selection-checkbox';
export { useUrlTableState, DEFAULT_PAGE_SIZES, type UseUrlTableStateOptions, type UrlTableState } from './use-url-table-state';
export { parseSort, serializeSort, parsePage, parsePageSize, pageCountFor, pageRange, type SortItem } from './table-url';
export { DetailSheet, useDetailSheet, type DetailSheetProps, type DetailSheetApi } from './detail-sheet';
export {
  StatusBadge,
  SeverityBadge,
  defineStatusMap,
  statusBadgeProps,
  TONE_ICON,
  type StatusBadgeProps,
  type SeverityBadgeProps,
  type StatusDefinition,
  type StatusMap,
} from './status-badge';
export { SEVERITY_ORDER, SEVERITY_TONE, severityRank, toSeverity, type Severity } from './status-meta';
export { KeyValueList, type KeyValueListProps, type KeyValueItem } from './key-value-list';
export { Timeline, type TimelineProps, type TimelineEvent } from './timeline';
export { ChartFrame, ChartDataTable, lazyChart, type ChartFrameProps, type ChartColumn, type ChartDataTableProps } from './chart-frame';
export { CHART_THEME, chartSeriesColor, chartToneColor, chartSequentialColor, chartDivergingColor, chartTooltipProps } from './chart-theme';
export { useDataCopy, type DataCopy } from './copy';

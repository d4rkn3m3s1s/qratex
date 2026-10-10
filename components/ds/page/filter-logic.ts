/**
 * FilterBar alan tanımları ve URL ↔ değer dönüşümü — saf (Jest ile test edilir).
 */
import {
  parseDateRange,
  serializeDateRange,
  DEFAULT_DATE_RANGE_KEYS,
  type CompareMode,
  type DateRangePreset,
  type DateRangeUrlKeys,
  type DateRangeValue,
} from './date-range';
import { readList, type UrlPatch } from './url-params';

export type FilterOption = { value: string; label: string; disabled?: boolean };

export type SearchFilterField = {
  type: 'search';
  /** URL anahtarı (ör. `q`). */
  key: string;
  label: string;
  placeholder?: string;
  /** Yazma bitince URL'ye yazma gecikmesi (ms). Varsayılan 300. */
  debounceMs?: number;
  /** Bu uzunluğun altındaki arama URL'ye yazılmaz (boş hariç). */
  minLength?: number;
};

export type SelectFilterField = {
  type: 'select';
  key: string;
  label: string;
  options: readonly FilterOption[];
  /** Tekli seçimde "tümü" seçeneğinin etiketi; `null` → tümü seçeneği yok. */
  allLabel?: string | null;
  /** Varsayılan değer (URL'ye yazılmaz). */
  defaultValue?: string;
  /** Çoklu seçim (`status=a,b`). */
  multiple?: boolean;
};

export type DateRangeFilterField = {
  type: 'dateRange';
  /** Alan kimliği (React anahtarı); URL anahtarları `keys` ile. */
  key: string;
  label: string;
  keys?: Partial<DateRangeUrlKeys>;
  presets?: readonly Exclude<DateRangePreset, 'custom'>[];
  defaultPreset?: Exclude<DateRangePreset, 'custom'>;
  defaultCompare?: CompareMode;
  /** Karşılaştırma seçimi gösterilsin mi? Varsayılan true. */
  allowCompare?: boolean;
  /** Özel aralık girişi. Varsayılan true. */
  allowCustom?: boolean;
  /** Özel aralıkta en uzun süre (gün). */
  maxDays?: number;
};

export type FilterField = SearchFilterField | SelectFilterField | DateRangeFilterField;

export type FilterValue = string | string[] | DateRangeValue;
export type FilterValues = Record<string, FilterValue>;

type ParamsLike = { get(key: string): string | null };

export function dateRangeKeys(field: DateRangeFilterField): DateRangeUrlKeys {
  return { ...DEFAULT_DATE_RANGE_KEYS, ...field.keys };
}

/** Alanın kullandığı tüm URL anahtarları (temizleme için). */
export function fieldUrlKeys(field: FilterField): string[] {
  if (field.type === 'dateRange') {
    const k = dateRangeKeys(field);
    return [k.period, k.from, k.to, k.compare];
  }
  return [field.key];
}

export function parseFilterValue(field: FilterField, params: ParamsLike, today?: string): FilterValue {
  switch (field.type) {
    case 'search':
      return params.get(field.key) ?? '';
    case 'select': {
      const allowed = new Set(field.options.map((o) => o.value));
      if (field.multiple) return readList(params.get(field.key)).filter((v) => allowed.has(v));
      const raw = params.get(field.key);
      return raw && allowed.has(raw) ? raw : field.defaultValue ?? '';
    }
    case 'dateRange':
      return parseDateRange(params, {
        keys: field.keys,
        defaultPreset: field.defaultPreset,
        defaultCompare: field.defaultCompare,
        maxDays: field.maxDays,
        today,
      });
  }
}

/** Tüm alanları URL'den okur. Geçersiz değerler sessizce varsayılana düşer. */
export function parseFilters(fields: readonly FilterField[], params: ParamsLike, today?: string): FilterValues {
  const out: FilterValues = {};
  for (const f of fields) out[f.key] = parseFilterValue(f, params, today);
  return out;
}

/** Alan değerini URL patch'ine çevirir. */
export function serializeFilterValue(field: FilterField, value: FilterValue): UrlPatch {
  switch (field.type) {
    case 'search': {
      const v = typeof value === 'string' ? value.trim() : '';
      if (v && field.minLength && v.length < field.minLength) return { [field.key]: null };
      return { [field.key]: v || null };
    }
    case 'select':
      if (field.multiple) return { [field.key]: Array.isArray(value) && value.length ? value : null };
      return { [field.key]: typeof value === 'string' && value !== (field.defaultValue ?? '') ? value : null };
    case 'dateRange':
      return serializeDateRange(value as DateRangeValue, {
        keys: field.keys,
        defaultPreset: field.defaultPreset,
        defaultCompare: field.defaultCompare,
      });
  }
}

/** Varsayılandan farklı (etkin) alan sayısı. */
export function countActiveFilters(fields: readonly FilterField[], values: FilterValues): number {
  let n = 0;
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === 'search' && typeof v === 'string' && v.trim()) n++;
    else if (f.type === 'select') {
      if (f.multiple ? Array.isArray(v) && v.length > 0 : typeof v === 'string' && v !== '' && v !== (f.defaultValue ?? '')) n++;
    } else if (f.type === 'dateRange' && v && typeof v === 'object' && !Array.isArray(v)) {
      const d = v as DateRangeValue;
      if (d.preset !== (f.defaultPreset ?? 'last30') || d.compare !== (f.defaultCompare ?? 'none')) n++;
    }
  }
  return n;
}

/** Tüm filtre anahtarlarını silen patch. */
export function clearFiltersPatch(fields: readonly FilterField[]): UrlPatch {
  const patch: UrlPatch = {};
  for (const f of fields) for (const k of fieldUrlKeys(f)) patch[k] = null;
  return patch;
}

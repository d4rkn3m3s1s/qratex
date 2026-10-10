/**
 * Ürün kataloğu — CSV ayrıştırma ve üretme. Saf (Jest ile test edilir).
 *
 * İçe aktarma Excel'in Türkçe çıktısını (noktalı virgül ayraç, UTF-8 BOM, `"` kaçışlı alan,
 * satır içi yeni satır) ve virgüllü/sekmeli standart CSV'yi kabul eder. Dışa aktarma aynı
 * sütunları üretir (gidiş-dönüş), formül enjeksiyonuna karşı `= + - @` ile başlayan hücreler
 * kaçışlanır.
 */
import { normalizeForSearch } from './text';

export const CSV_MAX_BYTES = 512 * 1024;
export const IMPORT_MAX_ROWS = 500;

export type CsvDelimiter = ',' | ';' | '\t';

/** İlk satırdaki (tırnak dışı) ayraç sayısına göre ayraç tahmini; eşitlikte `;` (Türkçe Excel). */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) counts[ch] += 1;
  }
  if (counts['\t'] > counts[';'] && counts['\t'] > counts[',']) return '\t';
  if (counts[','] > counts[';']) return ',';
  return ';';
}

/** RFC 4180 uyumlu ayrıştırma. Tamamen boş satırlar atlanır. */
export function parseCsv(input: string, delimiter?: CsvDelimiter): string[][] {
  const text = input.replace(/^﻿/, '');
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushRow = () => {
    row.push(field);
    field = '';
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      pushRow();
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

export type ImportColumn = 'name' | 'category' | 'price' | 'description';

const HEADER_ALIASES: Record<ImportColumn, readonly string[]> = {
  name: ['ad', 'adi', 'urun', 'urun adi', 'urunadi', 'isim', 'name', 'product', 'product name'],
  category: ['kategori', 'kategori adi', 'category', 'category name'],
  price: ['fiyat', 'fiyat (tl)', 'fiyat tl', 'fiyat (₺)', 'tutar', 'price', 'price (try)'],
  description: ['aciklama', 'description', 'detay', 'not'],
};

export type HeaderMap = Partial<Record<ImportColumn, number>>;

/** Başlık satırını sütunlara eşler (Türkçe/İngilizce, büyük/küçük ve aksan duyarsız). */
export function mapHeader(header: readonly string[]): HeaderMap {
  const out: HeaderMap = {};
  header.forEach((raw, idx) => {
    const h = normalizeForSearch(raw);
    for (const col of Object.keys(HEADER_ALIASES) as ImportColumn[]) {
      if (out[col] === undefined && HEADER_ALIASES[col].includes(h)) out[col] = idx;
    }
  });
  return out;
}

/** Dışa aktarma ve şablon başlığı (içe aktarma bunu birebir tanır). */
export const EXPORT_HEADER = ['Ürün adı', 'Kategori', 'Fiyat', 'Açıklama'] as const;

/** Tek hücreyi CSV için kaçışlar (formül enjeksiyonu dahil). */
export function csvCell(value: string | number | null | undefined, delimiter: CsvDelimiter = ';'): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes('"') || s.includes(delimiter) || s.includes('\n') || s.includes('\r')) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Satırları CSV'ye çevirir. Excel'in Türkçe ayarlarıyla açılması için BOM + `;` + CRLF. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>, delimiter: CsvDelimiter = ';'): string {
  return `﻿${rows.map((r) => r.map((c) => csvCell(c, delimiter)).join(delimiter)).join('\r\n')}\r\n`;
}

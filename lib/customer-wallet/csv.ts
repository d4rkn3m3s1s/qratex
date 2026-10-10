/**
 * CSV üretimi — formül enjeksiyonuna kapalı (OWASP "CSV Injection"; spending-overview B3).
 * `=`, `+`, `-`, `@`, sekme ve CR ile başlayan METİN hücrelerinin başına `'` eklenir;
 * sayılar ham yazılır. Excel'in UTF-8 algılaması için BOM eklenir. Saf modül.
 */

export type CsvCell = string | number | null | undefined;

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: CsvCell, separator: ',' | ';' = ','): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const text = String(value);
    return separator === ';' ? text.replace('.', ',') : text;
  }
  let text = String(value);
  if (DANGEROUS_PREFIX.test(text)) text = `'${text}`;
  const needsQuote = text.includes('"') || text.includes(separator) || /[\r\n]/.test(text) || text.startsWith("'");
  const escaped = text.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

/**
 * Türkçe Excel ondalık virgül kullanır → ayırıcı `;`, ondalık `,`.
 * İngilizce: ayırıcı `,`, ondalık `.`.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<CsvCell>>, locale: 'tr' | 'en' = 'tr'): string {
  const sep = locale === 'tr' ? ';' : ',';
  const body = rows.map((row) => row.map((cell) => escapeCsvCell(cell, sep)).join(sep)).join('\r\n');
  return `﻿${body}\r\n`;
}

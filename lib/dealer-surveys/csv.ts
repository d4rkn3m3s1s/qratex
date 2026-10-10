/**
 * Anket yanıtlarının metne dökülmesi + CSV üretimi (saf; Jest ile test edilir).
 *
 *  - Formül enjeksiyonu: `= + - @ \t \r` ile başlayan hücreler `'` önekiyle kaçışlanır
 *    (müşteri metni bayinin Excel'inde formül olarak çalışmasın).
 *  - TR'de `;` ayırıcı (Excel TR varsayılanı), EN'de `,`; UTF-8 BOM ile Türkçe karakterler korunur.
 *  - Tarih/saat Europe/Istanbul.
 */
import { isChoiceType, normalizeStoredOptions } from '@/lib/survey-schema';
import { ratingValue } from './aggregate';

export type CsvLang = 'tr' | 'en';
export type ExportQuestion = { id: string; type: string; text: string; options: unknown };

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown, sep: string): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? String(value) : String(value);
  if (typeof value !== 'number' && FORMULA_START.test(s)) s = `'${s}`;
  if (s.includes('"') || s.includes(sep) || s.includes('\n') || s.includes('\r')) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvLine(cells: unknown[], lang: CsvLang): string {
  const sep = lang === 'tr' ? ';' : ',';
  return cells.map((c) => csvCell(c, sep)).join(sep);
}

export const CSV_BOM = '﻿';

/**
 * Tek cevabı okunur metne çevirir — CSV ve "Yanıtlar" sekmesi ortak kullanır.
 * Ankette tanımlı olmayan seçenekler / aralık dışı puanlar boş döner (sonuçlarla tutarlı).
 */
export function answerToText(q: ExportQuestion, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (isChoiceType(q.type)) {
    const allowed = new Set(normalizeStoredOptions(q.options));
    const picked =
      typeof value === 'string'
        ? [value]
        : Array.isArray(value) && q.type === 'multiple_choice'
          ? value.filter((v): v is string => typeof v === 'string')
          : [];
    return [...new Set(picked.filter((p) => allowed.has(p)))].join(' | ');
  }
  if (q.type === 'rating') {
    const r = ratingValue(value);
    return r == null ? '' : String(r);
  }
  return typeof value === 'string' ? value.trim() : '';
}

/** Kayıtlı `answers` JSON'unu (savunmacı) `questionId → value` haritasına çevirir. */
export function answersMap(raw: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!Array.isArray(raw)) return map;
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const qid = (a as { questionId?: unknown }).questionId;
    if (typeof qid !== 'string' || map.has(qid)) continue;
    map.set(qid, (a as { value?: unknown }).value);
  }
  return map;
}

const HEADER = {
  tr: { no: 'Yanıt', date: 'Tarih', time: 'Saat', who: 'Yanıtlayan', member: 'Üye', anon: 'Anonim', q: 'S' },
  en: { no: 'Response', date: 'Date', time: 'Time', who: 'Respondent', member: 'Member', anon: 'Anonymous', q: 'Q' },
} as const;

export function surveyCsvHeader(questions: ExportQuestion[], lang: CsvLang): string {
  const h = HEADER[lang];
  return csvLine([h.no, h.date, h.time, h.who, ...questions.map((q, i) => `${h.q}${i + 1}. ${q.text}`)], lang);
}

export type ExportRow = { id: string; createdAt: Date; userId: string | null; answers: unknown };

export function surveyCsvRow(row: ExportRow, index: number, questions: ExportQuestion[], lang: CsvLang): string {
  const h = HEADER[lang];
  const tag = lang === 'en' ? 'en-GB' : 'tr-TR';
  const date = new Intl.DateTimeFormat(tag, { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(row.createdAt);
  const time = new Intl.DateTimeFormat(tag, { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(row.createdAt);
  const map = answersMap(row.answers);
  return csvLine([index, date, time, row.userId ? h.member : h.anon, ...questions.map((q) => answerToText(q, map.get(q.id)))], lang);
}

/** Dosya adı için güvenli kısa ad (ASCII, tire). */
export function exportFileSlug(title: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
  const ascii = title
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
    .replace(/^-|-$/g, '');
  return ascii || 'anket';
}

/**
 * Otomatik yanıt kuralları — saf sözleşme (istemci + sunucu + motor ortak).
 *
 * Kapanan denetim bulguları (docs/audit/2026-10-08/bayi/dealer_settings_auto-replies.md):
 *  - B1: koşul ayrık birleşimdir (discriminated union). "Metin ≤ 2" ya da "Duygu ≤ 2" gibi
 *        motorun hiç eşleştiremeyeceği kombinasyonlar şemadan geçemez; eski bozuk kayıtlar
 *        `parseStoredCondition` ile `null` döner ve arayüzde "tetiklenemez" uyarısı alır.
 *  - B7: anahtar kelime eşleşmesi Türkçe büyük/küçük harf + aksan katlamalıdır
 *        ("İADE" ↔ "iade", "IŞIK" ↔ "ışık"); çoklu anahtar kelime ve tam kelime seçeneği.
 *  - B15: okumada koşul doğrulanır (`as any[]` yok).
 *  - Eksik özellik 4: şablon değişkenleri `{{musteri}}`, `{{isletme}}`, `{{puan}}`.
 */
import { z } from 'zod';

export const MAX_REPLY_RULES = 20;
export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];
export const RATING_OPS = ['lte', 'gte', 'eq'] as const;
export type RatingOp = (typeof RATING_OPS)[number];
export const REPLY_ACTIONS = ['reply', 'incident'] as const;
export type ReplyAction = (typeof REPLY_ACTIONS)[number];
export const MAX_KEYWORDS = 10;

const keyword = z
  .string()
  .trim()
  .min(2, 'Anahtar kelime en az 2 karakter olmalı.')
  .max(40, 'Anahtar kelime en fazla 40 karakter olabilir.');

export const replyConditionSchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('rating'),
    op: z.enum(RATING_OPS, { errorMap: () => ({ message: 'Karşılaştırma seçin.' }) }),
    value: z
      .number({ invalid_type_error: 'Puan seçin.' })
      .int('Puan tam sayı olmalı.')
      .min(1, 'Puan 1 ile 5 arasında olmalı.')
      .max(5, 'Puan 1 ile 5 arasında olmalı.'),
  }),
  z.object({
    field: z.literal('sentiment'),
    op: z.literal('eq'),
    value: z.enum(SENTIMENTS, { errorMap: () => ({ message: 'Duygu seçin.' }) }),
  }),
  z.object({
    field: z.literal('text'),
    op: z.literal('contains'),
    keywords: z
      .array(keyword)
      .min(1, 'En az bir anahtar kelime girin.')
      .max(MAX_KEYWORDS, `En fazla ${MAX_KEYWORDS} anahtar kelime girilebilir.`),
    wholeWord: z.boolean().default(false),
  }),
]);

export type ReplyCondition = z.infer<typeof replyConditionSchema>;

export const replyRuleBodySchema = z
  .object({
    name: z.string().trim().min(2, 'Kural adı en az 2 karakter olmalı.').max(80, 'Kural adı en fazla 80 karakter olabilir.'),
    condition: replyConditionSchema,
    action: z.enum(REPLY_ACTIONS, { errorMap: () => ({ message: 'Eylem seçin.' }) }),
    template: z.string().trim().max(1000, 'Metin en fazla 1000 karakter olabilir.').default(''),
    tone: z.string().trim().min(1).max(40).nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.action === 'reply' && v.template.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['template'],
        message: v.tone
          ? 'Yedek metin en az 5 karakter olmalı (AI yanıtı üretilemezse bu gönderilir).'
          : 'Yanıt metni en az 5 karakter olmalı.',
      });
    }
  });

export type ReplyRuleBody = z.infer<typeof replyRuleBodySchema>;
export type ReplyRuleInput = z.input<typeof replyRuleBodySchema>;

export const replyRuleStateSchema = z.object({ isActive: z.boolean() });
export const replyReorderSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(MAX_REPLY_RULES * 3),
});
export const replyPreviewSchema = z.object({ condition: replyConditionSchema });

/* ───────────────────────── Saklanan koşul (eski kayıtlarla uyumlu) ───────────────────────── */

/** Veritabanına yazılan biçim: eski okuyucular için `value` da doldurulur. */
export function toStoredCondition(c: ReplyCondition): Record<string, unknown> {
  if (c.field === 'text') {
    const keywords = dedupeKeywords(c.keywords);
    return { field: 'text', op: 'contains', value: keywords.join(', '), keywords, wholeWord: c.wholeWord === true };
  }
  return { ...c };
}

export function dedupeKeywords(list: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const k = raw.trim().replace(/\s+/g, ' ');
    const f = foldForMatch(k);
    if (!k || !f || seen.has(f)) continue;
    seen.add(f);
    out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/**
 * Saklanan (Json) koşulu doğrular. Motorun eşleştiremeyeceği her kombinasyon `null` döner —
 * böyle bir kural "tetiklenemez" olarak işaretlenir ve motor onu ATLAR (sessiz ölü kural yok).
 */
export function parseStoredCondition(raw: unknown): ReplyCondition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.field === 'rating') {
    if (!(RATING_OPS as readonly unknown[]).includes(o.op)) return null;
    const n = typeof o.value === 'number' ? o.value : typeof o.value === 'string' && /^\s*\d\s*$/.test(o.value) ? Number(o.value) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 5) return null;
    return { field: 'rating', op: o.op as RatingOp, value: n };
  }
  if (o.field === 'sentiment') {
    if (o.op !== 'eq') return null;
    const v = typeof o.value === 'string' ? o.value.trim().toLowerCase() : '';
    if (!(SENTIMENTS as readonly string[]).includes(v)) return null;
    return { field: 'sentiment', op: 'eq', value: v as Sentiment };
  }
  if (o.field === 'text') {
    if (o.op !== 'contains') return null;
    const list = Array.isArray(o.keywords)
      ? o.keywords.filter((k): k is string => typeof k === 'string')
      : typeof o.value === 'string'
        ? o.value.split(',')
        : typeof o.value === 'number'
          ? [String(o.value)]
          : [];
    const keywords = dedupeKeywords(list.filter((k) => k.trim().length > 0));
    if (keywords.length === 0) return null;
    return { field: 'text', op: 'contains', keywords, wholeWord: o.wholeWord === true };
  }
  return null;
}

/* ───────────────────────── Eşleştirme ───────────────────────── */

/** Türkçe küçük harf + aksan katlama: "İADE" → "iade", "IŞIK" → "isik", "kötü" → "kotu". */
export function foldForMatch(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return foldForMatch(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export interface MatchableFeedback {
  rating: number | null;
  sentiment: string | null;
  text: string | null;
}

/** Hangi anahtar kelime(ler) eşleşti — önizleme vurgusu için. */
export function matchedKeywords(c: Extract<ReplyCondition, { field: 'text' }>, text: string | null): string[] {
  if (!text) return [];
  const hits: string[] = [];
  if (c.wholeWord) {
    const hay = ` ${tokens(text).join(' ')} `;
    for (const k of c.keywords) {
      const kt = tokens(k);
      if (kt.length > 0 && hay.includes(` ${kt.join(' ')} `)) hits.push(k);
    }
  } else {
    const hay = foldForMatch(text);
    for (const k of c.keywords) {
      const f = foldForMatch(k);
      if (f && hay.includes(f)) hits.push(k);
    }
  }
  return hits;
}

/** Saf eşleştirici: motor, önizleme ve Gelen Kutusu ipucu AYNI fonksiyonu kullanır. */
export function matchReplyCondition(c: ReplyCondition | null, fb: MatchableFeedback): boolean {
  if (!c) return false;
  if (c.field === 'rating') {
    if (fb.rating == null || !Number.isFinite(fb.rating)) return false;
    if (c.op === 'lte') return fb.rating <= c.value;
    if (c.op === 'gte') return fb.rating >= c.value;
    return fb.rating === c.value;
  }
  if (c.field === 'sentiment') {
    return !!fb.sentiment && fb.sentiment.toLowerCase() === c.value;
  }
  return matchedKeywords(c, fb.text).length > 0;
}

/* ───────────────────────── Metin ───────────────────────── */

export const SENTIMENT_LABEL: Readonly<Record<Sentiment, string>> = {
  positive: 'olumlu',
  neutral: 'nötr',
  negative: 'olumsuz',
};

/** Kuralın okunur cümlesi: "Puan 2 veya altındaysa". */
export function describeCondition(c: ReplyCondition | null): string {
  if (!c) return 'Geçersiz koşul';
  if (c.field === 'rating') {
    if (c.op === 'lte') return c.value === 1 ? 'Puan 1 ise' : `Puan ${c.value} veya altındaysa`;
    if (c.op === 'gte') return c.value === 5 ? 'Puan 5 ise' : `Puan ${c.value} veya üstündeyse`;
    return `Puan tam ${c.value} ise`;
  }
  if (c.field === 'sentiment') return `Yorumun duygusu ${SENTIMENT_LABEL[c.value]} ise`;
  const list = c.keywords.map((k) => `“${k}”`).join(', ');
  return c.keywords.length === 1
    ? `Yorumda ${list} geçiyorsa${c.wholeWord ? ' (tam kelime)' : ''}`
    : `Yorumda şunlardan biri geçiyorsa: ${list}${c.wholeWord ? ' (tam kelime)' : ''}`;
}

export const TEMPLATE_VARIABLES = [
  { key: 'musteri', label: 'Müşteri adı', example: 'Ayşe' },
  { key: 'isletme', label: 'İşletme adı', example: 'Kahve Durağı' },
  { key: 'puan', label: 'Verilen puan', example: '2' },
] as const;
export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]['key'];

/** `{{musteri}}`, `{{isletme}}`, `{{puan}}` değişkenlerini doldurur; bilinmeyen değişken olduğu gibi kalır. */
export function renderReplyTemplate(
  template: string,
  vars: { musteri?: string | null; isletme?: string | null; puan?: number | null }
): string {
  return template
    .replace(/\{\{\s*(musteri|isletme|puan)\s*\}\}/gi, (_m, key: string) => {
      const k = key.toLowerCase();
      if (k === 'musteri') return firstName(vars.musteri) || 'değerli misafirimiz';
      if (k === 'isletme') return (vars.isletme ?? '').trim() || 'işletmemiz';
      return vars.puan != null ? String(vars.puan) : '—';
    })
    .trim();
}

function firstName(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return '';
  return n.split(/\s+/)[0] ?? '';
}

/** Şablonda tanınmayan `{{...}}` değişkenleri (editör uyarısı). */
export function unknownTemplateVariables(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)) {
    const k = (m[1] ?? '').toLowerCase();
    if (!['musteri', 'isletme', 'puan'].includes(k)) out.add(m[1] ?? '');
  }
  return [...out];
}

/** Editörün varsayılanı — alan değişince operatör ve değer bu alanın varsayılanına döner (B1). */
export function defaultConditionFor(field: ReplyCondition['field']): ReplyCondition {
  if (field === 'rating') return { field: 'rating', op: 'lte', value: 2 };
  if (field === 'sentiment') return { field: 'sentiment', op: 'eq', value: 'negative' };
  return { field: 'text', op: 'contains', keywords: [], wholeWord: false };
}

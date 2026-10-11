/**
 * İçerik sayfaları (CMS) sözleşmesi — SAF; istemci, sunucu, public render ve test ortak.
 *
 * Yayın hattı: `Page.isPublished = true` kayıtlar `/sayfa/<slug>` adresinde (app/(okuma)/sayfa)
 * render edilir ve sitemap'e girer. İçerik sürümlü biçimde saklanır:
 *   content = { v: 1, format: 'markdown', body }   meta = { seoTitle?, description?, noindex? }
 * Eski kayıtlar (`content` düz metin ya da `{ body }`) okunurken v1'e yükseltilir.
 */
import { z } from 'zod';

export const CMS_PUBLIC_PREFIX = '/sayfa';
export const CMS_CACHE_TAG = 'cms-pages';
export const cmsPageTag = (slug: string) => `cms-page:${slug}`;
export const cmsPublicPath = (slug: string) => `${CMS_PUBLIC_PREFIX}/${slug}`;

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Kayıt anında slug son hâli: baş/son `-` kırpılır. */
export const finalizeSlug = (s: string) => s.trim().replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');

const slugField = z
  .string()
  .transform(finalizeSlug)
  .pipe(
    z
      .string()
      .min(2, 'Adres en az 2 karakter olmalı')
      .max(120, 'Adres en fazla 120 karakter')
      .regex(SLUG_RE, 'Yalnız küçük harf, rakam ve tire kullanın (ör. hakkimizda)')
  );

export const cmsMetaSchema = z
  .object({
    seoTitle: z.string().trim().max(70, 'En fazla 70 karakter').optional(),
    description: z.string().trim().max(170, 'En fazla 170 karakter').optional(),
    noindex: z.boolean().optional(),
  })
  .strict();
export type CmsMeta = z.infer<typeof cmsMetaSchema>;

/** Form değerleri (istemci + sunucu aynı şema). */
export const cmsPageFormSchema = z
  .object({
    title: z.string().trim().min(2, 'Başlık en az 2 karakter olmalı').max(180, 'Başlık en fazla 180 karakter'),
    slug: slugField,
    body: z.string().max(100_000, 'İçerik en fazla 100.000 karakter'),
    seoTitle: z.string().trim().max(70, 'En fazla 70 karakter'),
    description: z.string().trim().max(170, 'En fazla 170 karakter'),
    noindex: z.boolean(),
    isPublished: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.isPublished && v.body.trim().length < 20) {
      ctx.addIssue({ code: 'custom', path: ['body'], message: 'Yayındaki bir sayfanın içeriği en az 20 karakter olmalı' });
    }
  });
export type CmsPageForm = z.input<typeof cmsPageFormSchema>;
export type CmsPageFormParsed = z.output<typeof cmsPageFormSchema>;

export const cmsCreateSchema = cmsPageFormSchema;
export const cmsUpdateSchema = z
  .object({ expectedUpdatedAt: z.string().datetime() })
  .and(cmsPageFormSchema);
export const cmsPublishSchema = z.object({ expectedUpdatedAt: z.string().datetime(), isPublished: z.boolean() }).strict();
export const cmsDeleteSchema = z.object({ expectedUpdatedAt: z.string().datetime() }).strict();

export const cmsListQuerySchema = z.object({
  status: z.enum(['all', 'published', 'draft']).default('all'),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(20),
  sort: z.enum(['updated', 'title']).default('updated'),
});
export type CmsListQuery = z.infer<typeof cmsListQuerySchema>;

// ───────────────────────────── Tipler ─────────────────────────────

export interface CmsPageSummary {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  noindex: boolean;
  excerpt: string;
  length: number;
  createdAt: string;
  updatedAt: string;
  lastEditor: string | null;
}

export interface CmsPageList {
  items: CmsPageSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; published: number; draft: number };
}

export interface CmsPageDetail {
  id: string;
  slug: string;
  title: string;
  body: string;
  meta: CmsMeta;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  /** Eski biçimden (düz metin/`{body}`) okunup v1'e yükseltildiyse true — ilk kayıtta kalıcı olur. */
  legacyFormat: boolean;
}

export interface CmsHistoryEntry {
  id: string;
  action: string;
  actionLabel: string;
  createdAt: string;
  actor: string | null;
  changed: string[];
  /** Bu kayıtla oluşan sürüm (editöre yüklenebilir). Eski kayıtlarda olmayabilir. */
  version: { title: string; slug: string; body: string } | null;
}

// ───────────────────────────── İçerik dönüşümü ─────────────────────────────

/** DB'deki `content` alanını v1 gövdeye indirger. */
export function readContent(raw: unknown): { body: string; legacy: boolean } {
  if (typeof raw === 'string') return { body: raw, legacy: true };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.v === 1 && typeof o.body === 'string') return { body: o.body, legacy: false };
    if (typeof o.body === 'string') return { body: o.body, legacy: true };
  }
  return { body: '', legacy: raw != null };
}

export const writeContent = (body: string) => ({ v: 1 as const, format: 'markdown' as const, body });

export function readMeta(raw: unknown): CmsMeta {
  const r = cmsMetaSchema.safeParse(raw && typeof raw === 'object' ? raw : {});
  if (r.success) return r.data;
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    seoTitle: typeof o.seoTitle === 'string' ? o.seoTitle.slice(0, 70) : undefined,
    description: typeof o.description === 'string' ? o.description.slice(0, 170) : undefined,
    noindex: o.noindex === true,
  };
}

export function writeMeta(v: { seoTitle: string; description: string; noindex: boolean }): CmsMeta {
  return {
    ...(v.seoTitle ? { seoTitle: v.seoTitle } : {}),
    ...(v.description ? { description: v.description } : {}),
    ...(v.noindex ? { noindex: true } : {}),
  };
}

// ───────────────────────────── Markdown alt kümesi ─────────────────────────────

export type CmsInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; v: string }
  | { t: 'em'; v: string }
  | { t: 'link'; v: string; href: string };

export type CmsBlock =
  | { t: 'h'; level: 2 | 3; text: string; id: string }
  | { t: 'p'; inl: CmsInline[] }
  | { t: 'ul' | 'ol'; items: CmsInline[][] }
  | { t: 'quote'; inl: CmsInline[] }
  | { t: 'hr' };

/** Yalnız güvenli bağlantılar: http(s), mailto, tel, site içi "/" ve "#". */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\/[^\s]+$/i.test(h) || /^mailto:[^\s]+$/i.test(h) || /^tel:[+\d\s()-]+$/i.test(h)) return h;
  if (/^\/(?!\/)[^\s]*$/.test(h) || /^#[\w-]+$/.test(h)) return h;
  return null;
}

export function parseInline(src: string): CmsInline[] {
  const out: CmsInline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[1] != null) out.push({ t: 'strong', v: m[1] });
    else if (m[2] != null) out.push({ t: 'em', v: m[2] });
    else {
      const href = safeHref(m[4]);
      out.push(href ? { t: 'link', v: m[3], href } : { t: 'text', v: m[3] });
    }
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

function headingId(text: string, used: Map<string, number>): string {
  const base =
    text
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'bolum';
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n ? `${base}-${n + 1}` : base;
}

/**
 * Markdown alt kümesi → blok listesi. HTML ÜRETMEZ (React ile render edilir, enjeksiyon yok).
 * Destek: `## `/`### ` başlık, paragraf, `- `/`* ` ve `1. ` liste, `> ` alıntı, `---`,
 * satır içi **kalın**, *italik*, [bağlantı](https://…).
 */
export function parseCmsMarkdown(body: string): CmsBlock[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks: CmsBlock[] = [];
  const used = new Map<string, number>();
  let para: string[] = [];
  let list: { t: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', inl: parseInline(para.join(' ')) });
    if (list) blocks.push({ t: list.t, items: list.items.map(parseInline) });
    if (quote.length) blocks.push({ t: 'quote', inl: parseInline(quote.join(' ')) });
    para = [];
    list = null;
    quote = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    let mm: RegExpMatchArray | null;
    if ((mm = t.match(/^(#{1,3})\s+(.+)$/))) {
      flush();
      const text = mm[2].trim();
      blocks.push({ t: 'h', level: mm[1].length <= 2 ? 2 : 3, text, id: headingId(text, used) });
    } else if (/^(-{3,}|\*{3,})$/.test(t)) {
      flush();
      blocks.push({ t: 'hr' });
    } else if ((mm = t.match(/^[-*]\s+(.+)$/)) || (mm = t.match(/^\d+[.)]\s+(.+)$/))) {
      const kind: 'ul' | 'ol' = /^\d/.test(t) ? 'ol' : 'ul';
      if (para.length || quote.length || (list && list.t !== kind)) flush();
      if (!list) list = { t: kind, items: [] };
      list.items.push(mm[1]);
    } else if ((mm = t.match(/^>\s?(.*)$/))) {
      if (para.length || list) flush();
      quote.push(mm[1]);
    } else {
      if (list || quote.length) flush();
      para.push(t);
    }
  }
  flush();
  return blocks;
}

/** Düz metin özeti (liste kartı, meta açıklama varsayılanı). */
export function plainExcerpt(body: string, max = 160): string {
  const text = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^#{1,3}\s+|^[-*]\s+|^\d+[.)]\s+|^>\s?/, '').trim())
    .filter((l) => l && !/^(-{3,}|\*{3,})$/.test(l))
    .join(' ')
    .replace(/\*\*([^*]+)\*\*|\*([^*]+)\*/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_PAGE: 'Oluşturuldu',
  UPDATE_PAGE: 'Düzenlendi',
  PUBLISH_PAGE: 'Yayına alındı',
  UNPUBLISH_PAGE: 'Yayından kaldırıldı',
  DELETE_PAGE: 'Silindi',
};
export const cmsActionLabel = (a: string) => ACTION_LABELS[a] ?? a;

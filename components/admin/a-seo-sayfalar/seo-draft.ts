import {
  parseSeoPayload,
  type SeoGlobal,
  type SeoPayload,
  type SeoRoutePath,
} from '@/lib/admin-seo/contract';

/** Form taslağı: sayılar yazarken boş kalabilir, satırların kararlı anahtarı var (index değil). */
export type DraftOverride = { key: string; path: SeoRoutePath | ''; title: string; description: string; canonical: string };
export type DraftSitemap = { key: string; url: string; priority: string; changeFrequency: string; lastModified: string };
export type DraftGlobal = Omit<SeoGlobal, 'ogImageWidth' | 'ogImageHeight' | 'extraSitemapUrls'> & {
  ogImageWidth: string;
  ogImageHeight: string;
  extraSitemapUrls: DraftSitemap[];
};
export type Draft = { global: DraftGlobal; pageOverrides: DraftOverride[] };

let seq = 0;
export const rowKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function toDraft(p: SeoPayload): Draft {
  return {
    global: {
      ...p.global,
      ogImageWidth: String(p.global.ogImageWidth),
      ogImageHeight: String(p.global.ogImageHeight),
      extraSitemapUrls: p.global.extraSitemapUrls.map((e) => ({
        key: rowKey(),
        url: e.url,
        priority: e.priority != null ? String(e.priority) : '',
        changeFrequency: e.changeFrequency ?? '',
        lastModified: e.lastModified ?? '',
      })),
    },
    pageOverrides: p.pageOverrides.map((o) => ({
      key: rowKey(),
      path: o.path,
      title: o.title ?? '',
      description: o.description ?? '',
      canonical: o.canonical ?? '',
    })),
  };
}

const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.replace(',', '.')));

/** Taslağı şemanın beklediği ham yüke çevirir (doğrulama `parseSeoPayload` ile). */
export function fromDraft(d: Draft): unknown {
  return {
    global: {
      ...d.global,
      ogImageWidth: num(d.global.ogImageWidth),
      ogImageHeight: num(d.global.ogImageHeight),
      extraSitemapUrls: d.global.extraSitemapUrls.map((e) => ({
        url: e.url,
        ...(e.priority.trim() ? { priority: num(e.priority) } : {}),
        ...(e.changeFrequency ? { changeFrequency: e.changeFrequency } : {}),
        ...(e.lastModified ? { lastModified: e.lastModified } : {}),
      })),
    },
    pageOverrides: d.pageOverrides.map((o) => ({
      path: o.path,
      ...(o.title.trim() ? { title: o.title } : {}),
      ...(o.description.trim() ? { description: o.description } : {}),
      ...(o.canonical.trim() ? { canonical: o.canonical } : {}),
    })),
  };
}

/** Hata yolları form alanı kimliğine eşlenir: `global.siteUrl` → `seo-siteUrl`, satırlarda anahtar. */
export function validateDraft(d: Draft) {
  const r = parseSeoPayload(fromDraft(d));
  if (r.ok) return { ok: true as const, data: r.data, errors: {} as Record<string, string> };
  const errors: Record<string, string> = {};
  for (const e of r.errors) {
    const parts = e.path.split('.');
    let key = e.path;
    if (parts[0] === 'global' && parts[1] === 'extraSitemapUrls' && parts[2] != null) {
      const row = d.global.extraSitemapUrls[Number(parts[2])];
      key = `sitemap.${row?.key ?? parts[2]}.${parts[3] ?? 'url'}`;
    } else if (parts[0] === 'global') {
      key = parts[1];
    } else if (parts[0] === 'pageOverrides' && parts[1] != null) {
      const row = d.pageOverrides[Number(parts[1])];
      key = `override.${row?.key ?? parts[1]}.${parts[2] ?? 'path'}`;
    }
    if (!errors[key]) errors[key] = e.message;
  }
  return { ok: false as const, data: null, errors };
}

/** Taslak, kayıtlı yükle aynı mı (kirli durum). */
export function sameAsSaved(d: Draft, saved: SeoPayload): boolean {
  const r = parseSeoPayload(fromDraft(d));
  const a = r.ok ? r.data : fromDraft(d);
  return JSON.stringify(a) === JSON.stringify(saved);
}

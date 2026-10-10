/**
 * Yapılandırılmış veri (`application/ld+json`) — güvenli serileştirme.
 *
 * `JSON.stringify` tek başına `</script>` kaçışı yapmaz; içerik ileride DB/CMS'ten gelirse
 * XSS vektörü olur (blog_slug denetimi bulgu 5 güvenlik notu). `<`, `>`, `&` ve satır
 * ayırıcılar her zaman Unicode kaçışıyla yazılır.
 */
/** Tek ters bölü (satır ayırıcıların `\u…` kaçış dizisi için). */
const BS = String.fromCharCode(92);

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028))
    .join(`${BS}u2028`)
    .split(String.fromCharCode(0x2029))
    .join(`${BS}u2029`);
}

export interface CrumbLd {
  name: string;
  path: string;
}

/** BreadcrumbList — canonical ile AYNI tabandan (env `siteUrl` değil, SEO `canonicalBase`). */
export function breadcrumbLd(base: string, items: readonly CrumbLd[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.path === '/' ? base : `${base}${item.path}`,
    })),
  };
}

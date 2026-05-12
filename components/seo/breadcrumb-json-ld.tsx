import { getCanonicalUrl } from '@/lib/site-config';

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const itemListElement = items.map((item, i) => ({
    '@type': 'ListItem' as const,
    position: i + 1,
    name: item.name,
    item: getCanonicalUrl(item.path),
  }));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList' as const,
    itemListElement,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

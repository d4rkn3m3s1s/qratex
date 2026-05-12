import { sanitizeSeoString } from '@/lib/seo-settings';

interface WebPageJsonLdProps {
  name: string;
  description: string;
  url: string;
  type?: 'WebPage' | 'AboutPage';
}

/** Schema.org WebPage veya AboutPage JSON-LD; /guven, /kullanim-sartlari vb. sayfalarda kullanılır. */
export function WebPageJsonLd({ name, description, url, type = 'WebPage' }: WebPageJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': type,
    name: sanitizeSeoString(name),
    description: sanitizeSeoString(description),
    url,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

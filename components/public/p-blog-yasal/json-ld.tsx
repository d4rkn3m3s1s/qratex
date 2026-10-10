import { serializeJsonLd } from './serialize-json-ld';

export { breadcrumbLd, serializeJsonLd, type CrumbLd } from './serialize-json-ld';

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

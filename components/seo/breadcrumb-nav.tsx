import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbNavItem {
  name: string;
  path: string;
}

/** Görsel breadcrumb navigasyonu; public alt sayfalarda kullanılır. */
export function BreadcrumbNav({ items }: { items: BreadcrumbNavItem[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, i) => (
          <li key={item.path} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />}
            {i === items.length - 1 ? (
              <span className="font-medium text-foreground" aria-current="page">
                {item.name}
              </span>
            ) : (
              <Link
                href={item.path}
                className="rounded-sm ring-offset-background transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

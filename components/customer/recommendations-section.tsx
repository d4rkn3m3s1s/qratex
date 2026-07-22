'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkles, Store } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Recommendation = {
  productId: string;
  name: string;
  price: number | null;
  image: string | null;
  dealerId: string;
  dealerName: string;
  categoryName: string;
  reason: string;
};

/**
 * "Sen Seversin" — co-occurrence tabanlı ürün önerileri. Kendi verisini çeker.
 * Yeterli veri yoksa (yeni müşteri) hiç render etmez (sessizce gizlenir).
 * `explain=1` ile hibrit LLM başlık cümlesi de gelir.
 */
export function RecommendationsSection() {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [headline, setHeadline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/customer/recommendations?explain=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { hasData?: boolean; recommendations?: Recommendation[]; headline?: string | null } | null) => {
        if (cancelled || !data?.hasData) return;
        setItems(data.recommendations ?? []);
        setHeadline(data.headline ?? null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <Card className="rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 via-card/60 to-fuchsia-500/5 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          Sen Seversin
        </CardTitle>
        {headline ? <p className="mt-1 text-sm text-muted-foreground">{headline}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((rec) => (
            <Link
              key={rec.productId}
              href={`/customer/nearby?focus=${rec.dealerId}`}
              className="group flex gap-3 rounded-xl border border-border/50 bg-background/60 p-3 transition-all hover:border-primary/40 hover:shadow-md"
            >
              {rec.image ? (
                <Image
                  src={rec.image}
                  alt={rec.name}
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted text-2xl">🍽️</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold group-hover:text-primary">{rec.name}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Store className="h-3 w-3 shrink-0" />
                  {rec.dealerName}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">{rec.reason}</p>
              </div>
              {rec.price != null ? (
                <span className="shrink-0 self-start rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  ₺{rec.price}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

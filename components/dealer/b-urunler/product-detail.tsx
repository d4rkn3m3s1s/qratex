'use client';

import Link from 'next/link';
import { MessageSquareText, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/states';
import { KeyValueList, StatusBadge } from '@/components/ds/data';
import type { ProductDetailDto } from '@/lib/dealer/catalog/types';
import { useProductDetail } from './api';
import { dayLabel, priceLabel, ratingLabel, trend, weekLabel } from './format';

function Distribution({ dist }: { dist: ProductDetailDto['distribution'] }) {
  const total = dist.reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="qx-small text-fg-muted">Son 30 günde bu ürüne yazılmış değerlendirme yok.</p>;
  return (
    <ul className="space-y-1.5" aria-label="Son 30 gün puan dağılımı">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = dist[star - 1];
        const pct = Math.round((n / total) * 100);
        return (
          <li key={star} className="flex items-center gap-2">
            <span className="qx-caption qx-num w-8 shrink-0 text-fg-muted">{star} ★</span>
            <span className="h-2 flex-1 overflow-hidden rounded-chip bg-surface-3" aria-hidden>
              <span className={`block h-full rounded-chip ${star <= 2 ? 'bg-danger' : star === 3 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="qx-caption qx-num w-16 shrink-0 text-right text-fg-muted">
              {n} <span className="sr-only">değerlendirme,</span>(%{pct})
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Weekly({ weekly }: { weekly: ProductDetailDto['weekly'] }) {
  const max = Math.max(1, ...weekly.map((w) => w.consumptions));
  const any = weekly.some((w) => w.consumptions > 0);
  if (!any) return <p className="qx-small text-fg-muted">Son 8 haftada bu ürünle tüketim kaydı açılmadı.</p>;
  return (
    <figure>
      <div className="flex h-28 items-end gap-1.5" aria-hidden>
        {weekly.map((w) => (
          <div key={w.weekStart} className="flex h-full flex-1 flex-col justify-end">
            <div className="rounded-t-chip bg-brand/70" style={{ height: `${Math.max(w.consumptions > 0 ? 6 : 0, (w.consumptions / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden>
        {weekly.map((w, i) => (
          <span key={w.weekStart} className="qx-caption flex-1 truncate text-center text-fg-muted">
            {i % 2 === 1 || weekly.length <= 4 ? weekLabel(w.weekStart) : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Son 8 hafta, haftalık tüketim ve ortalama puan</caption>
        <thead>
          <tr>
            <th scope="col">Hafta başı</th>
            <th scope="col">Tüketim</th>
            <th scope="col">Ortalama puan</th>
          </tr>
        </thead>
        <tbody>
          {weekly.map((w) => (
            <tr key={w.weekStart}>
              <td>{weekLabel(w.weekStart)}</td>
              <td>{w.consumptions}</td>
              <td>{ratingLabel(w.avgRating)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="qx-caption mt-2 text-fg-muted">Haftalık tüketim (Pazartesi başlangıçlı, İstanbul saati)</figcaption>
    </figure>
  );
}

/** Ürün detayı: müşteri deneyimi (30 gün puan, dağılım, 8 haftalık tüketim, son yorumlar). */
export function ProductDetail({ productId }: { productId: string }) {
  const q = useProductDetail(productId);
  return (
    <QueryState query={q} skeleton="detail" error={{ title: 'Ürün detayı yüklenemedi' }}>
      {(d) => {
        const p = d.product;
        const t = trend(p.stats);
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={p.isActive ? 'Aktif' : 'Arşivde'} tone={p.isActive ? 'success' : 'neutral'} size="sm" />
              {p.isGlobal ? <StatusBadge label="Sistem ürünü" tone="info" size="sm" /> : null}
              <span className="qx-caption text-fg-muted">
                <span aria-hidden>{p.category.icon} </span>
                {p.category.name}
              </span>
            </div>
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- R2 alanı
              <img src={p.image} alt="" className="aspect-[16/9] w-full rounded-card border border-subtle object-cover" />
            ) : null}
            {p.description ? <p className="qx-body text-fg">{p.description}</p> : null}

            <KeyValueList
              items={[
                { label: 'Fiyat', value: priceLabel(p.priceMinor) },
                {
                  label: 'Tüketim (son 30 gün)',
                  value: (
                    <span>
                      {p.stats.consumptions30}
                      {t ? <span className="qx-caption text-fg-muted"> · {t.text}</span> : null}
                    </span>
                  ),
                },
                {
                  label: 'Ortalama puan (son 30 gün)',
                  value: p.stats.reviews30 > 0 ? `${ratingLabel(p.stats.avgRating30)} / 5 · ${p.stats.reviews30} değerlendirme` : 'Değerlendirme yok',
                },
                { label: '1–2 yıldızlı (son 30 gün)', value: String(p.stats.low30) },
                { label: 'Tüm zamanlar tüketim', value: String(d.consumptionsAllTime) },
                { label: 'Eklenme', value: dayLabel(p.createdAt) },
              ]}
            />

            <section aria-labelledby="pd-dist">
              <h3 id="pd-dist" className="qx-overline mb-2 text-fg-muted">
                Puan dağılımı · son 30 gün
              </h3>
              <Distribution dist={d.distribution} />
            </section>

            <section aria-labelledby="pd-week">
              <h3 id="pd-week" className="qx-overline mb-2 text-fg-muted">
                Haftalık tüketim · son 8 hafta
              </h3>
              <Weekly weekly={d.weekly} />
            </section>

            <section aria-labelledby="pd-rev">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="pd-rev" className="qx-overline text-fg-muted">
                  Son değerlendirmeler
                </h3>
                <Button asChild variant="ghost" className="min-h-11">
                  <Link href="/dealer/reviews">
                    <MessageSquareText className="mr-1.5 h-4 w-4" aria-hidden /> Tümü
                  </Link>
                </Button>
              </div>
              {d.recentReviews.length === 0 ? (
                <p className="qx-small text-fg-muted">Bu ürün için henüz değerlendirme yok.</p>
              ) : (
                <ul className="space-y-3">
                  {d.recentReviews.map((r) => (
                    <li key={r.id} className="rounded-control border border-subtle bg-surface-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="qx-small flex items-center gap-1 font-semibold text-fg">
                          <Star className="h-3.5 w-3.5" aria-hidden />
                          <span className="qx-num">{r.rating}</span>
                          <span className="sr-only"> / 5 yıldız</span>
                        </span>
                        <span className="qx-caption text-fg-muted">
                          {dayLabel(r.createdAt)}
                          {r.replied ? ' · yanıtlandı' : ''}
                        </span>
                      </div>
                      {r.text ? <p className="qx-small mt-1.5 line-clamp-4 text-fg">{r.text}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        );
      }}
    </QueryState>
  );
}

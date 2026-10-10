import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import type { WhyCopy } from './why-copy';

/**
 * Karşılaştırma (neden-qratex.md Bulgu 3, envanter #13/#14): tek veri, iki düzen.
 *  - md ve üstü: gerçek `<table>` — `<th scope="col">` sütun, `<th scope="row">` konu.
 *  - mobil: her satır kendi başlığıyla kart; iki değer etiketli (bağlamsız "Manuel/Yok" yok).
 * Klasik sütunda çarpı değil nötr "–" ikonu: iddia abartılmaz; anlam metinle verilir.
 */
export function ComparisonTable({ copy, brand }: { copy: WhyCopy['comparison']; brand: string }) {
  const caption = copy.caption.replace('{brand}', brand);
  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-subtle bg-surface-1/90 backdrop-blur-md md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-subtle bg-surface-2/60">
              <th scope="col" className="w-[22%] px-5 py-4 text-sm font-semibold text-fg-muted">
                {copy.colTopic}
              </th>
              <th scope="col" className="w-[42%] px-5 py-4 text-sm font-semibold text-brand">
                {brand}
              </th>
              <th scope="col" className="px-5 py-4 text-sm font-semibold text-fg-muted">
                {copy.colClassic}
              </th>
            </tr>
          </thead>
          <tbody>
            {copy.rows.map((row) => (
              <tr key={row.topic} className="border-b border-subtle last:border-b-0">
                <th scope="row" className="px-5 py-4 align-top text-sm font-semibold text-fg">
                  {row.topic}
                </th>
                <td className="px-5 py-4 align-top text-sm text-fg">
                  <span className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span>
                      {row.ours}
                      {row.trustLink ? <TrustLink label={copy.trustLinkLabel} /> : null}
                    </span>
                  </span>
                </td>
                <td className="px-5 py-4 align-top text-sm text-fg-muted">
                  <span className="flex items-start gap-2.5">
                    <Minus className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                    <span>{row.classic}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {copy.rows.map((row) => (
          <li key={row.topic} className="rounded-card border border-subtle bg-surface-1/90 p-4 backdrop-blur-md">
            <p className="font-semibold text-fg">{row.topic}</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-brand">{brand}</dt>
                  <dd className="text-fg">
                    {row.ours}
                    {row.trustLink ? <TrustLink label={copy.trustLinkLabel} /> : null}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Minus className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{copy.colClassic}</dt>
                  <dd className="text-fg-muted">{row.classic}</dd>
                </div>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function TrustLink({ label }: { label: string }) {
  return (
    <>
      {' '}
      <Link href="/guven" className="font-medium text-brand underline underline-offset-4 hover:no-underline">
        {label}
      </Link>
    </>
  );
}

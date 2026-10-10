import { DATA_PROCESSORS, PROCESSOR_BASIS_LABELS } from '@/lib/legal/processors';
import type { LegalCategoryRow } from '@/lib/legal/inventory-view';

/**
 * Yasal metin tabloları — mobilde kart listesi (yatay kaydırma yok), sm ve üstünde tablo.
 * Veriler saf kaynaklardan gelir: kişisel veri envanteri ve hizmet sağlayıcı listesi.
 */

function Lines({ items }: { items: readonly string[] }) {
  if (items.length === 1) return <>{items[0]}</>;
  return (
    <ul className="!list-none !space-y-1 !pl-0">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

const thCls = 'px-3 py-2 font-medium';
const tdCls = 'px-3 py-3 align-top';

/**
 * `legal`: veri grubu · hukuki sebep · saklama · silme talebinde (KVKK Aydınlatma Metni)
 * `privacy`: veri grubu (örnekler) · saklama (Gizlilik Politikası — sade özet)
 */
export function CategoryTable({ rows, variant }: { rows: readonly LegalCategoryRow[]; variant: 'legal' | 'privacy' }) {
  const caption =
    variant === 'legal'
      ? 'Kişisel veri grupları, hukuki sebepleri, saklama süreleri ve silme talebinde uygulanan işlem'
      : 'Kişisel veri grupları ve saklama süreleri';
  return (
    <>
      <ul className="!list-none !space-y-2 !pl-0 sm:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={r.category} className="rounded-control border border-border bg-surface-1 p-3 text-sm leading-6">
            <p className="font-semibold text-fg">{r.label}</p>
            <p className="mt-0.5 text-fg-muted">{r.examples}</p>
            {variant === 'legal' ? (
              <p className="mt-2">
                <span className="font-medium">Hukuki sebep: </span>
                {r.legalBases.join('; ')}
              </p>
            ) : null}
            <p className="mt-1">
              <span className="font-medium">Saklama: </span>
              {r.retention.join('; ')}
            </p>
            {variant === 'legal' ? (
              <p className="mt-1">
                <span className="font-medium">Silme talebinizde: </span>
                {r.onErase.join('; ')}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-control border border-border sm:block">
        <table className="w-full min-w-[40rem] text-left text-sm leading-6">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              <th scope="col" className={thCls}>Veri grubu</th>
              {variant === 'legal' ? <th scope="col" className={thCls}>Hukuki sebep (KVKK m.5)</th> : null}
              <th scope="col" className={thCls}>Saklama</th>
              {variant === 'legal' ? <th scope="col" className={thCls}>Silme talebinizde</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.category}>
                <th scope="row" className={`${tdCls} font-normal`}>
                  <p className="font-medium text-fg">{r.label}</p>
                  <p className="mt-1 text-xs leading-5 text-fg-muted">{r.examples}</p>
                </th>
                {variant === 'legal' ? (
                  <td className={tdCls}>
                    <Lines items={r.legalBases} />
                  </td>
                ) : null}
                <td className={tdCls}>
                  <Lines items={r.retention} />
                </td>
                {variant === 'legal' ? (
                  <td className={tdCls}>
                    <Lines items={r.onErase} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Hizmet sağlayıcılar: ad · amaç · veri · bölge · dayanak. */
export function ProcessorTable() {
  const caption = 'Hizmet sağlayıcılar, amaçları, eriştikleri veriler ve bulundukları bölge';
  return (
    <>
      <ul className="!list-none !space-y-2 !pl-0 sm:hidden" aria-label={caption}>
        {DATA_PROCESSORS.map((p) => (
          <li key={p.name} className="rounded-control border border-border bg-surface-1 p-3 text-sm leading-6">
            <p className="font-semibold text-fg">{p.name}</p>
            <p className="mt-0.5">{p.purpose}</p>
            <p className="mt-1 text-fg-muted">
              {p.data} · {p.location}
            </p>
            <p className="mt-1 text-xs text-fg-muted">{PROCESSOR_BASIS_LABELS[p.basis]}</p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-control border border-border sm:block">
        <table className="w-full min-w-[44rem] text-left text-sm leading-6">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              <th scope="col" className={thCls}>Sağlayıcı</th>
              <th scope="col" className={thCls}>Ne için</th>
              <th scope="col" className={thCls}>Hangi veri</th>
              <th scope="col" className={thCls}>Bölge</th>
              <th scope="col" className={thCls}>Dayanak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {DATA_PROCESSORS.map((p) => (
              <tr key={p.name}>
                <th scope="row" className={`${tdCls} font-medium text-fg`}>
                  {p.name}
                </th>
                <td className={tdCls}>{p.purpose}</td>
                <td className={tdCls}>{p.data}</td>
                <td className={tdCls}>{p.location}</td>
                <td className={tdCls}>{PROCESSOR_BASIS_LABELS[p.basis]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

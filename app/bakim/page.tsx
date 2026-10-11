import type { Metadata } from 'next';
import Link from 'next/link';
import { Construction } from 'lucide-react';
import { getMaintenanceState } from '@/lib/platform-settings/flags';
import type { MaintenanceState } from '@/lib/platform-settings/registry';

/**
 * Bakım ekranı. Bakım modu açıkken müşteri/bayi panelleri proxy tarafından buraya yönlenir
 * (lib/platform-settings/maintenance-edge.ts). Metin ve tahmini bitiş yöneticinin
 * /admin/settings → Bakım bölümünde yazdığı değerdir. DB okunamazsa genel metin gösterilir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kısa bir bakımdayız',
  robots: { index: false, follow: false },
};

function formatEnd(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export default async function MaintenancePage() {
  let state: MaintenanceState = { enabled: false, message: '', plannedEndAt: null };
  try {
    state = await getMaintenanceState();
  } catch {
    /* varsayılan metin */
  }
  const end = state.enabled ? formatEnd(state.plannedEndAt) : null;

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-surface-0 px-4 py-12 text-fg">
      <div className="w-full max-w-md rounded-card border border-border bg-surface-1 p-8 text-center shadow-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning-subtle text-warning" aria-hidden>
          <Construction className="h-7 w-7" />
        </span>
        {state.enabled ? (
          <>
            <h1 className="qx-h2 mt-5">Kısa bir bakımdayız</h1>
            <p className="qx-body mt-3 text-fg-muted">
              {state.message || 'Platformu iyileştirmek için kısa bir bakım yapıyoruz. Puanların ve kayıtların güvende; birazdan geri döneceğiz.'}
            </p>
            {end ? (
              <p className="qx-small mt-4 rounded-control bg-surface-muted px-3 py-2 text-fg">
                Tahmini dönüş: <strong>{end}</strong>
              </p>
            ) : null}
            <p className="qx-small mt-6 text-fg-muted">Bu sayfayı birkaç dakika sonra yenileyerek tekrar deneyebilirsin.</p>
          </>
        ) : (
          <>
            <h1 className="qx-h2 mt-5">Bakım tamamlandı</h1>
            <p className="qx-body mt-3 text-fg-muted">Her şey yeniden çalışıyor.</p>
          </>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/" className="qx-small inline-flex min-h-11 items-center justify-center rounded-control border border-border px-4 font-medium hover:bg-surface-muted">
            Ana sayfa
          </Link>
          {!state.enabled ? (
            <Link href="/customer" className="qx-small inline-flex min-h-11 items-center justify-center rounded-control bg-brand px-4 font-medium text-brand-fg">
              Panele dön
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { getThemeOverview, type ThemeOverview } from '@/lib/design-system/theme.server';
import { getChecklist, getPrefsSummary, type ChecklistData, type PrefsSummary } from '@/lib/design-system/a11y.server';
import type { DriftReport } from '@/lib/design-system/drift-scan';
import driftJson from '@/lib/data/design-drift.json';
import { DesignSystemShell } from '@/components/admin/a-tasarim-sistemi/design-system-shell';

/**
 * Admin → Tasarım Sistemi (/admin/design-system). Eski /admin/themes, /admin/design-language ve
 * /admin/accessibility buraya kalıcı yönlenir.
 *
 * Sunucu önce: yalnız açılan sekmenin verisi sunucuda okunur (rehber DB'ye hiç gitmez). Ön yükleme
 * düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene" gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tasarım Sistemi',
  description: "QDL v2 yaşayan rehberi, platform teması (önizle → yayınla, geçmiş) ve erişilebilirlik sağlığı.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminDesignSystemPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const tab = typeof sp.tab === 'string' ? sp.tab : 'rehber';
  let theme: ThemeOverview | null = null;
  let a11y: { prefs: PrefsSummary; checklist: ChecklistData } | null = null;

  // Sayfa proxy'de korunur (rol + gizli kapı); yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      if (tab === 'temalar') theme = await getThemeOverview();
      else if (tab === 'erisilebilirlik') {
        const [prefs, checklist] = await Promise.all([getPrefsSummary(), getChecklist()]);
        a11y = { prefs, checklist };
      }
    } catch (err) {
      console.error('[admin/design-system] sunucu ön yüklemesi başarısız:', err);
    }
  }

  return <DesignSystemShell theme={theme} a11y={a11y} drift={driftJson as DriftReport} />;
}

import type { Metadata } from 'next';
import { Workflow } from 'lucide-react';
import { PageHeader, PanelPage } from '@/components/ds/page';
import { UsersAutomationPanel } from '@/components/admin/users-automation-panel';

/**
 * Kullanıcı otomasyon kuralları — Kullanıcılar listesinin içindeki sekmeden ayrı sayfaya
 * taşındı (admin_users.md "Çakışmalar": liste sadeleşir). Kural yalnız kayıtlı ve başka bir
 * yöneticinin onayladığı haliyle çalışır; puan hareketleri defterden geçer.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Kullanıcı otomasyonu' };

export default function UsersAutomationPage() {
  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          back={{ href: '/admin/users', label: 'Kullanıcılar' }}
          title="Kullanıcı otomasyonu"
          description="Koşula uyan kullanıcılara kural tabanlı puan/XP/bildirim. Önce önizleme, sonra dört göz onayı."
          icon={<Workflow />}
        />
      }
    >
      <UsersAutomationPanel />
    </PanelPage>
  );
}

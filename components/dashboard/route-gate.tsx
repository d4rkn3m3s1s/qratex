'use client';

/**
 * Sayfa düzeyi erişim kapısı (bilgi mimarisi B11). Menü görünürlüğü yalnız menüyü değil
 * sayfayı da kapatır: yönetici bir bölümü (menü anahtarı ya da modül) kapattığında o sayfa
 * yer imi, bildirim ya da Qra yanıtıyla açılırsa yarım çalışan bir ekran (API 403) yerine
 * açık bir "şu anda kullanılamıyor" durumu ve ana sayfaya dönüş görülür.
 *
 * Karar sunucuda çözülen kabuk yapılandırmasından gelir (`ShellConfig.gate`, kayıt + ayarlar,
 * ek istek yok). Güvenlik kararı DEĞİLDİR — veriyi API'lerin modül kapısı korur; bu katman
 * kullanıcıya tutarlı bir sonuç gösterir.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { isRouteBlocked } from '@/lib/navigation/shell-config';
import { useBilingual, useShell } from './shell-context';

export function RouteGate({ children }: { children: ReactNode }) {
  const ctx = useShell();
  const pathname = usePathname() ?? '';
  const bl = useBilingual();
  const shell = ctx?.shell;
  if (!shell || !isRouteBlocked(shell.gate, pathname)) return <>{children}</>;
  return (
    <EmptyState
      variant="permission"
      icon={Lock}
      headingLevel="h2"
      title={bl({ tr: 'Bu bölüm şu anda kullanılamıyor', en: 'This section is currently unavailable' })}
      description={bl({
        tr: 'Yönetici bu bölümü geçici olarak kapattı. Diğer özellikleri kullanmaya devam edebilirsin.',
        en: 'An administrator has turned this section off for now. You can keep using everything else.',
      })}
      action={
        <Button asChild>
          <Link href={shell.homeHref}>{bl({ tr: 'Ana sayfaya dön', en: 'Back to home' })}</Link>
        </Button>
      }
    />
  );
}

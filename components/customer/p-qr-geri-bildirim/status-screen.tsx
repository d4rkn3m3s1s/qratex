/**
 * QR açılamadığında tam sayfa durum ekranı (sunucu bileşeni; JS gerektirmez).
 * Eski sayfa sunucunun ayrıntılı nedenini atıp "Bir hata oluştu" diyordu ve metinler EN modda
 * da Türkçeydi (envanter #3). Şimdi neden + ne yapılacağı, iki dilde; DB erişilemezse
 * "tekrar dene" (sayfayı yeniden ister).
 */
import Link from 'next/link';
import { AlertTriangle, QrCode, RotateCw } from 'lucide-react';
import type { VenueStatus } from '@/lib/feedback-funnel/venue';
import { getFunnelCopy, type FunnelLocale } from './copy';
import { btnPrimary, btnSecondary } from './button-styles';

export function FeedbackStatusScreen({
  status,
  locale,
  selfPath,
}: {
  status: Exclude<VenueStatus, 'ok'>;
  locale: FunnelLocale;
  selfPath: string;
}) {
  const copy = getFunnelCopy(locale);
  const unavailable = status === 'unavailable';
  const Icon = unavailable ? AlertTriangle : QrCode;
  return (
    <main id="main-content" className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <span
        aria-hidden
        className={
          unavailable
            ? 'flex h-16 w-16 items-center justify-center rounded-full bg-warning-subtle text-warning'
            : 'flex h-16 w-16 items-center justify-center rounded-full bg-surface-3 text-fg-muted'
        }
      >
        <Icon className="h-8 w-8" />
      </span>
      <div className="space-y-2">
        <h1 className="qx-h2 text-fg">{copy.statusTitle[status]}</h1>
        <p className="qx-body text-fg-muted">{copy.statusBody[status]}</p>
      </div>
      <div className="grid w-full gap-2">
        {unavailable ? (
          // Düz bağlantı: sunucu bileşeni yeniden istenir (istemci JS'i gerekmez).
          <a href={selfPath} className={btnPrimary}>
            <RotateCw aria-hidden className="h-4 w-4" />
            {copy.reload}
          </a>
        ) : (
          <Link href="/customer/scan" className={btnPrimary}>
            <QrCode aria-hidden className="h-4 w-4" />
            {copy.scanAgain}
          </Link>
        )}
        <Link href="/" className={btnSecondary}>
          {copy.goHome}
        </Link>
      </div>
    </main>
  );
}

/**
 * QR geri bildirim hunisi — kalite turu (p-qr-geri-bildirim).
 *
 *  - Durum ekranı: "Yeniden tara" (`/customer/scan`, CUSTOMER ister) yalnız müşteri
 *    oturumunda; anonim/bayi/personel girişe ya da kendi paneline atılıyordu (kırık eylem).
 *  - Tavan metni: kredi tavanı `startOfDayUTC` ile sayılır → sınır 00:00 UTC = 03:00 TSİ'de
 *    yenilenir; tavan dolunca XP de orantılı kısılır (mintPoints) → "XP kazanmaya devam"
 *    ve "gece yarısı" vaadi yanlıştı.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedbackStatusScreen } from '@/components/customer/p-qr-geri-bildirim/status-screen';
import { getFunnelCopy } from '@/components/customer/p-qr-geri-bildirim/copy';
import { startOfDayUTC, startOfWeekUTC } from '@/lib/timezone';

function render(props: React.ComponentProps<typeof FeedbackStatusScreen>): string {
  return renderToStaticMarkup(React.createElement(FeedbackStatusScreen, props));
}

describe('FeedbackStatusScreen — yeniden tara bağlantısı', () => {
  it('oturumsuz/müşteri olmayan görüntüleyende /customer/scan bağlantısı YOK, ana sayfa birincil', () => {
    const html = render({ status: 'inactive', locale: 'tr', selfPath: '/feedback/ABC' });
    expect(html).not.toContain('/customer/scan');
    expect(html).toContain('href="/"');
  });

  it('müşteri oturumunda /customer/scan bağlantısı var', () => {
    const html = render({ status: 'expired', locale: 'tr', selfPath: '/feedback/ABC', canScanInApp: true });
    expect(html).toContain('href="/customer/scan"');
  });

  it('bağlantı yok (unavailable) durumunda "tekrar dene" kendi yoluna gider, tara gösterilmez', () => {
    const html = render({ status: 'unavailable', locale: 'en', selfPath: '/feedback/ABC?segment=vip', canScanInApp: true });
    expect(html).toContain('href="/feedback/ABC?segment=vip"');
    expect(html).not.toContain('/customer/scan');
  });
});

describe('tavan metni gerçek sayım penceresiyle uyumlu', () => {
  const istanbulHour = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(d);

  it('günlük ve haftalık sınır 03:00 (TSİ) yenilenir', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    expect(istanbulHour(startOfDayUTC(now))).toBe('03');
    expect(istanbulHour(startOfWeekUTC(now))).toBe('03');
    expect(startOfWeekUTC(now).getUTCDay()).toBe(1);
    for (const locale of ['tr', 'en'] as const) {
      expect(getFunnelCopy(locale).cappedNote).toMatch(/03:00/);
    }
  });

  it('tavan dolunca XP verildiği iddia edilmez', () => {
    expect(getFunnelCopy('tr').cappedNote).not.toMatch(/XP kazanmaya devam/);
    expect(getFunnelCopy('en').cappedNote).not.toMatch(/keep earning XP/);
  });

  it('çevrimiçi kuyruk metni "çevrimdışısın" demez', () => {
    expect(getFunnelCopy('tr').successQueuedRetry).not.toMatch(/Çevrimdışısın/);
    expect(getFunnelCopy('en').successQueuedRetry).not.toMatch(/offline/i);
  });
});

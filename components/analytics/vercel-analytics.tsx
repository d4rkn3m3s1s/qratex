'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { redactUrl } from '@/lib/consent';

/**
 * Vercel Web Analytics + Speed Insights: çerezsiz ve kimliksiz ölçüm (Çerez Politikası'nda
 * listelenir). Gönderilen sayfa adresindeki giriş token'ları ve gizli parametreler
 * (`token`, `code`, `state`…) ile token taşıyan yol parçaları ayıklanır (P0-31).
 */
export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={(event) => ({ ...event, url: redactUrl(event.url) })} />
      <SpeedInsights beforeSend={(event) => ({ ...event, url: redactUrl(event.url) })} />
    </>
  );
}

'use client';

import { useEffect, type CSSProperties } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Root layout dışında patlayan hatalar (template/layout render hatası).
 * Kendi <html> / <body> bloklarını gerektirir.
 *
 * globals.css import EDİLMEZ: ayrı CSS chunk’ı üretir ve Next istemcisi
 * bu sayfada eşleşen <link> bulamayınca "No link element found for chunk … app_globals_*.css" verir.
 */
const shell: CSSProperties = {
  margin: 0,
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  fontFamily: 'system-ui, Segoe UI, sans-serif',
  background: '#0a0a0a',
  color: '#fafafa',
};

const muted: CSSProperties = { color: '#a3a3a3', fontSize: 14, lineHeight: 1.5 };

const btn: CSSProperties = {
  marginTop: 8,
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  background: '#e5e5e5',
  color: '#0a0a0a',
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary:', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="tr">
      <head>
        <meta name="color-scheme" content="dark" />
      </head>
      <body style={shell}>
        <main style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>Kritik hata</h1>
          <p style={muted}>
            Uygulama yüklenirken bir sorun oluştu. Sayfayı yenilemeyi deneyin.
          </p>
          <button type="button" onClick={reset} style={btn}>
            Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}

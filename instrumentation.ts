/**
 * Next.js instrumentation hook (P2-25).
 * Sentry server SDK loads only when a DSN is configured (smaller Vercel traces when Sentry is off).
 * Edge branch is no-op so Next emits edge-instrumentation.js (avoids ENOENT).
 */
function sentryDsn(): string | undefined {
  if (process.env.DISABLE_SENTRY_INSTRUMENTATION === '1') return undefined;
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (!sentryDsn()) return;
    const { initSentryServer } = await import('./sentry.server.config');
    await initSentryServer();
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    // No-op: edge route yok; Sentry edge kapatıldı. Dal boş bırakıldı ki Next edge-instrumentation.js üretsin.
  }
}

/**
 * Yakalanmamış sunucu hataları (route handler, sunucu bileşeni, server action) — mimari-api B4.
 * Next her yakalanmamış istek hatasında bunu çağırır; DSN yoksa SDK hiç yüklenmez.
 * `defineRoute` kendi merkezi catch'inde zaten `captureApiError` çağırır; bu kanca onun
 * dışında kalan (fabrika dışı route'lar, RSC render) hataları görünür kılar.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware' | 'proxy';
    renderSource?: string;
    revalidateReason?: 'on-demand' | 'stale' | undefined;
    renderType?: string;
  }
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!sentryDsn()) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureRequestError(error, request, context as Parameters<typeof Sentry.captureRequestError>[2]);
  } catch {
    /* gözlem kancası isteği asla etkilemez */
  }
}

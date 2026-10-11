/**
 * /feedback/[code] — QR geri bildirim hunisi (ürünün kalbi). SUNUCU bileşeni.
 *
 * `(funnel)` route grubunda: pazarlama header/footer'ı ve animasyonlu landing zemini YOK
 * (§4.4 ilke 11 — huni rotaları ≤ 150 KB gzip JS). Mekân, oturum, çıkar çatışması ve ödül
 * önizlemesi ilk HTML'de gelir (spinner → fetch → render şelalesi bitti); istemci adası
 * yalnız girdi, gönderim ve kutlamayı yönetir. Sayfa `noindex`.
 *
 * Sorgu: `?segment=<anahtar>` (bayinin karşılama metni), `utm_*`, `?src=in_app_<kaynak>`
 * (uygulama içi tarama atfı), `?claim=1` (giriş/kayıt dönüşü: bekleyen yorumu hesaba bağla).
 */
import type { Metadata } from 'next';
import { getServerLocale } from '@/lib/server-locale';
import { loadFeedbackVenue, isVenueInsider } from '@/lib/feedback-funnel/venue';
import { loadRewardPreview } from '@/lib/feedback-funnel/reward';
import { feedbackPhotosEnabled } from '@/lib/feedback-funnel/media';
import { homePathForRole, resolveOptionalViewer } from '@/lib/feedback-funnel/viewer';
import { isAttributionSource } from '@/lib/feedback-funnel/constants';
import type { AttributionInput } from '@/lib/feedback-funnel/schema';
import { FeedbackFunnel } from '@/components/customer/p-qr-geri-bildirim/feedback-funnel';
import { FeedbackStatusScreen } from '@/components/customer/p-qr-geri-bildirim/status-screen';
import { FunnelMomentHost } from '@/components/customer/p-qr-geri-bildirim/moment-host-lazy';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined, max = 120): string | undefined {
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  return t && t.length <= max ? t : undefined;
}

const UTM_RE = /^[\p{L}\p{N} ._:/@+-]{1,120}$/u;
const SEGMENT_RE = /^[A-Za-z0-9_-]{1,40}$/;

function readAttribution(sp: Record<string, string | string[] | undefined>): AttributionInput {
  const utm = (k: string) => {
    const v = first(sp[k]);
    return v && UTM_RE.test(v) ? v : undefined;
  };
  const segment = first(sp.segment, 40);
  const src = first(sp.src, 40);
  const utmSource = utm('utm_source');
  const utmCampaign = utm('utm_campaign');
  const utmMedium = utm('utm_medium');
  return {
    source: isAttributionSource(src) ? src : utmSource || utmCampaign ? 'link' : 'qr',
    ...(utmSource ? { utmSource } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
    ...(utmMedium ? { utmMedium } : {}),
    ...(segment && SEGMENT_RE.test(segment) ? { segment } : {}),
  };
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ code }, sp, locale] = await Promise.all([params, searchParams, getServerLocale()]);
  const lookup = await loadFeedbackVenue(code, first(sp.segment, 40) ?? null);
  const suffix = locale === 'en' ? 'Feedback' : 'Geri bildirim';
  return {
    title: lookup.status === 'ok' ? `${lookup.venue.businessName} — ${suffix}` : suffix,
    description:
      locale === 'en'
        ? lookup.status === 'ok' ? `Share your experience at ${lookup.venue.businessName} in under a minute.` : 'Share your experience in under a minute.'
        : lookup.status === 'ok' ? `${lookup.venue.businessName} deneyimini bir dakikadan kısa sürede paylaş.` : 'Deneyimini bir dakikadan kısa sürede paylaş.',
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  };
}

export default async function FeedbackPage({ params, searchParams }: PageProps) {
  const [{ code }, sp, rawLocale] = await Promise.all([params, searchParams, getServerLocale()]);
  const locale = rawLocale === 'en' ? 'en' : 'tr';
  const attribution = readAttribution(sp);
  const lookup = await loadFeedbackVenue(code, attribution.segment ?? null);

  const basePath = `/feedback/${encodeURIComponent(lookup.status === 'ok' ? lookup.venue.code : code)}`;
  const selfPath = attribution.segment ? `${basePath}?segment=${encodeURIComponent(attribution.segment)}` : basePath;

  if (lookup.status !== 'ok') {
    // DB erişilemezse oturum da doğrulanamaz; ek sorgu yapılmaz.
    const errViewer = lookup.status === 'unavailable' ? null : await resolveOptionalViewer();
    return (
      <FeedbackStatusScreen
        status={lookup.status}
        locale={locale}
        selfPath={selfPath}
        canScanInApp={errViewer?.role === 'CUSTOMER'}
      />
    );
  }
  const venue = lookup.venue;

  const viewer = await resolveOptionalViewer();
  const insider = viewer ? await isVenueInsider(viewer.userId, venue.dealerId).catch(() => false) : false;
  const preview = await loadRewardPreview(viewer, insider);

  return (
    <>
      <FeedbackFunnel
        venue={{
          code: venue.code,
          businessName: venue.businessName,
          logoUrl: venue.logoUrl,
          spotName: venue.spotName,
          locationName: venue.locationName,
          description: venue.description,
          welcomeText: venue.welcomeText,
          staff: venue.staff,
        }}
        viewer={{
          signedIn: !!viewer,
          role: viewer?.role ?? null,
          homePath: viewer ? homePathForRole(viewer.role) : null,
        }}
        preview={preview}
        photosEnabled={feedbackPhotosEnabled()}
        attribution={attribution}
        claimIntent={first(sp.claim, 4) === '1'}
        selfPath={selfPath}
      />
      <FunnelMomentHost enabled={!!viewer} />
    </>
  );
}

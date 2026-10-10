import type { VenueStaff } from '@/lib/feedback-funnel/venue';
import type { RewardPreview } from '@/lib/feedback-funnel/reward';
import type { AttributionInput } from '@/lib/feedback-funnel/schema';

/** Sunucunun istemci adasına verdiği mekân (yalnız gösterim alanları). */
export type FunnelVenue = {
  code: string;
  businessName: string;
  logoUrl: string | null;
  spotName: string | null;
  locationName: string | null;
  description: string | null;
  welcomeText: string | null;
  staff: VenueStaff[];
};

export type FunnelViewerInfo = {
  signedIn: boolean;
  role: 'CUSTOMER' | 'DEALER' | 'STAFF' | 'ADMIN' | null;
  /** Rolün kendi paneli (başarı ekranı bağlantısı). */
  homePath: string | null;
};

export type FeedbackFunnelProps = {
  venue: FunnelVenue;
  viewer: FunnelViewerInfo;
  preview: RewardPreview | null;
  photosEnabled: boolean;
  attribution: AttributionInput;
  /** `?claim=1` — giriş/kayıt dönüşü: bekleyen bağlamayı otomatik dene. */
  claimIntent: boolean;
  /** Sayfanın kendi yolu (giriş/kayıt `callbackUrl`'i). */
  selfPath: string;
};

/**
 * Birden çok ekranda aynı görünen marka gradyanı — `primary` + violet ucu.
 * `cn()` ile ek sınıflar (gap, boyut) birleştirin.
 */
export const TW_BRAND_CTA_BUTTON =
  'bg-gradient-to-r from-primary to-violet-600 text-white hover:from-primary/90 hover:to-violet-700';

/** FAB / avatar iç dolgusu — chatbot orb vb. */
export const TW_BRAND_ORB_FILL =
  'bg-gradient-to-br from-primary via-primary/80 to-violet-500';

/** Parlama halkası, şerit animasyonu, textarea glow — yatay gradyan */
export const TW_BRAND_AURA_LINEAR =
  'bg-gradient-to-r from-primary via-primary/80 to-violet-500';

/** Panel başlığı arka plan şeridi */
export const TW_BRAND_CHAT_HEADER_BG =
  'bg-gradient-to-r from-primary/20 via-primary/80/20 to-violet-500/20';

/** Hareket azaltılmış modda panel kabuğu */
export const TW_BRAND_PANEL_SHELL_SOFT =
  'bg-gradient-to-br from-primary/20 via-primary/80/15 to-violet-500/20';

/** Başlıkta gradient metin */
export const TW_BRAND_HEADLINE_GRADIENT =
  'bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent';

/** Avatar etrafı soluk mor halka */
export const TW_BRAND_AVATAR_HALO = 'bg-gradient-to-r from-primary to-primary/80';

/** Yuvarlak avatar çerçevesi / iç yüzey */
export const TW_BRAND_FACE_GRADIENT = 'bg-gradient-to-br from-primary to-primary/85';

/** Kullanıcı mesaj balonu */
export const TW_BRAND_USER_BUBBLE =
  'bg-gradient-to-br from-primary to-primary/85 text-white';

/** Küçük parçacık / yükleme noktası */
export const TW_BRAND_DOT = 'bg-gradient-to-r from-primary to-primary/80';

/** Gönder butonu (mor→mor soft, violet ucu yok) */
export const TW_BRAND_SEND_BTN =
  'bg-gradient-to-r from-primary to-primary/85 shadow-lg shadow-primary/25 hover:from-primary/90 hover:to-primary/85/90';

/**
 * Yalnızca Tailwind durakları — örn. `bg-gradient-to-br ${TW_BRAND_GRADIENT_STOPS_WIDE}` veya kart rozeti.
 */
export const TW_BRAND_GRADIENT_STOPS_WIDE = 'from-primary to-violet-600';
export const TW_BRAND_GRADIENT_STOPS_SOFT = 'from-primary to-violet-500';

/** Küçük şerit/rozet (tam `bg-gradient-to-r …`) */
export const TW_BRAND_GRADIENT_HORIZONTAL_STRONG =
  'bg-gradient-to-r from-primary to-violet-600';

/** Büyük hero blokları — journey vb. */
export const TW_BRAND_HERO_GRADIENT_BR =
  'bg-gradient-to-br from-primary via-primary/85 to-violet-600';

/** Hafif seçili yüzey / ikon kutusu — `cn(..., 'rounded-xl …')` ile birleştirin */
export const TW_BRAND_BG_SOFT_BR =
  'bg-gradient-to-br from-primary/20 to-violet-500/20';

/** İnce gri seçenek zemini — tema kartı pasif durum */
export const TW_BRAND_BG_SUBTLE_BR =
  'bg-gradient-to-br from-primary/5 to-violet-500/5';

/** Küçük PREMIUM / rozet şeridi */
export const TW_BRAND_BADGE_SOFT_PILL =
  'rounded-full bg-gradient-to-r from-primary/20 to-violet-500/20';

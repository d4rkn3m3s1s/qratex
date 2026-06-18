/**
 * Admin dönemsel konsept planlayıcısı için seçenek listeleri ve hazır şablonlar.
 * Arka plan ve tema değerleri gerçek sistemle (background-effect-shared,
 * theme-presets) uyumludur.
 */

/** Dönemsel konseptler için anlamlı arka plan efektleri (tam listenin alt kümesi). */
export const SEASONAL_BACKGROUND_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— Değiştirme —' },
  { value: 'christmas', label: '❄️ Yılbaşı / Kar' },
  { value: 'valentine', label: '💗 Sevgililer Günü' },
  { value: 'birthday', label: '🎉 Kutlama' },
  { value: 'sparkles', label: '✨ Işıltılar' },
  { value: 'fireflies', label: '🌟 Ateş Böcekleri' },
  { value: 'aurora', label: '🌌 Aurora' },
  { value: 'northern-lights', label: '🌠 Kuzey Işıkları' },
  { value: 'galaxy', label: '🪐 Galaksi' },
  { value: 'nebula', label: '☁️ Nebula' },
  { value: 'meteors', label: '☄️ Meteorlar' },
  { value: 'waves', label: '🌊 Dalgalar' },
];

/** Dönemsel konseptler için tema paleti seçenekleri (theme-presets anahtarları). */
export const SEASONAL_THEME_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— Değiştirme —' },
  { value: 'lava', label: '🔥 Lava (sıcak)' },
  { value: 'orange', label: '🍂 Turuncu (sonbahar)' },
  { value: 'arctic', label: '🧊 Arktik (kış)' },
  { value: 'forestNight', label: '🌲 Orman (ilkbahar)' },
  { value: 'green', label: '🌱 Yeşil' },
  { value: 'pink', label: '🌸 Pembe' },
  { value: 'royalGold', label: '👑 Altın' },
  { value: 'amethyst', label: '💜 Ametist' },
  { value: 'aurora', label: '🌈 Aurora' },
  { value: 'cyberpunk', label: '🌃 Cyberpunk' },
];

/** Tek tıkla doldurulabilen hazır konsept şablonları. */
export interface SeasonalTemplate {
  key: string;
  name: string;
  emoji: string;
  bannerText: string;
  backgroundEffect: string;
  themePresetId: string;
}

export const SEASONAL_TEMPLATES: SeasonalTemplate[] = [
  {
    key: 'summer',
    name: 'Yaz Festivali',
    emoji: '☀️',
    bannerText: 'Yaz Festivali başladı! Bol puan, sıcak sürprizler seni bekliyor.',
    backgroundEffect: 'waves',
    themePresetId: 'orange',
  },
  {
    key: 'winter',
    name: 'Kış Sezonu',
    emoji: '❄️',
    bannerText: 'Kış geldi! Sıcacık ödüller ve kar temalı sürprizler.',
    backgroundEffect: 'christmas',
    themePresetId: 'arctic',
  },
  {
    key: 'spring',
    name: 'İlkbahar',
    emoji: '🌸',
    bannerText: 'İlkbahar tazeliği! Yeni görevler çiçek açıyor.',
    backgroundEffect: 'fireflies',
    themePresetId: 'forestNight',
  },
  {
    key: 'halloween',
    name: 'Cadılar Bayramı',
    emoji: '🎃',
    bannerText: 'Cadılar Bayramı! Ürkütücü ödülleri toplamaya hazır mısın?',
    backgroundEffect: 'meteors',
    themePresetId: 'lava',
  },
  {
    key: 'newyear',
    name: 'Yılbaşı',
    emoji: '🎄',
    bannerText: 'Mutlu yıllar! Yeni yıl kampanyası ve sürpriz kutuları aktif.',
    backgroundEffect: 'christmas',
    themePresetId: 'royalGold',
  },
];
